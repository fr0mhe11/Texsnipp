import { EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { defaultKeymap } from "@codemirror/commands";
import defaultSnippetsRaw from "./snippet-engine/default_snippets.js?raw";
import { basicSetup } from "codemirror"; 
import { oneDark } from "@codemirror/theme-one-dark";
import { latex } from "codemirror-lang-latex";

import * as cmState from "@codemirror/state";
import * as cmView from "@codemirror/view";
import * as cmLanguage from "@codemirror/language";
import * as cmTooltip from "@codemirror/tooltip";
import * as cmCommands from "@codemirror/commands";

import { main } from "./snippet-engine/extension.ts";

const EditorStateProxy = new Proxy(cmState.EditorState, { get: (t, p) => p in t ? t[p] : cmState[p] });
const EditorViewProxy = new Proxy(cmView.EditorView, { get: (t, p) => p in t ? t[p] : cmView[p] });
const PrecProxy = new Proxy(cmState.Prec, { get: (t, p) => p === "fallback" ? t.lowest : p === "override" ? t.highest : t[p] });

const codemirror_objects = { ...cmState, ...cmView, ...cmLanguage, ...cmTooltip, ...cmCommands, EditorState: EditorStateProxy, EditorView: EditorViewProxy, Prec: PrecProxy };

const latexSuiteExtension = main(codemirror_objects);

let isSystemChangingContent = false;
let previewTimeout = null; 
let lastCompiledMath = ""; 
let wasInMathMode = false;
let lastMathEnterTime = 0;// 💡 수식 모드 진입 시간을 기록할 타이머 변수

const btnUndo = document.getElementById('btn-undo');
const btnRedo = document.getElementById('btn-redo');

const ideUpdateListener = EditorView.updateListener.of((update) => {
  if (update.docChanged || update.selectionSet) {
    const pos = update.state.selection.main.head;
    const line = update.state.doc.lineAt(pos);
    const col = pos - line.from + 1;
    document.getElementById('status-line-col').innerText = `Ln ${line.number}, Col ${col}`;

const text = update.state.doc.toString();
    const isInMath = !!extractMath(text, pos);

    // 💡 설정에서 '사용 안 함(off)' 이면 OS 전환을 완전히 차단!
    if (localStorage.getItem('latex-auto-ime') !== 'off') {
        if (isInMath && !wasInMathMode) {
            const textBeforeCursor = text.slice(line.from, pos);
            if (!textBeforeCursor.match(/\\(text|mathrm|textkr)\{([^}]*)$/)) {
                const engCode = localStorage.getItem('latex-ime-eng') || '1033';
                if (window.api && window.api.switchToEnglish) window.api.switchToEnglish(engCode); 
                
                lastMathEnterTime = Date.now();
            }
        } else if (!isInMath && wasInMathMode) {
            const korCode = localStorage.getItem('latex-ime-kor') || '1042';
            if (window.api && window.api.switchToKorean) window.api.switchToKorean(korCode); 
        }
    }
    wasInMathMode = isInMath;




    


    

    
    const canUndo = cmCommands.undoDepth(update.state) > 0;
    const canRedo = cmCommands.redoDepth(update.state) > 0;
    if(btnUndo) {
      btnUndo.style.opacity = canUndo ? '1' : '0.4';
      btnUndo.style.cursor = 'pointer'; 
    }
    if(btnRedo) {
      btnRedo.style.opacity = canRedo ? '1' : '0.4';
      btnRedo.style.cursor = 'pointer'; 
    }

    if (update.docChanged) {
      if (!isSystemChangingContent && activeTabIndex !== -1 && tabs[activeTabIndex] && !tabs[activeTabIndex].isMedia) {
        if (!tabs[activeTabIndex].isDirty) { tabs[activeTabIndex].isDirty = true; renderTabs(); }
      }
      clearTimeout(window.outlineTimeout);
      window.outlineTimeout = setTimeout(updateOutline, 800); 
    }

    clearTimeout(previewTimeout);
    previewTimeout = setTimeout(() => { checkAndPreviewMath(pos); }, 250); 
  }
});

// ==========================================
// 🚀 에디터 화면 우클릭 메뉴 로직
// ==========================================
const editorContextMenu = document.getElementById('editor-context-menu');

// 에디터 컨테이너에서 우클릭 감지
document.getElementById('editor-container').addEventListener('contextmenu', (e) => {
  e.preventDefault();
  e.stopPropagation(); // 트리 메뉴와 겹치지 않게 이벤트 전파 방지

  // 마우스 클릭 위치에 에디터 전용 메뉴 띄우기
  editorContextMenu.style.display = 'flex';
  editorContextMenu.style.left = e.clientX + 'px';
  editorContextMenu.style.top = e.clientY + 'px';
});

// --- 각 메뉴 기능 연결 ---

// 1. Undo
document.getElementById('ctx-editor-undo').onclick = () => {
  cmCommands.undo({ state: view.state, dispatch: (tr) => view.dispatch(tr) });
  view.focus(); 
};

// 2. Redo
document.getElementById('ctx-editor-redo').onclick = () => {
  cmCommands.redo({ state: view.state, dispatch: (tr) => view.dispatch(tr) });
  view.focus();
};

// 3. Cut (잘라내기)
document.getElementById('ctx-editor-cut').onclick = async () => {
  const selection = view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to);
  if (selection) {
    await navigator.clipboard.writeText(selection);
    view.dispatch(view.state.replaceSelection("")); 
  }
  view.focus();
};

// 4. Copy (복사)
document.getElementById('ctx-editor-copy').onclick = async () => {
  const selection = view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to);
  if (selection) await navigator.clipboard.writeText(selection);
  view.focus();
};

// 5. Paste (붙여넣기)
document.getElementById('ctx-editor-paste').onclick = async () => {
  try {
    const text = await navigator.clipboard.readText();
    if (text) view.dispatch(view.state.replaceSelection(text));
  } catch (err) {
    console.error("클립보드 읽기 실패:", err);
  }
  view.focus();
};

// 6. Select All (전체 선택)
document.getElementById('ctx-editor-selectall').onclick = () => {
  cmCommands.selectAll({ state: view.state, dispatch: (tr) => view.dispatch(tr) });
  view.focus();
};


function extractMath(text, pos) {
  const windowSize = 3500;
  const startIdx = Math.max(0, pos - windowSize);
  const endIdx = Math.min(text.length, pos + windowSize);
  const searchWindow = text.substring(startIdx, endIdx);
  const localPos = pos - startIdx; 

  // 🚀 [스니펫 정규식 이식] 빈 수식($$, $$$$) 및 모든 종류의 수학 환경 완벽 감지
  const mathRegex = /(\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|\\begin\{(?!(?:document|figure|table|itemize|enumerate|center|minipage)\b)([^}]+)\}[\s\S]*?\\end\{\2\}|\$[^$\n]*\$)/g;
  
  let match;
  while ((match = mathRegex.exec(searchWindow)) !== null) {
    const start = match.index;
    const matchStr = match[0];
    const end = start + matchStr.length;
    
    let delimStartLen = 1;
    let delimEndLen = 1;

    // 💡 수식 기호의 종류에 따라 '껍데기(구분자)'의 길이를 정확하게 계산합니다.
    if (matchStr.startsWith('$$') && matchStr.length >= 4) {
      delimStartLen = 2; delimEndLen = 2; // Display math: $$$$
    } else if (matchStr.startsWith('\\begin')) {
      delimStartLen = matchStr.indexOf('}') + 1; // \begin{...} 의 길이
      const endMatch = matchStr.match(/\\end\{[^}]+\}$/);
      delimEndLen = endMatch ? endMatch[0].length : 0; // \end{...} 의 길이
    } else if (matchStr.startsWith('\\[')) {
      delimStartLen = 2; delimEndLen = 2; // \[ 와 \]
    } else if (matchStr.startsWith('\\(')) {
      delimStartLen = 2; delimEndLen = 2; // \( 와 \)
    } else if (matchStr.startsWith('$')) {
      delimStartLen = 1; delimEndLen = 1; // Inline math: $$ 
    }

    // 💡 껍데기를 밟고 있는 게 아니라, 정확히 껍데기 "안쪽"에 진입했을 때만 내부로 판정!
    if (localPos >= start + delimStartLen && localPos <= end - delimEndLen) {
      return matchStr;
    }
  }
  return null; 
}






