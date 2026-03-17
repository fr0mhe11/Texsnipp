import { startCompletion } from "@codemirror/autocomplete";
import { EditorView } from "@codemirror/view";

// 💡 에디터를 켜자마자 UI 작동 여부를 확인하기 위한 고정 테스트 데이터
let bibDatabase = [
    { label: "test_success_2026", type: "keyword", detail: "테스트", info: "성공! 파서와 UI가 완벽히 연결되었습니다!" }
];

export function parseBibTeX(bibText) {
    const entries = [];
    const cleanText = bibText.replace(/%.*$/gm, ''); 
    const rawEntries = cleanText.split(/@(?=[a-zA-Z]+[ \t]*\{)/).slice(1);

    for (const raw of rawEntries) {
        try {
            const firstBraceIdx = raw.indexOf('{');
            if (firstBraceIdx === -1) continue;

            const type = raw.substring(0, firstBraceIdx).trim().toLowerCase();
            if (type === 'comment' || type === 'string' || type === 'preamble') continue;

            let braceCount = 0;
            let endIdx = -1;
            for (let i = firstBraceIdx; i < raw.length; i++) {
                if (raw[i] === '{') braceCount++;
                else if (raw[i] === '}') {
                    braceCount--;
                    if (braceCount === 0) { endIdx = i; break; }
                }
            }
            if (endIdx === -1) continue;

            const content = raw.substring(firstBraceIdx + 1, endIdx);
            const firstCommaIdx = content.indexOf(',');
            if (firstCommaIdx === -1) continue;
            
            const key = content.substring(0, firstCommaIdx).trim();
            const fieldsRaw = content.substring(firstCommaIdx + 1);

            const titleMatch = fieldsRaw.match(/title\s*=\s*(?:\{((?:[^{}]|\{[^{}]*\})*)\}|"([^"]*)")/i);
            const title = titleMatch ? (titleMatch[1] || titleMatch[2]).trim() : "No Title";
            
            const authorMatch = fieldsRaw.match(/author\s*=\s*(?:\{((?:[^{}]|\{[^{}]*\})*)\}|"([^"]*)")/i);
            const author = authorMatch ? (authorMatch[1] || authorMatch[2]).trim() : "Unknown Author";

            entries.push({ label: key, type: "keyword", detail: type, info: `${title}\n👤 ${author}` });
        } catch (e) { console.warn("Bib 파싱 건너뜀:", e); }
    }
    return entries;
}

export function updateBibDatabase(newEntries) {
    bibDatabase = newEntries;
}

// 🚀 내보내기 1: 순수 자동완성 공급자 함수
export function bibCompletionProvider(context) {
    let word = context.matchBefore(/\\cite[a-zA-Z]*\{[^}]*/);
    if (!word) return null;
    if (word.from === word.to && !context.explicit) return null;

    const prefixLength = word.text.indexOf('{') + 1;

    return {
        from: word.from + prefixLength,
        options: bibDatabase,
        validFor: /^[a-zA-Z0-9_:-]*$/
    };
}

// 🚀 내보내기 2: 강제 팝업 트리거
export const citeTrigger = EditorView.updateListener.of((update) => {
    if (update.docChanged) {
        const pos = update.state.selection.main.head;
        const textBefore = update.state.doc.sliceString(Math.max(0, pos - 10), pos);
        if (textBefore.match(/\\cite[a-zA-Z]*\{$/)) {
            setTimeout(() => startCompletion(update.view), 10);
        }
    }
});