import { EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { defaultKeymap } from "@codemirror/commands";
import defaultSnippetsRaw from "./snippet-engine/default_snippets.js?raw";
import { parseBibTeX, updateBibDatabase, bibCompletionProvider, citeTrigger } from './bibtex.js';
import { basicSetup } from "codemirror"; 
import { oneDark } from "@codemirror/theme-one-dark";
import { latex } from "codemirror-lang-latex";

import * as cmState from "@codemirror/state";
import * as cmView from "@codemirror/view";
import * as cmLanguage from "@codemirror/language";
import * as cmTooltip from "@codemirror/tooltip";
import * as cmCommands from "@codemirror/commands";
import { autocompletion } from "@codemirror/autocomplete";
import { main } from "./snippet-engine/extension.ts";
console.log("🚨 renderer.js 최상단 로드 성공!");
// ==========================================
// 🚀 [만능 커서 부활 & UI 먹통 해결 함수] (진짜 콘솔 개방 모드)
// ==========================================
window.forceFocusRecovery = function(targetElement = null) {
    // 1. 진짜 콘솔창을 강제로 열었다 닫아버림 (100% 리플로우 발생)
    if (window.api && window.api.blinkConsole) {
        window.api.blinkConsole();
     }
    
    // 2. 콘솔창이 닫히고 화면이 정리될 즈음(0.15초 뒤)에 커서를 꽂아줌
    setTimeout(() => {
        if (targetElement) {
            targetElement.focus(); 
        } else if (typeof view !== 'undefined' && view) {
            view.requestMeasure();
            view.focus(); 
        }
    }, 15);
};



const EditorStateProxy = new Proxy(cmState.EditorState, { get: (t, p) => p in t ? t[p] : cmState[p] });
const EditorViewProxy = new Proxy(cmView.EditorView, { get: (t, p) => p in t ? t[p] : cmView[p] });
const PrecProxy = new Proxy(cmState.Prec, { get: (t, p) => p === "fallback" ? t.lowest : p === "override" ? t.highest : t[p] });

const codemirror_objects = { ...cmState, ...cmView, ...cmLanguage, ...cmTooltip, ...cmCommands, EditorState: EditorStateProxy, EditorView: EditorViewProxy, Prec: PrecProxy };

// 🚀 [추가] 패키지 상태 변수 & 동적 리로드용 Compartment
const snippetConfig = new cmState.Compartment();
let currentActivePackages = new Set();


// 🚀 [수정] 빈 배열로 초기화 (나중에 주입됨)
// ⭕️ 정상 롤백 완료
const latexSuiteExtension = main(codemirror_objects);
// 🚀 [추가] 커서 증발 완벽 방어 함수
function forceEditorReflow() {
    setTimeout(() => {
        void document.body.offsetHeight; 
        window.dispatchEvent(new Event('resize'));
        if (typeof view !== 'undefined' && view) {
            view.requestMeasure();
            view.focus(); 
        }
    }, 50);
}


let isSystemChangingContent = false;
let previewTimeout = null; 
let lastCompiledMath = ""; 
let wasInMathMode = false;
let lastMathEnterTime = 0;

const btnUndo = document.getElementById('btn-undo');
const btnRedo = document.getElementById('btn-redo');




async function scanAndParseBibFiles(folderPath) {
    const logBox = document.getElementById('log-container');
    if (!folderPath) return;

    try {
        const files = await window.api.readDir(folderPath);
        let newDatabase = [];

        for (const file of files) {
            if (!file.isDir && file.name.toLowerCase().endsWith('.bib')) {
                const content = await window.api.readFile(file.fullPath);
                const entries = parseBibTeX(content);
                newDatabase.push(...entries);
            }
        }

        if (newDatabase.length > 0) {
            updateBibDatabase(newDatabase); // 🚀 새로 만든 엔진으로 데이터 쏘기
            if(logBox) {
                logBox.innerText += `\n> 📚 [Bib 파서] 폴더 내 ${newDatabase.length}개 인용구 로드 완료!`;
                logBox.scrollTop = logBox.scrollHeight;
            }
        }
    } catch (e) {
        console.error("Bib 파싱 에러:", e);
    }
}


// ==========================================
// 🚀 에디터 업데이트 리스너 (기존 로직)
// ==========================================
const ideUpdateListener = EditorView.updateListener.of((update) => {
  if (update.docChanged || update.selectionSet) {
    const pos = update.state.selection.main.head;
    const line = update.state.doc.lineAt(pos);
    const col = pos - line.from + 1;
    if(document.getElementById('status-line-col')) {
        document.getElementById('status-line-col').innerText = `Ln ${line.number}, Col ${col}`;
    }

    const text = update.state.doc.toString();
    const isInMath = !!extractMath(text, pos);

    if (localStorage.getItem('latex-auto-ime') !== 'off') {
        if (isInMath && !wasInMathMode) {
            const textBeforeCursor = text.slice(line.from, pos);
          if (!textBeforeCursor.match(/\\(text|mathrm|textkr)\{([^}]*)$/)) {
                const engWin = localStorage.getItem('latex-ime-eng') || '1033';
                const engLinux = localStorage.getItem('latex-linux-eng') || 'keyboard-us';
                if (window.api && window.api.switchToEnglish) window.api.switchToEnglish(engWin, engLinux); 
                
                lastMathEnterTime = Date.now();
            }
        } else if (!isInMath && wasInMathMode) {
            const korWin = localStorage.getItem('latex-ime-kor') || '1042';
            const korLinux = localStorage.getItem('latex-linux-kor') || 'hangul';
            if (window.api && window.api.switchToKorean) window.api.switchToKorean(korWin, korLinux); 
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
const latexLang = latex();

const myEditorExtensions = [
  basicSetup,
  oneDark,
  keymap.of(defaultKeymap),
  keymap.of([cmCommands.indentWithTab]),
  
  // 🚀 핵심: LaTeX 언어 코어에 직접 자동완성을 주입합니다!
  latexLang, 
  latexLang.language.data.of({ autocomplete: bibCompletionProvider }), 
  
  snippetConfig.of(latexSuiteExtension),
  ideUpdateListener, 
  autoEngFilter,
  citeTrigger, // 팝업 트리거 장착
  
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
  reloadEditorExtensions(); // 🚀 [버그 픽스] 새 파일/빈 화면을 열 때마다 설정값 강제 재주입!
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
          reloadEditorExtensions(); // 🚀 [버그 픽스] 탭을 전환할 때도 설정값 강제 재주입!
          isSystemChangingContent = false;
     } else {
          setEditorContent(currentTab.content);
      }
      updateOutline(); 
      forceEditorReflow(); // 🚀 탭 바꿀 때마다 커서 강제 복구!
    }
  } else {
    editorBox.style.display = 'none'; mediaBox.style.display = 'flex'; 
    statusFilename.innerText = '파일을 열어주세요';
    document.getElementById('outline-list').innerHTML = '';
    mediaBox.innerHTML = '<div style="margin: auto; color: #5c6370; font-size: 20px; font-weight: bold; user-select: none; text-align: center;">파일을 열거나 생성해주세요<br><br><span style="font-size: 14px; font-weight: normal;">(왼쪽 파일 트리에서 마우스 우클릭)</span></div>';
    setEditorContent(""); 
  }
  renderTabs();
  window.forceFocusRecovery();
}

function addNewTab(filePath = null, content = "% 새 문서를 작성하세요!\n\\documentclass{article}\n\\begin{document}\n\nHello, LaTeX!\n\n\\end{document}", isMedia = false) {
  tabs.push({ path: filePath, content: content, lastSavedContent: content, isMedia: isMedia, isDirty: false });
  
  if (filePath && window.api && window.api.watchFile) {
      window.api.watchFile(filePath);
  }
  switchTab(tabs.length - 1); 
  window.forceFocusRecovery();
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

if (tabs[index].path && window.api && window.api.unwatchFile) {
      window.api.unwatchFile(tabs[index].path);
  }

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
  if (typeof currentFolderPath !== 'undefined' && currentFolderPath) 
    loadFolderTree(currentFolderPath);
  // 🚀 임시 저장(세션) 완전 폐기: 시작할 때 무조건 다 날려버리고 텅 빈 상태로 시작!
  scanAndParseBibFiles(currentFolderPath); // 🚀 앱 켤 때도 자동 스캔!
  localStorage.removeItem('latex-open-tabs');
  localStorage.removeItem('latex-active-tab');
  tabs = []; 
  activeTabIndex = -1; 
  switchTab(-1);
  renderTabs();
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
             window.forceFocusRecovery();
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
document.getElementById('btn-open-folder').onclick = async () => { const path = await window.api.openFolder(); if (path) { currentFolderPath = path; localStorage.setItem('latex-folder-path', path); openFolders.clear(); loadFolderTree(path); scanAndParseBibFiles(path); }}; // 🚀 Bib 파일 자동 스캔 추가!
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
// 🚀 I-빔(커서) 증발 방어: 에디터 클릭 시 강제 포커스
// ==========================================
document.getElementById('editor-container').addEventListener('mousedown', (e) => {
  // 좌클릭(0)일 때만 작동 (우클릭 메뉴 방해 안 함)
  if (e.button === 0) {
    setTimeout(() => {
      // CodeMirror가 자체적으로 포커스를 놓쳤더라도 강제로 멱살 잡고 끌고 옴
      if (view && !view.hasFocus) {
        view.focus();
      }
    }, 50); // 클릭 이벤트가 끝난 직후 실행
  }
});






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
    if (tabs[activeTabIndex].path && window.api && window.api.unwatchFile) {
        window.api.unwatchFile(tabs[activeTabIndex].path);
    }
    tabs[activeTabIndex].path = newPath; 
    if (window.api && window.api.watchFile) window.api.watchFile(newPath);
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
    const customArgs = localStorage.getItem('latex-args') || '';
    const customPath = localStorage.getItem('latex-path') || '';
    const res = await window.api.compileLatex(tab.path, compilerSelect.value, compileTimeout, customPath, customArgs);
    document.getElementById('pdf-preview').src = `file://${res.pdfPath}?t=${new Date().getTime()}`; 
    logContainer.innerText += `\n${res.log}\n> ✅ 성공!`; 
  } catch (e) { logContainer.innerText += `\n${e}\n> ❌ 실패!`; } 
  finally { btn.innerText = "🚀 PDF 컴파일"; logContainer.scrollTop = logContainer.scrollHeight; if (currentFolderPath) loadFolderTree(currentFolderPath); }
};

const settingsModal = document.getElementById('settings-modal');

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

function updateCommandSelection() {
  const items = cmdList.querySelectorAll('.cmd-item');
  items.forEach((item, idx) => {
    if (idx === selectedCmdIndex) item.classList.add('selected');
    else item.classList.remove('selected');
  });
}

function renderCommands(filter = "") {
  cmdList.innerHTML = '';
  const filtered = availableCommands.filter(c => c.name.toLowerCase().includes(filter.toLowerCase()));
  if (filtered.length === 0) { cmdList.innerHTML = '<div style="padding: 15px; color: #5c6370;">검색 결과가 없습니다.</div>'; return; }
  
  filtered.forEach((cmd, idx) => {
    const el = document.createElement('div');
    el.className = `cmd-item ${idx === selectedCmdIndex ? 'selected' : ''}`;
    el.innerText = cmd.name;
    // 💡 HTML 전체를 갈아엎지 않고 CSS 클래스만 업데이트하여 마우스 클릭을 온전히 유지합니다.
    el.onmouseover = () => { selectedCmdIndex = idx; updateCommandSelection(); };
    el.onclick = () => { cmdPalette.style.display = 'none'; cmd.action(); };
    cmdList.appendChild(el);
  });
}

// 이 밑에 있는 keydown 이벤트 리스너에서 renderCommands(cmdInput.value) 라고 되어 있는 부분을
// updateCommandSelection() 으로 교체해주세요. (아래 참고)

cmdInput.addEventListener('keydown', (e) => {
  const filtered = availableCommands.filter(c => c.name.toLowerCase().includes(cmdInput.value.toLowerCase()));
  if (e.key === 'ArrowDown') { e.preventDefault(); selectedCmdIndex = (selectedCmdIndex + 1) % filtered.length; updateCommandSelection(); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); selectedCmdIndex = (selectedCmdIndex - 1 + filtered.length) % filtered.length; updateCommandSelection(); }
  else if (e.key === 'Enter' && filtered.length > 0) { cmdPalette.style.display = 'none'; filtered[selectedCmdIndex].action(); }
  else if (e.key === 'Escape') cmdPalette.style.display = 'none';
});

cmdInput.addEventListener('input', () => { selectedCmdIndex = 0; renderCommands(cmdInput.value); });

// ==========================================
// ⌨️ 글로벌 단축키 및 종료 경고 설정
// ==========================================
window.addEventListener('keydown', (e) => {
  // 💡 설정창이나 텍스트 입력칸에 있을 때는 단축키 훔쳐가기 방지
  if (document.getElementById('settings-modal').style.display === 'block') return;
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey; // 🚀 범인 검거! 이 변수가 날아가서 단축키가 다 죽어있었습니다.

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
// ==========================================
// ☢️ 설정창 열고 닫기 (물리적 소멸 방식)
// ==========================================

document.getElementById('btn-settings').onclick = () => {
    document.getElementById('toolbar').style.display = 'none';
    document.getElementById('main-content').style.display = 'none';
    settingsModal.style.display = 'block';
};

document.getElementById('close-settings').onclick = () => {
    settingsModal.style.display = 'none';
    document.getElementById('toolbar').style.display = 'flex';
    document.getElementById('main-content').style.display = 'flex';
    setTimeout(() => {
        void document.body.offsetHeight; 
        window.dispatchEvent(new Event('resize'));
        if (activeTabIndex !== -1 && typeof view !== 'undefined') {
            view.requestMeasure(); 
            view.focus();
        }
    }, 50);
};


// ==========================================
// 📦 스니펫 엔진 (순정 배열 모드 & 토글 스위치 탑재)
// ==========================================

let DEFAULT_SNIPPETS = "[]";
try { 
    const raw = defaultSnippetsRaw;
    const start = raw.indexOf('=') + 1;
    const end = raw.lastIndexOf('export default');
    DEFAULT_SNIPPETS = raw.substring(start, end !== -1 ? end : raw.length).trim();
    if (DEFAULT_SNIPPETS.endsWith(';')) DEFAULT_SNIPPETS = DEFAULT_SNIPPETS.slice(0, -1);
} catch(e) {}

function reloadEditorExtensions() {
    // 💡 스위치 상태 읽기 (기본값은 true)
    const useSnippets = localStorage.getItem('latex-enable-snippets') !== 'false';
    const useBrackets = localStorage.getItem('latex-enable-brackets') !== 'false';

    const extensionsToLoad = [];

    // 🚀 1. 스니펫 엔진 스위치
    if (useSnippets) {
        // 엔진을 켰을 때만 플러그인을 에디터에 주입합니다.
        const latexExtension = main(codemirror_objects);
        extensionsToLoad.push(latexExtension);
    }

    // 🚀 2. 괄호 및 $ 자동 완성 스위치 (CodeMirror 공식 문서 적용!)
    // 기본 탑재된 basicSetup이 맘대로 괄호를 닫지 못하게 'Prec.highest(최우선 순위)'로 덮어씁니다.
    if (useBrackets) {
        // 켰을 때: $, {, [, ( 등을 완벽하게 닫아줌
        extensionsToLoad.push(
            cmState.Prec.highest(
                cmState.EditorState.languageData.of(() => [{ 
                    closeBrackets: { brackets: ["(", "[", "{", "'", '"'] }
                }])
            )
        );
    } else {
        // 껐을 때: 빈 배열([])을 최우선으로 던져서, 기본 괄호 기능조차 완벽하게 먹통으로 만듦
        extensionsToLoad.push(
            cmState.Prec.highest(
                cmState.EditorState.languageData.of(() => [{ 
                    closeBrackets: { brackets: [] } 
                }])
            )
        );
    }

    // 에디터 재부팅 및 적용
    if (typeof view !== 'undefined' && view) {
        view.dispatch({ effects: snippetConfig.reconfigure(extensionsToLoad) });
    }
}
// ==========================================
// 🚀 초기화 및 탭/버튼 이벤트
// ==========================================
window.addEventListener('DOMContentLoaded', () => {
    
    // 탭 클릭 작동
    const sidebarItems = document.querySelectorAll('#settings-sidebar div');
    const sections = document.querySelectorAll('.settings-section');
    sidebarItems.forEach(item => {
        item.onclick = (e) => {
            e.preventDefault();
            sidebarItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            const targetId = item.getAttribute('data-target');
            sections.forEach(sec => sec.classList.remove('active'));
            document.getElementById(targetId).classList.add('active');
            window.forceFocusRecovery();
        };
    });

    // 경로 탐색 버튼
    const btnSelectPath = document.getElementById('btn-select-path');
    if (btnSelectPath) btnSelectPath.onclick = async (e) => { 
        e.preventDefault();
        const p = await window.api.openFolder(); 
        if (p) { document.getElementById('latex-path').value = p; } 
        window.forceFocusRecovery(document.getElementById('latex-path')); 
    };
    
    const btnDetect = document.getElementById('btn-auto-detect-path');
    if (btnDetect) btnDetect.onclick = async (e) => { 
        e.preventDefault();
        const p = await window.api.detectLatexPath(); 
        if (p) { 
            document.getElementById('latex-path').value = p; 
            await window.api.askConfirm("경로를 성공적으로 찾았습니다:\n" + p); 
        } 
        window.forceFocusRecovery(document.getElementById('latex-path')); 
    };

    // 💡 일반 설정값 및 스위치 로드
  // 💡 일반 설정값 및 스위치 로드 (HTML ID와 LocalStorage 키값 1:1 매핑)
    const idToKey = {
        'compiler-select': 'latex-engine',
        'preview-engine-select': 'latex-preview-engine',
        'preview-style-select': 'latex-preview-style',
        'timeout-compile': 'latex-timeout-compile',
        'timeout-preview': 'latex-timeout-preview',
        'auto-ime-select': 'latex-auto-ime',
        'ime-code-eng': 'latex-ime-eng',
        'ime-code-kor': 'latex-ime-kor',
        'ime-linux-eng': 'latex-linux-eng',
        'ime-linux-kor': 'latex-linux-kor',
        'latex-path': 'latex-path',
        'latex-args': 'latex-args',
        'preview-ignore-packages': 'latex-preview-ignore-packages'
    };

    // 💡 위 사전을 바탕으로 설정값 불러오기
    Object.keys(idToKey).forEach(id => {
        const key = idToKey[id];
        const val = localStorage.getItem(key);
        if (val !== null && document.getElementById(id)) {
            document.getElementById(id).value = val;
        }
    });



    const toggleSnippets = document.getElementById('toggle-auto-snippets');
    if (toggleSnippets) toggleSnippets.checked = localStorage.getItem('latex-enable-snippets') !== 'false';
    
    const toggleBrackets = document.getElementById('toggle-auto-brackets');
    if (toggleBrackets) toggleBrackets.checked = localStorage.getItem('latex-enable-brackets') !== 'false';

    // 스니펫 텍스트 로드
    const snippetEditor = document.getElementById('custom-snippets');
    let savedSnips = localStorage.getItem('latex-custom-snippets') || DEFAULT_SNIPPETS;
    if (savedSnips.trim().startsWith('{')) {
        savedSnips = DEFAULT_SNIPPETS;
        localStorage.setItem('latex-custom-snippets', savedSnips);
    }
    if (snippetEditor) snippetEditor.value = savedSnips;

    // 기본값 복구 버튼들
    const btnResetSnippets = document.getElementById('btn-reset-snippets');
    if (btnResetSnippets) {
        btnResetSnippets.onclick = async (e) => {
            e.preventDefault();
            const isOk = await window.api.askConfirm("스니펫을 초기 배열로 되돌릴까요?");
            if (isOk) {
                snippetEditor.value = DEFAULT_SNIPPETS;
                window.forceFocusRecovery(snippetEditor);
            }
        };
    }
    
    const btnResetIgnore = document.getElementById('btn-reset-ignore-pkgs');
    if (btnResetIgnore) {
        btnResetIgnore.onclick = async (e) => {
            e.preventDefault();
            const isOk = await window.api.askConfirm("무시 패키지 목록을 초기화할까요?");
            if (isOk) {
                const igInput = document.getElementById('preview-ignore-packages');
                igInput.value = "tikz, pgfplots, geometry, hyperref, fancyhdr, titlesec, tcolorbox, xcolor";
                window.forceFocusRecovery(igInput);
            }
        };
    }

    // 💡 최종 저장 버튼
    const btnSaveSettings = document.getElementById('btn-save-settings');
    if (btnSaveSettings) {
        btnSaveSettings.onclick = (e) => {
            e.preventDefault();
            try {
                const parsed = new Function("return " + snippetEditor.value)();
                if (!Array.isArray(parsed)) throw new Error("배열([ ]) 형식이 아닙니다.");

                // 데이터 저장
                localStorage.setItem('latex-custom-snippets', snippetEditor.value);
                localStorage.setItem('latex-enable-snippets', toggleSnippets.checked);
                localStorage.setItem('latex-enable-brackets', toggleBrackets.checked);
                
                Object.keys(idToKey).forEach(id => {
                    const key = idToKey[id];
                    const el = document.getElementById(id);
                    if (el) localStorage.setItem(key, el.value);
                });

                document.getElementById('close-settings').click(); 
                reloadEditorExtensions(); 
                window.forceFocusRecovery();
            } catch(err) {
                alert("🚨 문법 오류!\n" + err.message);
                window.forceFocusRecovery(snippetEditor);
            }
        };
    }

    loadSession(); 
    reloadEditorExtensions(); 
});


// ==========================================
// 🔥 강제 테스트: 에디터 켜지자마자 파서가 작동하는지 확인!
// ==========================================
setTimeout(() => {
    console.log("====================================");
    console.log("🚀 자체 파서 테스트 시작!");
    
    // 1. 파서 작동 테스트
    try {
        const testBib = `@article{test2026, title={Hello World}, author={Eugene}, year={2026}}`;
        const result = parseBibTeX(testBib);
        console.log("✅ 1. 파서 결과:", result);
    } catch (e) {
        console.error("❌ 1. 파서가 죽었습니다:", e);
    }

    
    console.log("====================================");
}, 2000); // 에디터 켜지고 2초 뒤에 콘솔에 쏩니다



// ==========================================
// 👁️ 외부 변경 감지 (File Watcher) 이벤트 수신
// ==========================================
if (window.api && window.api.onFileChangedExternally) {
  window.api.onFileChangedExternally(async (event, filePath) => {
    // 열려있는 탭 중에 해당 파일이 있는지 확인
    const tabIndex = tabs.findIndex(t => t.path === filePath);
    if (tabIndex === -1) return; 

    try {
      // 외부에서 변경된 최신 내용을 조용히 읽어옴
      const newContent = await window.api.readFile(filePath);
      const tab = tabs[tabIndex];
      
      // 💡 [핵심 방어] 내가 에디터에서 Ctrl+S를 눌러서 저장한 직후라면?
      // 파일 내용이 이미 에디터의 마지막 저장본과 100% 동일하므로 조용히 무시합니다.
      if (newContent === tab.lastSavedContent) return;

      // 내용이 다르다면 사용자에게 경고창 띄우기
      let msg = `[${filePath.split(/[/\\]/).pop()}] 파일이 외부 프로그램에 의해 변경되었습니다.\n새로운 내용을 에디터로 불러오시겠습니까?`;
      if (tab.isDirty) {
        msg += "\n\n🚨 주의: 현재 에디터에서 작성 중이던 '저장되지 않은 변경사항'이 모두 날아갑니다!";
      }

      const isOk = await window.api.askConfirm(msg);
      if (isOk) {
        // 승낙하면 최신 내용으로 교체
        tab.content = newContent;
        tab.lastSavedContent = newContent;
        tab.isDirty = false; // 오염 상태 초기화
        
        if (activeTabIndex === tabIndex) {
          // 1. 사용자가 현재 그 탭을 보고 있다면 화면 즉시 갱신
          setEditorContent(newContent);
        } else if (tab.cmState) {
          // 2. 다른 탭을 보고 있다면, 백그라운드 탭의 메모리 상태(State)만 조용히 덮어쓰기
          tab.cmState = EditorState.create({
            doc: newContent,
            extensions: myEditorExtensions 
          });
        }
        renderTabs(); // 탭 바 갱신 (* 표시 지우기)
        
        const logBox = document.getElementById('log-container');
        if(logBox) {
            logBox.innerText += `\n> 🔄 외부 변경 감지: ${filePath.split(/[/\\]/).pop()} 최신화 완료`;
            logBox.scrollTop = logBox.scrollHeight;
        }
      }
    } catch(e) {
      console.error("외부 파일 갱신 실패:", e);
    }
  });
}