// ==========================================
// 🛡️ 한/영 즉시 변환 필터 (Race Condition 방어용)
// ==========================================
const KOR_TO_ENG = {"ㄱ":"r","ㄲ":"R","ㄳ":"rt","ㄴ":"s","ㄵ":"sw","ㄶ":"sg","ㄷ":"e","ㄸ":"E","ㄹ":"f","ㄺ":"fr","ㄻ":"fa","ㄼ":"fq","ㄽ":"ft","ㄾ":"fx","ㄿ":"fv","ㅀ":"fg","ㅁ":"a","ㅂ":"q","ㅃ":"Q","ㅄ":"qt","ㅅ":"t","ㅆ":"T","ㅇ":"d","ㅈ":"w","ㅉ":"W","ㅊ":"c","ㅋ":"z","ㅌ":"x","ㅍ":"v","ㅎ":"g","ㅏ":"k","ㅐ":"o","ㅑ":"i","ㅒ":"O","ㅓ":"j","ㅔ":"p","ㅕ":"u","ㅖ":"P","ㅗ":"h","ㅘ":"hk","ㅙ":"ho","ㅚ":"hl","ㅛ":"y","ㅜ":"n","ㅝ":"nj","ㅞ":"np","ㅟ":"nl","ㅠ":"b","ㅡ":"m","ㅢ":"ml","ㅣ":"l"};

const autoEngFilter = EditorState.transactionFilter.of(tr => {
    // 💡 1. 설정 창에서 '사용 안 함'으로 했으면 필터 즉시 종료
    if (localStorage.getItem('latex-auto-ime') === 'off') return tr; 

    // 문서가 안 바뀌었거나 시스템 변경 중이면 통과
    if (!tr.docChanged || isSystemChangingContent) return tr;

    // 🚀 2. [1초 고스트 방어막] 수식에 진입한 지 1초(1000ms)가 지났다면 방어막 해제!
    // 사용자가 의도적으로 한글을 치고 싶어 하는 상태이므로 에디터가 개입하지 않습니다.
    if (typeof lastMathEnterTime !== 'undefined' && lastMathEnterTime > 0 && (Date.now() - lastMathEnterTime > 1000)) {
        return tr; 
    }

    let hasKorean = false;
    tr.changes.iterChanges((fA, tA, fB, tB, ins) => { if (/[ㄱ-ㅎㅏ-ㅣ가-힣]/.test(ins.toString())) hasKorean = true; });
    if (!hasKorean) return tr;

    let shouldConvert = false;
    tr.changes.iterChanges((fA) => {
        const docStr = tr.startState.doc.toString();
        if (extractMath(docStr, fA)) {
            const textBefore = docStr.slice(0, fA);
            if (!textBefore.match(/\\(text|mathrm|textkr)\{([^}]*)$/)) shouldConvert = true;
        }
    });
    if (!shouldConvert) return tr;

    let newChanges = [];
    tr.changes.iterChanges((fA, tA, fB, tB, ins) => {
        let text = ins.toString(), newText = "";
        for(let i=0; i<text.length; i++) {
            let c = text[i], code = c.charCodeAt(0);
            if (code >= 0xAC00 && code <= 0xD7A3) {
                code -= 0xAC00; let jong = code % 28, jung = ((code - jong) / 28) % 21, cho = Math.floor(((code - jong) / 28) / 21);
                const CHO = ["r","R","s","e","E","f","a","q","Q","t","T","d","w","W","c","z","x","v","g"], JUNG = ["k","o","i","O","j","p","u","P","h","hk","ho","hl","y","n","nj","np","nl","b","m","ml","l"], JONG = ["","r","R","rt","s","sw","sg","e","f","fr","fa","fq","ft","fx","fv","fg","a","q","qt","t","T","d","w","c","z","x","v","g"];
                newText += CHO[cho] + JUNG[jung] + JONG[jong];
            } else { newText += KOR_TO_ENG[c] || c; }
        }
        newChanges.push({from: fA, to: tA, insert: newText});
    });
    return { changes: newChanges, selection: tr.newSelection, effects: tr.effects };
});










async function checkAndPreviewMath(pos) {
  // 🚀 핵심 방어 1: 타자를 빨리 칠 때 이전 렌더링 결과가 뒤늦게 화면을 덮어쓰는 것(레이스 컨디션)을 방지
  checkAndPreviewMath.renderId = (checkAndPreviewMath.renderId || 0) + 1;
  const myRenderId = checkAndPreviewMath.renderId;

  const previewStyle = localStorage.getItem('latex-preview-style') || 'cursor'; 
  const previewEngine = localStorage.getItem('latex-preview-engine') || 'katex'; 
  const previewBox = document.getElementById('math-preview-container');
  const previewBody = document.getElementById('math-preview-body'); 
  const previewFrame = document.getElementById('math-preview-frame');
  const katexBox = document.getElementById('math-preview-katex');
  const previewHeader = document.getElementById('math-preview-header');
  
  if (previewStyle === 'off') {
      lastCompiledMath = ""; 
      if(previewBox) previewBox.style.display = 'none'; 
      return;
  }

  const text = getEditorContent();
  const mathContent = extractMath(text, pos);

  if (mathContent) {
      if (mathContent === lastCompiledMath) {
          if(previewBox) previewBox.style.display = 'flex';
          return;
      }
      lastCompiledMath = mathContent;

      const updateCursorPosition = (exactWidth, exactHeight) => {
          if (previewStyle === 'cursor' && previewBox) {
              const coords = view.coordsAtPos(pos);
              const parentPanel = document.getElementById('left-panel');
              const parentRect = parentPanel.getBoundingClientRect();
              if (coords) {
                  let pLeft = coords.left - parentRect.left;
                  let pTop = coords.bottom - parentRect.top + 10;
                  if (pLeft + exactWidth > parentRect.width) pLeft = parentRect.width - exactWidth - 10; 
                  if (pTop + exactHeight > parentRect.height) pTop = coords.top - parentRect.top - exactHeight - 10; 
                  
                  // 💡 HTML에서 bottom을 지웠기 때문에, JS에서 left와 top만 주면 절대 상자가 찢어지지 않습니다!
                  previewBox.style.left = Math.max(0, pLeft) + 'px'; 
                  previewBox.style.top = Math.max(0, pTop) + 'px';
                  previewBox.style.bottom = 'auto'; 
                  previewBox.style.right = 'auto';  
              }
          }
      };

      if(previewBox) {
          previewBox.style.display = 'flex';
          previewBox.style.opacity = '0.5';

          if (previewStyle === 'cursor') {
              if(previewHeader) previewHeader.style.display = 'none';
              updateCursorPosition(previewBox.offsetWidth || 200, previewBox.offsetHeight || 50);
          } else {
              // 💡 드래그 모드일 때 사용자가 위치를 옮긴 적이 없다면 우측 하단으로 초기화
              if (!previewBox.style.left || previewBox.style.left === 'auto') {
                  previewBox.style.top = 'auto';
                  previewBox.style.left = 'auto';
                  previewBox.style.bottom = '40px';
                  previewBox.style.right = '20px';
              }
              if(previewHeader) {
                  previewHeader.style.display = 'block';
                  previewHeader.innerText = previewEngine === 'katex' ? "👀 수식 Preview (KaTeX)" : "👀 수식 Preview (pdflatex)";
                  previewHeader.style.position = 'relative'; 
                  previewHeader.style.zIndex = '10';
              }
          }
          previewBox.style.width = 'max-content';
          previewBox.style.height = 'max-content';
      }

      if (previewEngine === 'katex') {
          previewFrame.style.display = 'none';
          if(katexBox) katexBox.style.display = 'flex';

          let cleanMath = mathContent;
          let isDisplay = false;
          if (cleanMath.startsWith('$$') && cleanMath.endsWith('$$')) { cleanMath = cleanMath.slice(2, -2); isDisplay = true; } 
          else if (cleanMath.startsWith('\\[') && cleanMath.endsWith('\\]')) { cleanMath = cleanMath.slice(2, -2); isDisplay = true; }
          else if (cleanMath.startsWith('$') && cleanMath.endsWith('$')) { cleanMath = cleanMath.slice(1, -1); }

          try {
              if(window.katex) {
                  katexBox.innerHTML = window.katex.renderToString(cleanMath, { throwOnError: false, displayMode: isDisplay });
              }
              previewBody.style.width = 'max-content';
              previewBody.style.height = 'max-content';
              previewBody.style.aspectRatio = 'unset';

              setTimeout(() => { 
                  if (myRenderId !== checkAndPreviewMath.renderId) return; // 최신 렌더링이 아니면 버림
                  updateCursorPosition(previewBox.offsetWidth, previewBox.offsetHeight);
                  previewBox.style.opacity = '1'; 
              }, 0);
          } catch(e) { 
              if (myRenderId === checkAndPreviewMath.renderId) previewBox.style.opacity = '1'; 
          }
          return; 
      }

      // pdflatex 엔진 로직
      if(katexBox) katexBox.style.display = 'none';
      previewFrame.style.display = 'block';

      let tightMathContent = mathContent;
      if (tightMathContent.startsWith('$$') && tightMathContent.endsWith('$$')) tightMathContent = '$\\displaystyle ' + tightMathContent.slice(2, -2) + '$';
      else if (tightMathContent.startsWith('\\[') && tightMathContent.endsWith('\\]')) tightMathContent = '$\\displaystyle ' + tightMathContent.slice(2, -2) + '$';

      const docMatch = text.match(/([\s\S]*?)\\begin\{document\}/);
      let preamble = docMatch ? docMatch[1] : '\\documentclass{article}';
      
      const ignoreStr = localStorage.getItem('latex-preview-ignore-packages');
      const activeIgnoreStr = ignoreStr !== null ? ignoreStr : "tikz, pgfplots, geometry, hyperref, fancyhdr, titlesec, tcolorbox, xcolor";
      const ignorePkgs = activeIgnoreStr.split(',').map(p => p.trim()).filter(p => p);
      
      if (ignorePkgs.length > 0) {
          const regex = /\\usepackage(?:\[[^\]]*\])?\{([^}]+)\}/g;
          preamble = preamble.replace(regex, (match, pkgs) => {
              const pkgList = pkgs.split(',').map(p => p.trim());
              const filtered = pkgList.filter(p => !ignorePkgs.includes(p));
              if (filtered.length === 0) return ''; 
              const optMatch = match.match(/\\usepackage(\[[^\]]*\])?/);
              const opt = optMatch && optMatch[1] ? optMatch[1] : '';
              return `\\usepackage${opt}{${filtered.join(',')}}`; 
          });
      }
      
      try {
          const previewTimeout = parseInt(localStorage.getItem('latex-timeout-preview') || '3');
          const result = await window.api.previewMath(preamble, tightMathContent, previewTimeout);
          
          if (myRenderId !== checkAndPreviewMath.renderId) return; // 💡 최신 타이핑 결과가 아니면 가차 없이 버림

          const pdfBase64 = result.pdfBase64; 
          let pdfWidth = result.width || 200;
          let pdfHeight = result.height || 50;
          
          // 🚀 핵심 방어 2: pdflatex가 문법 오류로 크롭에 실패하여 거대한 A4 용지를 뱉어낸 경우, 
          // 하얀 기둥을 띄우지 않고 깔끔하게 에러(컴파일 실패)로 처리합니다!
          if (pdfHeight > 750 || pdfWidth > 550) {
              throw new Error("Preview crop failed (A4 size detected)");
          }
          
          const zoom = 2.0; 
          let exactWidth = pdfWidth * zoom;
          let exactHeight = pdfHeight * zoom;

          const maxWidth = window.innerWidth * 0.8;
          const maxHeight = window.innerHeight * 0.6;

          if (previewStyle !== 'cursor') {
              if (exactWidth < 180) {
                  const scaleRatio = 180 / exactWidth;
                  exactWidth = 180; 
                  exactHeight = exactHeight * scaleRatio; 
              }
          }

          if (exactWidth > maxWidth) {
              const ratio = maxWidth / exactWidth;
              exactWidth = maxWidth;
              exactHeight = exactHeight * ratio;
          }
          if (exactHeight > maxHeight) {
              const ratio = maxHeight / exactHeight;
              exactHeight = maxHeight;
              exactWidth = exactWidth * ratio;
          }

          previewBody.style.width = exactWidth + 'px';
          previewBody.style.height = exactHeight + 'px';
          previewBody.style.aspectRatio = 'unset';

          updateCursorPosition(exactWidth, exactHeight);

          previewFrame.src = `data:application/pdf;base64,${pdfBase64}#toolbar=0&navpanes=0&scrollbar=0&view=Fit`;
          previewFrame.onload = () => { previewBox.style.opacity = '1'; }; 
          
      } catch(e) { 
          if (myRenderId !== checkAndPreviewMath.renderId) return;
          
          if(previewBox) previewBox.style.opacity = '1'; 
          if(previewFrame) previewFrame.style.display = 'none';
          if(katexBox) {
              katexBox.style.display = 'flex';
              katexBox.innerHTML = '<div style="color: #e06c75; font-size: 13px; font-weight: bold; text-align: center; padding: 10px;">⚠️ 컴파일 실패<br><span style="font-size: 11px; color: #5c6370; font-weight: normal;">(문법 오류 확인)</span></div>';
          }
          if(previewBody) {
              previewBody.style.width = 'max-content';
              previewBody.style.height = 'max-content';
              previewBody.style.aspectRatio = 'unset';
          }
          setTimeout(() => { updateCursorPosition(previewBox.offsetWidth, previewBox.offsetHeight); }, 0);
      }

  } else {
      lastCompiledMath = ""; 
      if(previewBox) previewBox.style.display = 'none'; 
  }
}






