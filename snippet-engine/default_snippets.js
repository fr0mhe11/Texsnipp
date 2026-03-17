const snippets = [
    // --- [최우선순위] 지능형 자동 분수 (f(x)/, ab/, 123/ 모두 지원) ---
    {
        /**
         * f(x)/ -> \frac{f(x)}{}
         * ab/ -> \frac{ab}{}
         * 123/ -> \frac{123}{}
         * \alpha/ -> \frac{\alpha}{}
         */
        trigger: /(((\d+)|([A-Za-z]+(?:\((?:\([^()]*\)|[^()])*\))?)|(\((?:\([^()]*\)|[^()])*\))|(\\([A-Za-z]+)\{[^}]*\}|\\([A-Za-z]+)))\/)/,
        replacement: "\\frac{@[1]}{@0}@1",
        options: "rmA",
        description: "Advanced Auto-fraction"
    },




    // --- Math Mode Entry ---
   

    // --- Greek Letters (@와 ; 두 가지 트리거 모두 지원) ---
    { trigger: "@a", replacement: "\\alpha", options: "mA" },
    { trigger: ";a", replacement: "\\alpha", options: "mA" },
    { trigger: "@b", replacement: "\\beta", options: "mA" },
    { trigger: ";b", replacement: "\\beta", options: "mA" },
    { trigger: "@g", replacement: "\\gamma", options: "mA" },
    { trigger: "@G", replacement: "\\Gamma", options: "mA" },
    { trigger: "@d", replacement: "\\delta", options: "mA" },
    { trigger: "@D", replacement: "\\Delta", options: "mA" },
    { trigger: "@e", replacement: "\\epsilon", options: "mA" },
    { trigger: ":e", replacement: "\\varepsilon", options: "mA" },
    { trigger: "@z", replacement: "\\zeta", options: "mA" },
    { trigger: "@t", replacement: "\\theta", options: "mA" },
    { trigger: "@T", replacement: "\\Theta", options: "mA" },
    { trigger: "@l", replacement: "\\lambda", options: "mA" },
    { trigger: "@L", replacement: "\\Lambda", options: "mA" },
    { trigger: "@s", replacement: "\\sigma", options: "mA" },
    { trigger: "@S", replacement: "\\Sigma", options: "mA" },
    { trigger: "@o", replacement: "\\omega", options: "mA" },
    { trigger: "@O", replacement: "\\Omega", options: "mA" },

    // --- Basic Operations & Subscripts ---
    { trigger: "sr", replacement: "^{2}", options: "mA" },
    { trigger: "cb", replacement: "^{3}", options: "mA" },
    { trigger: "rd", replacement: "^{@0}@1", options: "mA" },
    { trigger: "_", replacement: "_{@0}@1", options: "mA" },
    { trigger: "sts", replacement: "_\\text{@0}", options: "mA" },
    { trigger: "sq", replacement: "\\sqrt{ @0 }@1", options: "mA" },
    { trigger: "//", replacement: "\\frac{@0}{@1}@2", options: "mA" },
    { trigger: "ee", replacement: "e^{ @0 }@1", options: "mA" },
    { trigger: "rm", replacement: "\\mathrm{@0}@1", options: "mA" },
    { trigger: "bf", replacement: "\\mathbf{@0}", options: "mA" },
    
    // 자동 숫자 아래첨자 (x2 -> x_{2})
    { trigger: /([A-Za-z])(\d)/, replacement: "@[0]_{@[1]}", options: "rmA", priority: -1 },
    { trigger: /([^\\])(exp|log|ln)/, replacement: "@[0]\\@[1]", options: "rmA" },