document.addEventListener('DOMContentLoaded', () => {
  const previewBox = document.getElementById('math-preview-container');
  const previewHeader = document.getElementById('math-preview-header');
  const pdfFrame = document.getElementById('pdf-preview');
  let isDraggingPreview = false, offsetX, offsetY;
  
  if(previewHeader) {
    previewHeader.onmousedown = (e) => {
        if (localStorage.getItem('latex-preview-style') === 'cursor') return; 
        isDraggingPreview = true;
        const boxRect = previewBox.getBoundingClientRect();
        offsetX = e.clientX - boxRect.left;
        offsetY = e.clientY - boxRect.top;
        if (pdfFrame) pdfFrame.style.pointerEvents = 'none'; 
    };
  }
  
  document.addEventListener('mousemove', (e) => {
      if (!isDraggingPreview || !previewBox) return;
      const parentPanel = document.getElementById('left-panel');
      const parentRect = parentPanel.getBoundingClientRect();
      
      let newLeft = e.clientX - parentRect.left - offsetX;
      let newTop = e.clientY - parentRect.top - offsetY;

      const maxLeft = parentRect.width - previewBox.offsetWidth;
      const maxTop = parentRect.height - previewBox.offsetHeight;

      if (newLeft < 0) newLeft = 0;
      if (newTop < 0) newTop = 0;
      if (newLeft > maxLeft) newLeft = maxLeft;
      if (newTop > maxTop) newTop = maxTop;

      previewBox.style.left = newLeft + 'px';
      previewBox.style.top = newTop + 'px';
      previewBox.style.bottom = 'auto'; 
      previewBox.style.right = 'auto';
  });
  
  document.addEventListener('mouseup', () => {
      isDraggingPreview = false;
      if (pdfFrame) pdfFrame.style.pointerEvents = 'auto'; 
  });
});

const myEditorExtensions = [
  basicSetup,
  oneDark,
  keymap.of(defaultKeymap),
  keymap.of([cmCommands.indentWithTab]),
  latex(),
  latexSuiteExtension,
  ideUpdateListener, 
  autoEngFilter,
  EditorView.theme({
    "&": { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, width: "100%", height: "100%" },
    ".cm-scroller": { overflow: "auto", width: "100%", height: "100%" }
  })
];

const view = new EditorView({
  state: EditorState.create({
    doc: "",
    extensions: myEditorExtensions 
  }),
  parent: document.getElementById("editor-container")
});

// ==========================================
// 🗂️ 탭 & 세션 로직
// ==========================================

// ==========================================
// 🗂️ 탭 & 세션 로직
// ==========================================
let tabs = []; 
let activeTabIndex = -1; 
let isClosingAnyTab = false; // 💡 탭 닫기 전역 잠금 (하나 닫는 동안 모든 클릭 무시)



function setEditorContent(text) { 
  isSystemChangingContent = true;
  const newState = EditorState.create({
    doc: text,
    extensions: myEditorExtensions 
  });
  view.setState(newState); 
  isSystemChangingContent = false;
}

function getEditorContent() { return view.state.doc.toString(); }

document.getElementById('resizer-pdf').addEventListener('mousedown', (e) => { 
  if (!isPdfVisible || e.target.id === 'btn-toggle-pdf-resizer') return; 
  enableResizing((eMove) => { 
    const minPdfWidth = 300;
    const minEditorWidth = 400;
    const maxW = window.innerWidth - sidebar.offsetWidth - minPdfWidth; 
    
    let newW = eMove.clientX - sidebar.offsetWidth - 5; 
    if (newW < minEditorWidth) newW = minEditorWidth; 
    if (newW > maxW) newW = maxW; 
    
    leftPanel.style.flex = 'none'; 
    leftPanel.style.width = newW + 'px'; 
  }); 
});

function switchTab(index) {
  if (activeTabIndex !== -1 && tabs[activeTabIndex] && !tabs[activeTabIndex].isMedia) {
      tabs[activeTabIndex].content = getEditorContent();
      tabs[activeTabIndex].cmState = view.state; 
  }
  activeTabIndex = index;
  
  const editorBox = document.getElementById('editor-container');
  const mediaBox = document.getElementById('media-viewer');
  const statusFilename = document.getElementById('status-filename');

  if (activeTabIndex !== -1) {
    const currentTab = tabs[activeTabIndex];
    statusFilename.innerText = currentTab.path ? currentTab.path.split(/[/\\]/).pop() : 'Untitled';
    
    if (currentTab.isMedia) {
      editorBox.style.display = 'none'; mediaBox.style.display = 'flex';
      mediaBox.innerHTML = currentTab.path.endsWith('.pdf') ? `<iframe src="file://${currentTab.path}" style="width:100%; height:100%; border:none;"></iframe>` : `<img src="file://${currentTab.path}" style="max-width:100%; max-height:100%; object-fit:contain; margin-top: 20px;">`;
      document.getElementById('outline-list').innerHTML = ''; 
    } else {
      editorBox.style.display = 'flex'; mediaBox.style.display = 'none';
      
      if (currentTab.cmState) {
          isSystemChangingContent = true;
          view.setState(currentTab.cmState);
          isSystemChangingContent = false;
      } else {
          setEditorContent(currentTab.content);
      }
      updateOutline(); 

      setTimeout(() => { 
          view.requestMeasure(); 
          window.dispatchEvent(new Event('resize')); 
      }, 50);
    }
  } else {
    editorBox.style.display = 'none'; mediaBox.style.display = 'flex'; 
    statusFilename.innerText = '파일을 열어주세요';
    document.getElementById('outline-list').innerHTML = '';
    mediaBox.innerHTML = '<div style="margin: auto; color: #5c6370; font-size: 20px; font-weight: bold; user-select: none; text-align: center;">파일을 열거나 생성해주세요<br><br><span style="font-size: 14px; font-weight: normal;">(왼쪽 파일 트리에서 마우스 우클릭)</span></div>';
    setEditorContent(""); 
  }
  renderTabs();
}

function addNewTab(filePath = null, content = "% 새 문서를 작성하세요!\n\\documentclass{article}\n\\begin{document}\n\nHello, LaTeX!\n\n\\end{document}", isMedia = false) {
  tabs.push({ path: filePath, content: content, lastSavedContent: content, isMedia: isMedia, isDirty: false });
  switchTab(tabs.length - 1); 
}

async function closeTab(index) {
  if (tabs[index].isDirty) {
    if (activeTabIndex !== index) switchTab(index); 
    const result = await window.api.askSave(tabs[index].path);
    
    if (result === 2) return; 
    if (result === 0) { 
      let savePath = tabs[index].path;
      if (!savePath) savePath = await window.api.saveFile();
      if (!savePath) return; 
      tabs[index].content = getEditorContent();
      await window.api.writeFile(savePath, tabs[index].content);
      tabs[index].isDirty = false;
    }
  }

  const isActiveTabClosed = (activeTabIndex === index); 
  tabs.splice(index, 1); 

  if (tabs.length === 0) {
    activeTabIndex = -1; 
    switchTab(-1); 
  } else {
    if (isActiveTabClosed) {
      activeTabIndex = -1; 
      switchTab(Math.max(0, index - 1));
    } else {
      if (activeTabIndex > index) {
        activeTabIndex--; 
      }
      renderTabs();
    }
  }
}

function saveSession() {
  if (activeTabIndex !== -1 && tabs[activeTabIndex] && !tabs[activeTabIndex].isMedia) {
      tabs[activeTabIndex].content = getEditorContent(); 
  }
  
  const safeTabs = tabs.map(tab => {
      if (tab.path) return { ...tab, content: "", cmState: null }; 
      return { ...tab, cmState: null }; 
  });
  
  try {
      localStorage.setItem('latex-open-tabs', JSON.stringify(safeTabs));
      localStorage.setItem('latex-active-tab', activeTabIndex);
  } catch(e) { console.warn("세션 저장 용량 초과 방어 완료!"); }
}

function loadSession() {
  if (typeof currentFolderPath !== 'undefined' && currentFolderPath) loadFolderTree(currentFolderPath);
  localStorage.removeItem('latex-open-tabs'); localStorage.removeItem('latex-active-tab');
  tabs = []; activeTabIndex = -1; switchTab(-1); 
}

// ==========================================
// 📑 문서 개요 (Outline) 추출 로직
// ==========================================
function updateOutline() {
  const content = getEditorContent(); 
  const outlineList = document.getElementById('outline-list');
  const fragment = document.createDocumentFragment();
  const regex = /\\(section|subsection|subsubsection)\*?\{([^}]+)\}/g;
  
  let match;
  let hasOutline = false;

  while ((match = regex.exec(content)) !== null) {
    hasOutline = true;
    const type = match[1]; 
    const title = match[2];
    const pos = match.index; 

    const item = document.createElement('div');
    item.className = `outline-item outline-${type}`;
    item.innerText = title;
    item.title = title;
    
    item.onclick = () => {
      view.dispatch({ selection: { anchor: pos }, effects: EditorView.scrollIntoView(pos, { y: "center" }) });
      view.focus();
    };
    fragment.appendChild(item);
  }
  
  outlineList.innerHTML = ''; 
  if (hasOutline) {
    outlineList.appendChild(fragment);
  } else {
    outlineList.innerHTML = '<div style="color: #4b5263; font-size: 11px; text-align: center; margin-top: 10px;">목차가 없습니다<br>(\\section 을 추가해보세요)</div>';
  }
}

// ==========================================
// 📂 폴더 트리 & 커스텀 프롬프트
// ==========================================
function customPrompt(message, defaultValue = "") {
  return new Promise((resolve) => {
    const modal = document.getElementById('prompt-modal');
    const msgEl = document.getElementById('prompt-message');
    const inputEl = document.getElementById('prompt-input');
    const btnOk = document.getElementById('prompt-ok');
    const btnCancel = document.getElementById('prompt-cancel');

    msgEl.innerText = message; inputEl.value = defaultValue; modal.style.display = 'block';
    inputEl.focus(); inputEl.select(); 

    const cleanup = () => { modal.style.display = 'none'; btnOk.onclick = null; btnCancel.onclick = null; inputEl.onkeydown = null; };
    btnOk.onclick = () => { cleanup(); resolve(inputEl.value.trim()); };
    btnCancel.onclick = () => { cleanup(); resolve(null); };
    inputEl.onkeydown = (e) => {
      if (e.key === 'Enter') { cleanup(); resolve(inputEl.value.trim()); }
      if (e.key === 'Escape') { cleanup(); resolve(null); }
    };
  });
}

let currentFolderPath = localStorage.getItem('latex-folder-path') || null;
let ctxTargetInfo = null;
let openFolders = new Set(); 


// 💡 화면 아무 곳이나 클릭하면 열려있는 모든 우클릭 메뉴를 닫습니다.
document.addEventListener('click', () => { 
  const treeMenu = document.getElementById('context-menu'); 
  const editorMenu = document.getElementById('editor-context-menu');
  if (treeMenu) treeMenu.style.display = 'none'; 
  if (editorMenu) editorMenu.style.display = 'none'; 
});


document.getElementById('file-tree').addEventListener('contextmenu', (e) => {
  if (e.target.id === 'file-tree') { 
    e.preventDefault();
    ctxTargetInfo = { isFile: false, path: currentFolderPath, dir: currentFolderPath };
    const menu = document.getElementById('context-menu');
    menu.style.display = 'flex'; menu.style.left = e.clientX + 'px'; menu.style.top = e.clientY + 'px';
  }
  
});