// --- Symbols & Calculus (수정본) ---
    { trigger: "ooo", replacement: "\\infty", options: "mA" },
    
    // 1단계: sum/prod 치면 즉시 \sum/\prod로 변환 (mA 옵션)
    { trigger: "sum", replacement: "\\sum", options: "mA" },
    { trigger: "prod", replacement: "\\prod", options: "mA" },

    // 2단계: \sum/\prod 상태에서 트리거하면 범위 입력창 생성 (m 옵션)
    { 
        trigger: "\\sum", 
        replacement: "\\sum_{@{0:i}=@{1:1}}^{@{2:N}} @3", 
        options: "m" 
    },
    { 
        trigger: "\\prod", 
        replacement: "\\prod_{@{0:i}=@{1:1}}^{@{2:N}} @3", 
        options: "m" 
    },

    { trigger: "lim", replacement: "\\lim_{ @{0:n} \\to @{1:\\infty} } @2", options: "mA" },
    { trigger: "int", replacement: "\\int @0 \\, d@{1:x} @2", options: "m" },
    { trigger: "dint", replacement: "\\int_{@{0:0}}^{@{1:1}} @2 \\, d@{3:x} @4", options: "mA" },
    { trigger: "->", replacement: "\\to", options: "mA" },
    { trigger: "=>", replacement: "\\implies", options: "mA" },
    { trigger: "inn", replacement: "\\in", options: "mA" },
    { trigger: "!=", replacement: "\\neq", options: "mA" },
    { trigger: "RR", replacement: "\\mathbb{R}", options: "mA" },
    { trigger: "ZZ", replacement: "\\mathbb{Z}", options: "mA" },
    { trigger: "NN", replacement: "\\mathbb{N}", options: "mA" },
    { trigger: "QQ", replacement: "\\mathbb{Q}", options: "mA" },

    // --- Decorations ---
    { trigger: /([a-zA-Z])hat/, replacement: "\\hat{@[0]}", options: "rmA" },
    { trigger: /([a-zA-Z])bar/, replacement: "\\bar{@[0]}", options: "rmA" },
    { trigger: /([a-zA-Z])vec/, replacement: "\\vec{@[0]}", options: "rmA" },
    { trigger: "hat", replacement: "\\hat{@0}@1", options: "mA" },
    { trigger: "vec", replacement: "\\vec{@0}@1", options: "mA" },

    // --- Environments (Matrix, Cases, etc.) ---
    { trigger: /([pbBvV]mat)/, replacement: "\\begin{@[0]rix}\n@0\n\\end{@[0]rix}", options: "rMA" },
    { trigger: /(matrix|cases|align|array)/, replacement: "\\begin{@[0]}\n@0\n\\end{@[0]}", options: "rMA" },

    // --- Brackets ---
    { trigger: "avg", replacement: "\\langle @0 \\rangle @1", options: "mA" },
    { trigger: "lr(", replacement: "\\left( @0 \\right) @1", options: "mA" },
    { trigger: "lr{", replacement: "\\left\\{ @0 \\right\\} @1", options: "mA" },
    { trigger: "lr[", replacement: "\\left[ @0 \\right] @1", options: "mA" },
    { trigger: "mod", replacement: "|@0|@1", options: "mA" },

    // --- Visual Operations (드래그한 텍스트 감싸기) ---
    { trigger: "U", replacement: "\\underbrace{ @{VISUAL} }_{ @0 }", options: "mA" },
    { trigger: "O", replacement: "\\overbrace{ @{VISUAL} }^{ @0 }", options: "mA" },
    { trigger: "S", replacement: "\\sqrt{ @{VISUAL} }", options: "mA" },

    // --- Advanced Functions ---
    {
        trigger: "tayl",
        replacement: "@{0:f}(@{1:x} + @{2:h}) = @{0:f}(@{1:x}) + @{0:f}'(@{1:x})@{2:h} + @{0:f}''(@{1:x}) \\frac{@{2:h}^{2}}{2!} + \\dots@3",
        options: "mA",
        description: "Taylor expansion"
    },
    {
        trigger: /iden(\d)/,
        replacement: (match) => {
            const n = match[1];
            let arr = Array.from({ length: n }, (_, j) => 
                Array.from({ length: n }, (_, i) => (i === j ? 1 : 0)).join(" & ")
            ).join(" \\\\\n");
            return `\\begin{pmatrix}\n${arr}\n\\end{pmatrix}`;
        },
        options: "mA",
        description: "N x N identity matrix"
    }
];

// 💡 설정 창(localStorage)에서 수정한 스니펫을 가져와서 적용하는 마법
let finalSnippets = snippets; // 기본값으로 시작

try {
    const savedCustomSnippets = localStorage.getItem('latex-custom-snippets');
    if (savedCustomSnippets) {
        // eval 대신 안전하게 객체를 파싱하여 에디터 멈춤 현상을 방지합니다.
        finalSnippets = new Function("return " + savedCustomSnippets)();
    }
} catch (error) {
    console.error("스니펫 불러오기 실패 (문법 오류):", error);
}

export default snippets;