async function loadFolderTree(folderPath) {
  if (!folderPath) return;
  try {
    const files = await window.api.readDir(folderPath);
    const treeBox = document.getElementById('file-tree');
    treeBox.innerHTML = ''; 
    
    const treeData = { isDir: true, children: {}, fullPath: folderPath };
    files.forEach(fileObj => {
      const parts = fileObj.relPath.split('/');
      let current = treeData;
      for (let i = 0; i < parts.length - 1; i++) {
        if (!current.children[parts[i]]) current.children[parts[i]] = { isDir: true, children: {}, fullPath: current.fullPath + '/' + parts[i] };
        current = current.children[parts[i]];
      }
      const name = parts[parts.length - 1];
      if (fileObj.isDir) {
        if (!current.children[name]) current.children[name] = { isDir: true, children: {}, fullPath: fileObj.fullPath, name: name };
        else { current.children[name].fullPath = fileObj.fullPath; current.children[name].name = name; }
      } else current.children[name] = { isDir: false, fullPath: fileObj.fullPath, name: name };
    });

    function buildTreeDOM(node, container, depth) {
      const keys = Object.keys(node.children || {}).sort((a, b) => {
        const aIsDir = node.children[a].isDir ? -1 : 1; const bIsDir = node.children[b].isDir ? -1 : 1;
        if (aIsDir !== bIsDir) return aIsDir - bIsDir; return a.localeCompare(b);
      });

      keys.forEach(key => {
        const item = node.children[key];
        const row = document.createElement('div');
        row.className = 'tree-row'; row.style.paddingLeft = `${depth * 14 + 10}px`; 
        row.draggable = true;
        
        row.ondragstart = (e) => { e.stopPropagation(); e.dataTransfer.setData('text/plain', item.fullPath); row.style.opacity = '0.5'; };
        row.ondragend = () => { row.style.opacity = '1'; };
        row.ondragover = (e) => { e.preventDefault(); e.stopPropagation(); if(item.isDir) row.style.backgroundColor = '#3e4451'; };
        row.ondragleave = (e) => { e.stopPropagation(); row.style.backgroundColor = ''; };
        row.ondrop = async (e) => {
          e.preventDefault(); e.stopPropagation(); row.style.backgroundColor = '';
          const sourcePath = e.dataTransfer.getData('text/plain');
          if (!sourcePath || sourcePath === item.fullPath) return;
          const sep = sourcePath.includes('\\') ? '\\' : '/';
          let targetDir = item.isDir ? item.fullPath : item.fullPath.substring(0, item.fullPath.lastIndexOf(sep));
          const targetPath = targetDir + sep + sourcePath.split(/[/\\]/).pop();
          if (sourcePath !== targetPath) {
            try { await window.api.renameFile(sourcePath, targetPath); tabs.forEach(t => { if(t.path && t.path.startsWith(sourcePath)) t.path = t.path.replace(sourcePath, targetPath); }); renderTabs(); loadFolderTree(currentFolderPath); } catch (err) { alert("이동 실패: " + err.message); }
          }
        };

        if (item.isDir) {
          const isOpen = openFolders.has(item.fullPath);
          row.innerHTML = `<span class="tree-icon">${isOpen ? '📂' : '📁'}</span> <span>${key}</span>`;
          const childrenContainer = document.createElement('div'); childrenContainer.style.display = isOpen ? 'block' : 'none';

          row.onclick = (e) => {
            e.stopPropagation();
            if (openFolders.has(item.fullPath)) { openFolders.delete(item.fullPath); childrenContainer.style.display = 'none'; row.innerHTML = `<span class="tree-icon">📁</span> <span>${key}</span>`; }
            else { openFolders.add(item.fullPath); childrenContainer.style.display = 'block'; row.innerHTML = `<span class="tree-icon">📂</span> <span>${key}</span>`; }
          };

          row.oncontextmenu = (e) => {
            e.preventDefault(); e.stopPropagation(); ctxTargetInfo = { isFile: false, path: item.fullPath, dir: item.fullPath };
            const menu = document.getElementById('context-menu'); menu.style.display = 'flex'; menu.style.left = e.clientX + 'px'; menu.style.top = e.clientY + 'px';
          };
          container.appendChild(row); container.appendChild(childrenContainer); buildTreeDOM(item, childrenContainer, depth + 1); 

        } else {
          let icon = '📄'; const ext = key.toLowerCase(); const mediaExts = ['.pdf', '.png', '.jpg', '.jpeg', '.gif'];
          if (mediaExts.some(e => ext.endsWith(e))) icon = '🖼️'; if (ext.endsWith('.pdf')) icon = '📕';
          row.innerHTML = `<span class="tree-icon">${icon}</span> <span>${key}</span>`;

          row.onclick = async (e) => {
             e.stopPropagation();
             const fileExt = item.fullPath.substring(item.fullPath.lastIndexOf('.')).toLowerCase();
             const existingIndex = tabs.findIndex(t => t.path === item.fullPath);
             
             if (existingIndex !== -1) {
               switchTab(existingIndex);
             } else {
               const isMedia = mediaExts.some(e => fileExt.endsWith(e));
               try {
                 const content = isMedia ? "" : await window.api.readFile(item.fullPath);
                 addNewTab(item.fullPath, content, isMedia);
               } catch (err) { alert(`파일을 열 수 없습니다.\\n상세: ${err.message}`); }
             }
          };

          row.oncontextmenu = (e) => {
            e.preventDefault(); e.stopPropagation(); const sep = item.fullPath.includes('\\') ? '\\' : '/';
            ctxTargetInfo = { isFile: true, path: item.fullPath, dir: item.fullPath.substring(0, item.fullPath.lastIndexOf(sep)) };
            const menu = document.getElementById('context-menu'); menu.style.display = 'flex'; menu.style.left = e.clientX + 'px'; menu.style.top = e.clientY + 'px';
          };
          container.appendChild(row);
        }
      });
    }
    buildTreeDOM(treeData, treeBox, 0);
  } catch(e) { console.error("폴더 트리 실패:", e); }
}

document.getElementById('ctx-new-file').onclick = async () => { if(!ctxTargetInfo) return; document.getElementById('context-menu').style.display = 'none'; const name = await customPrompt("새 파일 이름"); if(name) { const sep = ctxTargetInfo.dir.includes('\\') ? '\\' : '/'; await window.api.createFile(ctxTargetInfo.dir + sep + name); openFolders.add(ctxTargetInfo.dir); loadFolderTree(currentFolderPath); }};
document.getElementById('ctx-new-folder').onclick = async () => { if(!ctxTargetInfo) return; document.getElementById('context-menu').style.display = 'none'; const name = await customPrompt("새 폴더 이름"); if(name) { const sep = ctxTargetInfo.dir.includes('\\') ? '\\' : '/'; await window.api.createFolder(ctxTargetInfo.dir + sep + name); openFolders.add(ctxTargetInfo.dir); loadFolderTree(currentFolderPath); }};
document.getElementById('ctx-rename').onclick = async () => { if(!ctxTargetInfo) return; document.getElementById('context-menu').style.display = 'none'; const oldName = ctxTargetInfo.path.split(/[/\\]/).pop(); const newName = await customPrompt("새 이름", oldName); if(newName && newName !== oldName) { const newPath = ctxTargetInfo.path.replace(oldName, newName); await window.api.renameFile(ctxTargetInfo.path, newPath); tabs.forEach(t => { if(t.path && t.path.startsWith(ctxTargetInfo.path)) t.path = t.path.replace(ctxTargetInfo.path, newPath); }); renderTabs(); loadFolderTree(currentFolderPath); }};
document.getElementById('ctx-move').onclick = async () => { if(!ctxTargetInfo) return; document.getElementById('context-menu').style.display = 'none'; const relPath = ctxTargetInfo.path.replace(currentFolderPath, '').replace(/^[/\\]/, ''); const newRelPath = await customPrompt("새로운 경로:", relPath); if(newRelPath && newRelPath !== relPath) { const sep = currentFolderPath.includes('\\') ? '\\' : '/'; const newPath = currentFolderPath + sep + newRelPath.replace(/[/\\]/g, sep); try { await window.api.renameFile(ctxTargetInfo.path, newPath); tabs.forEach(t => { if(t.path && t.path.startsWith(ctxTargetInfo.path)) t.path = t.path.replace(ctxTargetInfo.path, newPath); }); renderTabs(); loadFolderTree(currentFolderPath); } catch (e) { alert("이동 실패!"); } }};
document.getElementById('ctx-delete').onclick = async () => { if(!ctxTargetInfo) return; document.getElementById('context-menu').style.display = 'none'; if(confirm("정말로 삭제하시겠습니까?")) { await window.api.deleteFile(ctxTargetInfo.path); const idx = tabs.findIndex(t => t.path === ctxTargetInfo.path); if(idx !== -1) closeTab(idx); loadFolderTree(currentFolderPath); }};
document.getElementById('btn-open-folder').onclick = async () => { const path = await window.api.openFolder(); if (path) { currentFolderPath = path; localStorage.setItem('latex-folder-path', path); openFolders.clear(); loadFolderTree(path); }};

// ==========================================
// 📐 리사이저 & 접기 로직
// ==========================================
const sidebar = document.getElementById('sidebar');
const leftPanel = document.getElementById('left-panel');
const logContainer = document.getElementById('log-container');
const outlineContainer = document.getElementById('outline-container');
const pdfPreview = document.getElementById('pdf-preview');
const mainContent = document.getElementById('main-content'); 

function enableResizing(onMoveCallback) { pdfPreview.style.pointerEvents = 'none'; document.onmousemove = onMoveCallback; document.onmouseup = () => { document.onmousemove = null; document.onmouseup = null; pdfPreview.style.pointerEvents = 'auto'; }; }

let isSidebarVisible = true; const btnToggleSidebar = document.getElementById('btn-toggle-sidebar-resizer');
btnToggleSidebar.onmousedown = (e) => e.stopPropagation();
btnToggleSidebar.onclick = () => { isSidebarVisible = !isSidebarVisible; sidebar.style.display = isSidebarVisible ? 'flex' : 'none'; btnToggleSidebar.innerText = isSidebarVisible ? '◀' : '▶'; };
document.getElementById('resizer-sidebar').addEventListener('mousedown', (e) => { if (!isSidebarVisible || e.target.id === 'btn-toggle-sidebar-resizer') return; enableResizing((eMove) => { let newWidth = eMove.clientX; if (newWidth < 150) newWidth = 150; if (newWidth > 500) newWidth = 500; sidebar.style.width = newWidth + 'px'; }); });

let isOutlineVisible = true; const btnToggleOutline = document.getElementById('btn-toggle-outline-resizer');
btnToggleOutline.onmousedown = (e) => e.stopPropagation();
btnToggleOutline.onclick = () => { isOutlineVisible = !isOutlineVisible; outlineContainer.style.display = isOutlineVisible ? 'flex' : 'none'; btnToggleOutline.innerText = isOutlineVisible ? '▼' : '▲'; };
document.getElementById('resizer-outline').addEventListener('mousedown', (e) => { if (!isOutlineVisible || e.target.id === 'btn-toggle-outline-resizer') return; enableResizing((eMove) => { const rect = sidebar.getBoundingClientRect(); let newH = rect.bottom - eMove.clientY; if (newH < 50) newH = 50; if (newH > rect.height * 0.8) newH = rect.height * 0.8; outlineContainer.style.height = newH + 'px'; outlineContainer.style.flex = 'none'; }); });

let isLogVisible = true; const btnToggleLog = document.getElementById('btn-toggle-log-resizer');
btnToggleLog.onmousedown = (e) => e.stopPropagation();
btnToggleLog.onclick = () => { isLogVisible = !isLogVisible; logContainer.style.display = isLogVisible ? 'block' : 'none'; btnToggleLog.innerText = isLogVisible ? '▼' : '▲'; };
document.getElementById('resizer-log').addEventListener('mousedown', (e) => { if (!isLogVisible || e.target.id === 'btn-toggle-log-resizer') return; enableResizing((eMove) => { const rect = leftPanel.getBoundingClientRect(); let newH = rect.bottom - eMove.clientY; if (newH < 50) newH = 50; if (newH > rect.height * 0.8) newH = rect.height * 0.8; logContainer.style.height = newH + 'px'; }); });

// 💡 기본값을 false로 변경하고 앱 시작 시 즉시 닫힌 UI를 적용합니다.
let isPdfVisible = false; 
const btnTogglePdf = document.getElementById('btn-toggle-pdf-resizer');

btnTogglePdf.onmousedown = (e) => e.stopPropagation(); 
btnTogglePdf.onclick = () => { 
    isPdfVisible = !isPdfVisible; 
    pdfPreview.style.display = isPdfVisible ? 'block' : 'none'; 
    leftPanel.style.flex = isPdfVisible ? 'none' : '1'; 
    leftPanel.style.width = isPdfVisible ? '45%' : 'auto'; 
    btnTogglePdf.innerText = isPdfVisible ? '▶' : '◀'; 
};

// 💡 초기 상태 강제 적용 (시작 시 사이드바 닫힘)
pdfPreview.style.display = 'none'; 
leftPanel.style.flex = '1'; 
leftPanel.style.width = 'auto'; 
btnTogglePdf.innerText = '◀';

// ==========================================
// 🚀 컴파일 및 설정 (저장 시 * 표시 해제)
// ==========================================
document.getElementById('menu-new').onclick = () => addNewTab();

document.getElementById('btn-undo').onmousedown = (e) => {
  e.preventDefault();
  cmCommands.undo({ state: view.state, dispatch: (tr) => view.dispatch(tr) });
  view.focus(); 
};
document.getElementById('btn-redo').onmousedown = (e) => {
  e.preventDefault();
  cmCommands.redo({ state: view.state, dispatch: (tr) => view.dispatch(tr) });
  view.focus();
};

document.getElementById('menu-open').onclick = async () => { 
  const path = await window.api.openFile(); 
  if (path) { 
    const idx = tabs.findIndex(t => t.path === path); 
    if (idx !== -1) switchTab(idx); 
    else addNewTab(path, await window.api.readFile(path)); 
  }
};

document.getElementById('menu-save').onclick = async () => { 
  if (activeTabIndex === -1) return; 
  let tab = tabs[activeTabIndex]; 
  if (!tab.path) tab.path = await window.api.saveFile(); 
  if (tab.path) { 
    tab.content = getEditorContent(); 
    await window.api.writeFile(tab.path, tab.content); 
    tab.lastSavedContent = tab.content; 
    tab.isDirty = false; 
    renderTabs(); 
    logContainer.innerText += `\n> 저장 완료: ${tab.path}`; logContainer.scrollTop = logContainer.scrollHeight; 
  }
};

document.getElementById('menu-save-as').onclick = async () => { 
  if (activeTabIndex === -1) return; 
  const newPath = await window.api.saveFile(); 
  if (newPath) { 
    tabs[activeTabIndex].path = newPath; 
    tabs[activeTabIndex].content = getEditorContent(); 
    await window.api.writeFile(newPath, tabs[activeTabIndex].content); 
    tabs[activeTabIndex].lastSavedContent = tabs[activeTabIndex].content; 
    tabs[activeTabIndex].isDirty = false; 
    renderTabs(); 
    logContainer.innerText += `\n> 다른 이름으로 저장 완료: ${newPath}`; logContainer.scrollTop = logContainer.scrollHeight; 
  }
};

const compilerSelect = document.getElementById('compiler-select');

document.getElementById('btn-compile').onclick = async () => {
  if (activeTabIndex === -1) return; const btn = document.getElementById('btn-compile'); let tab = tabs[activeTabIndex];
  if (!tab.path) { tab.path = await window.api.saveFile(); if (!tab.path) return; renderTabs(); }
  try { 
    btn.innerText = "⏳ 컴파일 중..."; logContainer.innerText += `\n> ${compilerSelect.value} 빌드 시작...\n`; 
    tab.content = getEditorContent(); 
    await window.api.writeFile(tab.path, tab.content); 
    tab.lastSavedContent = tab.content; 
    tab.isDirty = false; renderTabs(); 
    
    const compileTimeout = parseInt(localStorage.getItem('latex-timeout-compile') || '60');
    const res = await window.api.compileLatex(tab.path, compilerSelect.value, compileTimeout);
    document.getElementById('pdf-preview').src = `file://${res.pdfPath}?t=${new Date().getTime()}`; 
    logContainer.innerText += `\n${res.log}\n> ✅ 성공!`; 
  } catch (e) { logContainer.innerText += `\n${e}\n> ❌ 실패!`; } 
  finally { btn.innerText = "🚀 PDF 컴파일"; logContainer.scrollTop = logContainer.scrollHeight; if (currentFolderPath) loadFolderTree(currentFolderPath); }
};

const settingsModal = document.getElementById('settings-modal');
const customSnippetsArea = document.getElementById('custom-snippets');
let DEFAULT_SNIPPETS_TEMPLATE = "[\n]";
try { const parts = defaultSnippetsRaw.split('const snippets'); if (parts.length > 1) { let block = parts[1].substring(parts[1].indexOf('[')); const last = block.lastIndexOf(']'); if (last !== -1) DEFAULT_SNIPPETS_TEMPLATE = block.substring(0, last + 1); } } catch(e) {}

// ==========================================
// 🔮 명령어 팔레트 (Command Palette) 로직
// ==========================================
const cmdPalette = document.getElementById('command-palette');
const cmdInput = document.getElementById('cmd-input');
const cmdList = document.getElementById('cmd-list');

const availableCommands = [
  { name: "🚀 PDF 컴파일 실행", action: () => document.getElementById('btn-compile').click() },
  { name: "💾 현재 파일 저장", action: () => document.getElementById('menu-save').click() },
  { name: "📄 새 파일 만들기", action: () => addNewTab() },
  { name: "📂 폴더 열기", action: () => document.getElementById('btn-open-folder').click() },
  { name: "⚙️ 에디터 설정 열기", action: () => document.getElementById('btn-settings').click() }
];

let selectedCmdIndex = 0;

function renderCommands(filter = "") {
  cmdList.innerHTML = '';
  const filtered = availableCommands.filter(c => c.name.toLowerCase().includes(filter.toLowerCase()));
  if (filtered.length === 0) { cmdList.innerHTML = '<div style="padding: 15px; color: #5c6370;">검색 결과가 없습니다.</div>'; return; }
  
  filtered.forEach((cmd, idx) => {
    const el = document.createElement('div');
    el.className = `cmd-item ${idx === selectedCmdIndex ? 'selected' : ''}`;
    el.innerText = cmd.name;
    el.onmouseover = () => { selectedCmdIndex = idx; renderCommands(filter); };
    el.onclick = () => { cmdPalette.style.display = 'none'; cmd.action(); };
    cmdList.appendChild(el);
  });
}

cmdInput.addEventListener('keydown', (e) => {
  const filtered = availableCommands.filter(c => c.name.toLowerCase().includes(cmdInput.value.toLowerCase()));
  if (e.key === 'ArrowDown') { e.preventDefault(); selectedCmdIndex = (selectedCmdIndex + 1) % filtered.length; renderCommands(cmdInput.value); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); selectedCmdIndex = (selectedCmdIndex - 1 + filtered.length) % filtered.length; renderCommands(cmdInput.value); }
  else if (e.key === 'Enter' && filtered.length > 0) { cmdPalette.style.display = 'none'; filtered[selectedCmdIndex].action(); }
  else if (e.key === 'Escape') cmdPalette.style.display = 'none';
});

cmdInput.addEventListener('input', () => { selectedCmdIndex = 0; renderCommands(cmdInput.value); });

// ==========================================
// ⌨️ 글로벌 단축키 및 종료 경고 설정
// ==========================================
window.addEventListener('keydown', (e) => {
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

  if (cmdOrCtrl) {
    if (e.key.toLowerCase() === 's' && !e.shiftKey) { e.preventDefault(); document.getElementById('menu-save').click(); } 
    else if (e.key.toLowerCase() === 's' && e.shiftKey) { e.preventDefault(); document.getElementById('menu-save-as').click(); } 
    else if (e.key === 'Enter') { e.preventDefault(); document.getElementById('btn-compile').click(); } 
    else if (e.key.toLowerCase() === 'n') { e.preventDefault(); addNewTab(); } 
    else if (e.key.toLowerCase() === 'o') { e.preventDefault(); document.getElementById('menu-open').click(); }
    else if (e.key.toLowerCase() === 'w') { e.preventDefault(); if (activeTabIndex !== -1) closeTab(activeTabIndex); }
    else if (e.key.toLowerCase() === 'p' && e.shiftKey) {
      e.preventDefault();
      cmdPalette.style.display = 'flex';
      cmdInput.value = ''; selectedCmdIndex = 0; renderCommands();
      setTimeout(() => cmdInput.focus(), 50);
    }
  }
});

// ==========================================
// 📑 탭 렌더링 (휠 클릭 봉인 + X버튼 잠금 + 크롬식 넓이 계산)
// ==========================================
function renderTabs() {
  const tabBar = document.getElementById('tab-bar');
  if (!tabBar) return;
  tabBar.innerHTML = ''; 
  
  // 💡 탭 개수를 CSS로 넘겨주어 크롬처럼 넓이를 자동 축소시킵니다.
  tabBar.style.setProperty('--tab-count', Math.max(1, tabs.length));

  tabs.forEach((tab, index) => {
    const tabEl = document.createElement('div');
    tabEl.className = `editor-tab ${index === activeTabIndex ? 'active' : ''}`;
    const fileName = tab.path ? tab.path.split(/[/\\]/).pop() : 'Untitled';
    const dirtyMark = tab.isDirty ? '<span style="color: #e06c75; margin-left: 4px; font-weight: bold; flex: none;">*</span>' : '';
    
    tabEl.innerHTML = `<span style="overflow: hidden; text-overflow: ellipsis; flex: 1;">${fileName}</span>${dirtyMark} <span class="tab-close-btn" style="flex: none;" data-index="${index}">×</span>`;
   
    const closeBtn = tabEl.querySelector('.tab-close-btn');
    
    // 💡 X 버튼 클릭 방어 (첫 클릭만 인정, 150ms 딜레이)
    closeBtn.onmousedown = (e) => e.stopPropagation(); 
    closeBtn.onclick = (e) => { 
        e.stopPropagation(); 
        if (isClosingAnyTab) return; // 🛡️ 다른 탭을 닫는 중이면 완전 무시!
        isClosingAnyTab = true;      // 🛡️ 잠금 온!
        closeBtn.style.pointerEvents = 'none'; 
        setTimeout(() => { closeTab(index).finally(() => { isClosingAnyTab = false; }); }, 150);
    };

    // 🚨 휠 클릭(가운데 버튼)은 버그를 일으키므로 아예 반응하지 않도록 차단
    tabEl.addEventListener('mousedown', (e) => { 
        if (e.button === 1) { e.preventDefault(); e.stopPropagation(); } 
    });

    // 일반 탭 전환 (좌클릭)
    tabEl.addEventListener('click', (e) => { 
        if (e.target === closeBtn) return; 
        switchTab(index); 
    });

    // 드래그 앤 드롭 로직
    tabEl.draggable = true;
    tabEl.ondragstart = (e) => { e.dataTransfer.setData('application/x-tab-index', index.toString()); tabEl.style.opacity = '0.4'; };
    tabEl.ondragover = (e) => {
        if (!e.dataTransfer.types.includes('application/x-tab-index')) return;
        e.preventDefault();
        const rect = tabEl.getBoundingClientRect();
        if (e.clientX < rect.left + rect.width / 2) {
            tabEl.classList.add('drag-over-left'); tabEl.classList.remove('drag-over-right');
        } else {
            tabEl.classList.add('drag-over-right'); tabEl.classList.remove('drag-over-left');
        }
    };
    tabEl.ondragleave = () => tabEl.classList.remove('drag-over-left', 'drag-over-right');
    tabEl.ondragend = () => {
        tabEl.style.opacity = '1';
        document.querySelectorAll('.editor-tab').forEach(t => t.classList.remove('drag-over-left', 'drag-over-right'));
    };
    tabEl.ondrop = (e) => {
        const dragData = e.dataTransfer.getData('application/x-tab-index');
        if (!dragData) return;
        e.preventDefault();
        const fromIndex = parseInt(dragData);
        if (fromIndex === index) return;
        const rect = tabEl.getBoundingClientRect();
        let toIndex = e.clientX < rect.left + rect.width / 2 ? index : index + 1;
        if (fromIndex < toIndex) toIndex--;
        const [movedTab] = tabs.splice(fromIndex, 1);
        tabs.splice(toIndex, 0, movedTab);
        activeTabIndex = (activeTabIndex === fromIndex) ? toIndex : 
                         (activeTabIndex > fromIndex && activeTabIndex <= toIndex) ? activeTabIndex - 1 :
                         (activeTabIndex < fromIndex && activeTabIndex >= toIndex) ? activeTabIndex + 1 : activeTabIndex;
        renderTabs();
    };
    tabBar.appendChild(tabEl); 
  });

  const addBtn = document.createElement('div');
  addBtn.className = 'new-tab-btn'; addBtn.innerHTML = '+';
  addBtn.onclick = () => addNewTab();
  tabBar.appendChild(addBtn);

  saveSession();

  const activeTabEl = tabBar.querySelector('.editor-tab.active');
  if (activeTabEl) {
    activeTabEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
  }
}





cmdPalette.addEventListener('click', (e) => { if(e.target === cmdPalette) cmdPalette.style.display = 'none'; });

if (window.api.onWindowCloseRequest) {
  window.api.onWindowCloseRequest(async () => {
    for (let i = 0; i < tabs.length; i++) {
      if (tabs[i].isDirty) {
        switchTab(i); 
        const result = await window.api.askSave(tabs[i].path);
        if (result === 2) return; 
        if (result === 0) { 
          let savePath = tabs[i].path;
          if (!savePath) savePath = await window.api.saveFile();
          if (!savePath) return; 
          tabs[i].content = getEditorContent();
          await window.api.writeFile(savePath, tabs[i].content);
          tabs[i].isDirty = false;
        }
      }
    }
    window.api.quitApp(); 
  });
}

const previewStyleSelect = document.getElementById('preview-style-select'); 
const engineSelect = document.getElementById('preview-engine-select'); 
const timeoutCompileInput = document.getElementById('timeout-compile'); 
const timeoutPreviewInput = document.getElementById('timeout-preview'); 

window.addEventListener('DOMContentLoaded', () => {
  const eng = localStorage.getItem('latex-engine');
  if (eng) compilerSelect.value = eng;
  
  const pEngine = localStorage.getItem('latex-preview-engine');
  if (pEngine && engineSelect) engineSelect.value = pEngine;
  
  const pStyle = localStorage.getItem('latex-preview-style');
  if (pStyle && previewStyleSelect) previewStyleSelect.value = pStyle;

  const tComp = localStorage.getItem('latex-timeout-compile');
  if (tComp && timeoutCompileInput) timeoutCompileInput.value = tComp;
  
  const tPrev = localStorage.getItem('latex-timeout-preview');
  if (tPrev && timeoutPreviewInput) timeoutPreviewInput.value = tPrev;

// 💡 무시 패키지 UI 로딩
 const autoIme = localStorage.getItem('latex-auto-ime');
  if (autoIme && document.getElementById('auto-ime-select')) document.getElementById('auto-ime-select').value = autoIme;
  
  const imeEng = localStorage.getItem('latex-ime-eng');
  if (imeEng && document.getElementById('ime-code-eng')) document.getElementById('ime-code-eng').value = imeEng;

  const imeKor = localStorage.getItem('latex-ime-kor');
  if (imeKor && document.getElementById('ime-code-kor')) document.getElementById('ime-code-kor').value = imeKor;

  // 💡 무시 패키지 UI 로딩
  const ignorePkgsInput = document.getElementById('preview-ignore-packages');
  const savedIgnorePkgs = localStorage.getItem('latex-preview-ignore-packages');
  const DEFAULT_IGNORE_PKGS = "tikz, pgfplots, geometry, hyperref, fancyhdr, titlesec, tcolorbox, xcolor";
  if (ignorePkgsInput) {
      ignorePkgsInput.value = savedIgnorePkgs !== null ? savedIgnorePkgs : DEFAULT_IGNORE_PKGS;
  }

  customSnippetsArea.value = localStorage.getItem('latex-custom-snippets') || DEFAULT_SNIPPETS_TEMPLATE;
  loadSession(); 
});

document.getElementById('btn-settings').onclick = () => settingsModal.style.display = 'block';
document.getElementById('close-settings').onclick = () => settingsModal.style.display = 'none';

document.getElementById('btn-reset-snippets').onclick = () => {
  if (confirm("초기화하시겠습니까?")) customSnippetsArea.value = DEFAULT_SNIPPETS_TEMPLATE;
};

// 💡 무시 패키지 초기화 (이전에 누락되었던 로직 추가!)
const btnResetIgnore = document.getElementById('btn-reset-ignore-pkgs');
if (btnResetIgnore) {
    btnResetIgnore.onclick = () => {
        if (confirm("무시 패키지 목록을 기본값으로 초기화하시겠습니까?")) {
            document.getElementById('preview-ignore-packages').value = "tikz, pgfplots, geometry, hyperref, fancyhdr, titlesec, tcolorbox, xcolor";
        }
    };
}



document.getElementById('btn-save-settings').onclick = () => {
  try {
    new Function("return " + customSnippetsArea.value)();
    localStorage.setItem('latex-engine', compilerSelect.value);
    if (engineSelect) localStorage.setItem('latex-preview-engine', engineSelect.value);
    if (previewStyleSelect) localStorage.setItem('latex-preview-style', previewStyleSelect.value);
    
    if (timeoutCompileInput) localStorage.setItem('latex-timeout-compile', timeoutCompileInput.value);
    if (timeoutPreviewInput) localStorage.setItem('latex-timeout-preview', timeoutPreviewInput.value);
    
   const ignorePkgsInput = document.getElementById('preview-ignore-packages');
    if (ignorePkgsInput) localStorage.setItem('latex-preview-ignore-packages', ignorePkgsInput.value);

    // 💡 한/영 자동 전환 및 키보드 코드 설정 저장
    if (document.getElementById('auto-ime-select')) localStorage.setItem('latex-auto-ime', document.getElementById('auto-ime-select').value);
    if (document.getElementById('ime-code-eng')) localStorage.setItem('latex-ime-eng', document.getElementById('ime-code-eng').value);
    if (document.getElementById('ime-code-kor')) localStorage.setItem('latex-ime-kor', document.getElementById('ime-code-kor').value);

    localStorage.setItem('latex-custom-snippets', customSnippetsArea.value);


    settingsModal.style.display = 'none';
    
    lastCompiledMath = ""; 
    
    location.reload(); 
  } catch(e) { alert("오류: " + e.message); }
};

// ==========================================
// 🛡️ 외부 수정 덮어쓰기 방지 (Phantom Overwrite Watcher)
// ==========================================
window.addEventListener('focus', async () => {
  if (activeTabIndex === -1) return;
  const tab = tabs[activeTabIndex];
  if (!tab.path || tab.isMedia) return;

  try {
     const diskContent = await window.api.readFile(tab.path);
     
     if (tab.lastSavedContent !== undefined && diskContent !== tab.lastSavedContent) {
         if (confirm("⚠️ 외부 프로그램에서 이 파일이 수정되었습니다.\n최신 내용을 다시 불러오시겠습니까?\n\n(확인: 외부 내용 불러오기 / 취소: 현재 에디터 내용 유지)")) {
             tab.content = diskContent;
             tab.lastSavedContent = diskContent; 
             if (tab.cmState) tab.cmState = null; 
             setEditorContent(diskContent);
             tab.isDirty = false;
             renderTabs();
         } else {
             tab.lastSavedContent = diskContent; 
             tab.isDirty = true;
             renderTabs();
         }
     }
  } catch(e) { console.warn("파일 상태 감지 실패:", e); }
});

// ==========================================
// 🦊 파이어폭스식 탭 스크롤 버튼 & 마우스 휠 기능 자동 추가
// ==========================================
window.addEventListener('DOMContentLoaded', () => {
  const tabBar = document.getElementById('tab-bar');
  if (!tabBar || tabBar.dataset.wrapped) return;
  tabBar.dataset.wrapped = "true"; // 중복 실행 방지
  
  const parent = tabBar.parentNode;
  
  // 탭바와 버튼을 감싸는 새로운 상자 만들기
  const wrapper = document.createElement('div');
  wrapper.style.display = 'flex';
  wrapper.style.alignItems = 'center';
  wrapper.style.backgroundColor = '#21252b';
  wrapper.style.borderBottom = '1px solid #181a1f';
  wrapper.style.flex = 'none';
  wrapper.style.width = '100%';
  wrapper.style.overflow = 'hidden';

  // ◀ 왼쪽 버튼 생성
  const btnLeft = document.createElement('div');
  btnLeft.innerHTML = '&#9664;'; 
  btnLeft.style.cssText = 'padding: 8px 12px; color: #abb2bf; cursor: pointer; user-select: none; font-size: 12px; background: #282c34; z-index: 10; box-shadow: 2px 0 5px rgba(0,0,0,0.3);';
  btnLeft.onclick = () => tabBar.scrollBy({ left: -200, behavior: 'smooth' }); // 왼쪽으로 부드럽게 이동
  btnLeft.onmouseover = () => btnLeft.style.color = '#61afef';
  btnLeft.onmouseout = () => btnLeft.style.color = '#abb2bf';

  // ▶ 오른쪽 버튼 생성
  const btnRight = document.createElement('div');
  btnRight.innerHTML = '&#9654;'; 
  btnRight.style.cssText = 'padding: 8px 12px; color: #abb2bf; cursor: pointer; user-select: none; font-size: 12px; background: #282c34; z-index: 10; box-shadow: -2px 0 5px rgba(0,0,0,0.3);';
  btnRight.onclick = () => tabBar.scrollBy({ left: 200, behavior: 'smooth' }); // 오른쪽으로 부드럽게 이동
  btnRight.onmouseover = () => btnRight.style.color = '#61afef';
  btnRight.onmouseout = () => btnRight.style.color = '#abb2bf';

  // 기존 탭바 디자인 다듬기
  tabBar.style.borderBottom = 'none';
  tabBar.style.flex = '1';
  tabBar.style.scrollbarWidth = 'none'; // 지저분한 기본 스크롤바 숨김 완전 적용
  
  // 요소들 조립하기
  parent.insertBefore(wrapper, tabBar);
  wrapper.appendChild(btnLeft);
  wrapper.appendChild(tabBar);
  wrapper.appendChild(btnRight);

  // 💡 마우스 휠로도 가로 스크롤 가능하게 추가 (크롬, VS Code 스타일)
  tabBar.addEventListener('wheel', (e) => {
      if (e.deltaY !== 0) {
          e.preventDefault();
          tabBar.scrollBy({ left: e.deltaY > 0 ? 100 : -100 });
      }
  });
});