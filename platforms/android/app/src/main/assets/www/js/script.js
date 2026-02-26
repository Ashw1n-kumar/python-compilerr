/**
 * PyCompiler — Simple & Clean Script
 *
 * Sections:
 *  1. State & DOM references
 *  2. Line numbers
 *  3. Syntax highlighting
 *  4. Tab / Enter indentation
 *  5. Engine boot (Pyodide / Cloud)
 *  6. Run code (Python / Java / C++)
 *  7. Save / Load / Delete scripts
 *  8. UI: toolbar buttons
 *  9. Console helpers
 * 10. File drawer (tap logo = drawer, swipe down logo = switch language)
 * 11. Snippets modal
 * 12. Startup
 */

/* ============================================================
   1. STATE & DOM REFERENCES
   ============================================================ */

// Which language is active: 'python' | 'java' | 'cpp'
let language = localStorage.getItem('compiler_lang') || 'python';

// Pyodide instance (loaded once for Python)
let pyodide = null;
let engineReady = false;

// Input queue for programs that call input()
let stdinQueue = [];

// DOM elements
const codeEditor    = document.getElementById('code-editor');
const lineNumbers   = document.getElementById('line-numbers');
const highlightLayer= document.getElementById('highlight-layer');
const engineBadge   = document.getElementById('engine-badge');
const engineText    = document.getElementById('engine-text');
const langLogo      = document.getElementById('lang-logo');
const langName      = document.getElementById('lang-name');
const currentFile   = document.getElementById('current-file');
const fileInput     = document.getElementById('file-name-input');
const btnRun          = document.getElementById('btn-run');
const btnSave         = document.getElementById('btn-save');
const btnNew          = document.getElementById('btn-new');
const btnClear        = document.getElementById('btn-clear');
const btnFiles        = document.getElementById('btn-files');
const outputPanel     = document.getElementById('output-panel');
const terminal        = document.getElementById('terminal');
const btnClearOutput  = document.getElementById('btn-clear-output');
const btnCloseOutput  = document.getElementById('btn-close-output');
const stdinArea       = document.getElementById('stdin-area');
const stdinField      = document.getElementById('stdin-field');
const stdinSend       = document.getElementById('stdin-send');
const stdinClearBtn   = document.getElementById('stdin-clear');
const helpModal       = document.getElementById('help-modal');
const closeHelpBtn    = document.getElementById('close-help');
const helpBody        = document.getElementById('help-body');
const helpTitle       = document.getElementById('help-title');
const toast           = document.getElementById('toast');
// Drawer elements
const logoBtn         = document.getElementById('btn-logo');
const fileDrawer      = document.getElementById('file-drawer');
const drawerClose     = document.getElementById('drawer-close');
const drawerOpenFiles = document.getElementById('drawer-open-files');
const drawerHelp      = document.getElementById('drawer-help');
const drawerDarkToggle= document.getElementById('drawer-dark-toggle');
const drawerFileList  = document.getElementById('drawer-file-list');
const previewName     = document.getElementById('preview-name');
const previewCode     = document.getElementById('preview-code');
const previewActions  = document.getElementById('preview-actions');
const previewLoad     = document.getElementById('preview-load');
const previewRun      = document.getElementById('preview-run');
const previewDelete   = document.getElementById('preview-delete');
const previewDownload = document.getElementById('preview-download');

// Track current open filename
let openFileName = null;

/* ============================================================
   2. LINE NUMBERS
   Keeps line-numbers column in sync with the textarea content
   and scroll position.
   ============================================================ */

let lastLineCount = 0;

function updateLineNumbers() {
    const count = codeEditor.value.split('\n').length;
    if (count === lastLineCount) return;
    lastLineCount = count;

    let html = '';
    for (let i = 1; i <= count; i++) {
        html += i + '\n';
    }
    lineNumbers.textContent = html;
}

// Sync scroll: when user scrolls the textarea, move line numbers too
codeEditor.addEventListener('scroll', () => {
    lineNumbers.scrollTop = codeEditor.scrollTop;
    highlightLayer.scrollTop = codeEditor.scrollTop;
    highlightLayer.scrollLeft = codeEditor.scrollLeft;
});

/* ============================================================
   3. SYNTAX HIGHLIGHTING
   Replaces textarea content with coloured spans in the
   'pre' layer sitting behind it.
   ============================================================ */

/**
 * highlight() — Single-pass tokenizer
 *
 * HOW IT WORKS:
 *   One combined regex matches tokens in priority order (strings first,
 *   then comments, then keywords, then numbers). Each character in the
 *   source is visited EXACTLY ONCE, so already-matched tokens are never
 *   re-processed — this prevents the bug where span attributes like
 *   class="hl-string" were being incorrectly highlighted.
 */
function highlight() {
    const code = codeEditor.value;
    highlightLayer.innerHTML = tokenize(code, language) + '\n';
}

/* Escape a raw string for safe injection into innerHTML */
function escHtml(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

/* Wrap escaped text in a highlight span */
function span(cls, raw) {
    return `<span class="${cls}">${escHtml(raw)}</span>`;
}

/**
 * tokenize(code, lang)
 *
 * Builds ONE big alternation regex with named groups.
 * Group order = priority: strings matched before keywords, etc.
 * Returns an HTML string safe to set as innerHTML.
 */
function tokenize(code, lang) {
    // ── Build the combined regex for each language ──
    let regex;

    if (lang === 'python') {
        regex = new RegExp(
            // 1. Triple-quoted strings (must come before single-quoted)
            '("""[\\s\\S]*?"""|\'\'\'[\\s\\S]*?\'\'\')|' +
            // 2. Single-line strings
            '("(?:\\\\.|[^"\\\\])*"|\'(?:\\\\.|[^\'\\\\])*\')|' +
            // 3. Comments
            '(#[^\\n]*)|' +
            // 4. Keywords
            '\\b(def|class|if|else|elif|while|for|return|import|from|as|try|except|finally|with|lambda|in|is|not|and|or|True|False|None)\\b|' +
            // 5. Built-in functions
            '\\b(print|input|len|range|str|int|float|list|dict|set|tuple|type|enumerate|zip|sum|min|max|abs)\\b|' +
            // 6. Numbers
            '\\b(\\d+(?:\\.\\d+)?)\\b',
            'g'
        );
    } else if (lang === 'java') {
        regex = new RegExp(
            // 1. Block comments
            '(/\\*[\\s\\S]*?\\*/)|' +
            // 2. Line comments
            '(//[^\\n]*)|' +
            // 3. Strings and chars
            '("(?:\\\\.|[^"\\\\])*"|\'(?:\\\\.|[^\'\\\\])*\')|' +
            // 4. Keywords
            '\\b(public|private|protected|static|final|class|interface|extends|implements|import|package|new|return|if|else|while|for|do|try|catch|finally|throw|throws|void|abstract|this|super|null|true|false)\\b|' +
            // 5. Types
            '\\b(int|long|short|byte|float|double|boolean|char|String|Integer|Double|Boolean|List|Map|Set|Object|void)\\b|' +
            // 6. Numbers
            '\\b(\\d+(?:\\.\\d+)?[LlFfd]?)\\b',
            'g'
        );
    } else {
        // C++
        regex = new RegExp(
            // 1. Block comments
            '(/\\*[\\s\\S]*?\\*/)|' +
            // 2. Line comments
            '(//[^\\n]*)|' +
            // 3. Strings and chars
            '("(?:\\\\.|[^"\\\\])*"|\'(?:\\\\.|[^\'\\\\])*\')|' +
            // 4. Preprocessor directives
            '(#(?:include|define|ifndef|ifdef|endif|pragma)[^\\n]*)|' +
            // 5. Keywords (types + control flow combined)
            '\\b(int|float|double|bool|char|void|auto|const|string|unsigned|signed|short|long|struct|class|namespace|using|template|typename|if|else|while|for|return|break|continue|switch|case|default|new|delete|nullptr|true|false|public|private|protected|virtual|override)\\b|' +
            // 6. Standard library identifiers
            '\\b(cout|cin|cerr|endl|std|vector|map|set|unordered_map|queue|stack|pair|array)\\b|' +
            // 7. Numbers
            '\\b(\\d+(?:\\.\\d+)?(?:[uUlLfF]*)?)\\b',
            'g'
        );
    }

    // ── Single pass: walk through all matches ──
    let result    = '';
    let lastIndex = 0;

    regex.lastIndex = 0;
    let match;
    while ((match = regex.exec(code)) !== null) {
        // Append plain text before this match (safely escaped)
        if (match.index > lastIndex) {
            result += escHtml(code.slice(lastIndex, match.index));
        }
        lastIndex = match.index + match[0].length;

        // Identify which group matched and apply the right colour
        if (lang === 'python') {
            if      (match[1]) result += span('hl-string',  match[1]);
            else if (match[2]) result += span('hl-string',  match[2]);
            else if (match[3]) result += span('hl-comment', match[3]);
            else if (match[4]) result += span('hl-keyword', match[4]);
            else if (match[5]) result += span('hl-func',    match[5]);
            else if (match[6]) result += span('hl-number',  match[6]);
        } else if (lang === 'java') {
            if      (match[1]) result += span('hl-comment', match[1]);
            else if (match[2]) result += span('hl-comment', match[2]);
            else if (match[3]) result += span('hl-string',  match[3]);
            else if (match[4]) result += span('hl-keyword', match[4]);
            else if (match[5]) result += span('hl-type',    match[5]);
            else if (match[6]) result += span('hl-number',  match[6]);
        } else {
            // C++
            if      (match[1]) result += span('hl-comment',  match[1]);
            else if (match[2]) result += span('hl-comment',  match[2]);
            else if (match[3]) result += span('hl-string',   match[3]);
            else if (match[4]) result += span('hl-operator', match[4]);
            else if (match[5]) result += span('hl-keyword',  match[5]);
            else if (match[6]) result += span('hl-func',     match[6]);
            else if (match[7]) result += span('hl-number',   match[7]);
        }
    }

    // Append any remaining plain text after the last match
    if (lastIndex < code.length) {
        result += escHtml(code.slice(lastIndex));
    }

    return result;
}

// Update line numbers + highlight every time content changes
codeEditor.addEventListener('input', () => {
    updateLineNumbers();
    highlight();
});

/* ============================================================
   4. TAB & AUTO-INDENT
   ============================================================ */

codeEditor.addEventListener('keydown', (e) => {
    // Tab → insert 4 spaces
    if (e.key === 'Tab') {
        e.preventDefault();
        const start = codeEditor.selectionStart;
        const end   = codeEditor.selectionEnd;
        codeEditor.value =
            codeEditor.value.substring(0, start) +
            '    ' +
            codeEditor.value.substring(end);
        codeEditor.selectionStart = codeEditor.selectionEnd = start + 4;
        highlight();
    }

    // Enter → preserve indentation of current line
    if (e.key === 'Enter') {
        const start = codeEditor.selectionStart;
        const text  = codeEditor.value;
        const lineStart = text.lastIndexOf('\n', start - 1) + 1;
        const indent    = text.substring(lineStart, start).match(/^\s*/)[0];
        if (indent) {
            e.preventDefault();
            const insert = '\n' + indent;
            codeEditor.value =
                text.substring(0, start) + insert + text.substring(start);
            codeEditor.selectionStart = codeEditor.selectionEnd = start + insert.length;
            highlight();
            updateLineNumbers();
        }
    }
});

/* ============================================================
   5. ENGINE BOOT
   Loads Pyodide for Python. Java/C++ use a cloud API.
   ============================================================ */

async function bootEngine() {
    if (language === 'java' || language === 'cpp') {
        // No local engine needed — uses Wandbox cloud API
        engineReady = true;
        setEngineBadge('ready', `${language === 'java' ? 'Java' : 'C++'} (Cloud) Ready`);
        btnRun.disabled = false;
        return;
    }

    // Python → load Pyodide
    if (pyodide) {
        // Already loaded
        engineReady = true;
        setEngineBadge('ready', 'Python Engine Ready');
        btnRun.disabled = false;
        return;
    }

    setEngineBadge('loading', 'Loading Python...');
    logMsg('Loading Python engine, please wait...', 'system');

    try {
        if (typeof loadPyodide === 'undefined') {
            throw new Error('Pyodide file missing.');
        }

        pyodide = await loadPyodide({ indexURL: 'pyodide/' });

        engineReady = true;
        setEngineBadge('ready', 'Python Engine Ready');
        btnRun.disabled = false;
        logMsg('Python ready!', 'system');

    } catch (err) {
        setEngineBadge('error', 'Load Failed');
        logMsg('Error: ' + err.message, 'error');
    }
}

function setEngineBadge(state, text) {
    engineBadge.className = 'engine-badge ' + state;
    engineText.textContent = text;
}

/* ============================================================
   6. RUN CODE
   ============================================================ */

btnRun.addEventListener('click', runCode);

async function runCode() {
    const code = codeEditor.value.trim();
    if (!code) return;

    showConsole();
    btnRun.disabled = true;
    btnRun.textContent = '⏳  Running...';

    if (language === 'python') {
        await runPython(code);
    } else if (language === 'java') {
        await runJava(code);
    } else {
        await runCpp(code);
    }

    btnRun.disabled = false;
    btnRun.textContent = '▶  RUN';
}

/* ── Python (runs locally via Pyodide) ──
 *
 * OUTPUT CAPTURE STRATEGY:
 *   We redirect sys.stdout and sys.stderr INSIDE Python to StringIO buffers.
 *   After the code finishes, we read _stdout_val and _stderr_val back
 *   using pyodide.globals.get() and display them line by line.
 *   This is reliable across ALL Pyodide versions.
 */
async function runPython(code) {
    if (!engineReady || !pyodide) {
        logMsg('Engine not ready, please wait...', 'system');
        return;
    }

    logMsg('── Python Session ──', 'system');

    // Collect any pre-typed stdin from the input field
    const stdinText = stdinField.value
        ? (stdinField.value.endsWith('\n') ? stdinField.value : stdinField.value + '\n')
        : '';

    // The Python wrapper:
    //  1. Replaces sys.stdout/stderr with StringIO so we can read output back
    //  2. Patches input() to read from preloaded lines first, then JS prompt
    //  3. Runs user code safely with try/except
    //  4. Stores results in _stdout_val and _stderr_val for JS to read
    const wrapper = `
import sys, io, builtins, traceback

_out = io.StringIO()
_err = io.StringIO()
sys.stdout = _out
sys.stderr = _err

_stdin_buf = io.StringIO(${JSON.stringify(stdinText)})

def _patched_input(prompt=''):
    if prompt:
        _out.write(str(prompt))
    line = _stdin_buf.readline()
    if line:
        return line.rstrip('\\n')
    from js import fetchInput
    return str(fetchInput(str(prompt)))

builtins.input = _patched_input

try:
    exec(compile(${JSON.stringify(code)}, '<user_code>', 'exec'), {})
except SystemExit:
    pass
except Exception:
    traceback.print_exc()

_stdout_val = _out.getvalue()
_stderr_val = _err.getvalue()
`;

    try {
        await pyodide.runPythonAsync(wrapper);

        // Read the captured output strings back from Python globals
        const stdout = pyodide.globals.get('_stdout_val') || '';
        const stderr = pyodide.globals.get('_stderr_val') || '';

        // Display stdout line by line as green output
        if (stdout) {
            const lines = stdout.split('\n');
            lines.forEach((line, i) => {
                if (i === lines.length - 1 && line === '') return; // skip trailing blank
                logMsg(line, 'output');
            });
        }

        // Display stderr line by line as red error
        if (stderr) {
            const lines = stderr.split('\n');
            lines.forEach((line, i) => {
                if (i === lines.length - 1 && line === '') return;
                logMsg(line, 'error');
            });
        }

        if (!stdout && !stderr) {
            logMsg('(no output)', 'system');
        }

    } catch (err) {
        logMsg('Runtime Error: ' + String(err), 'error');
    }

    logMsg('── Done ──', 'system');
}

// Bridge: Python calls this JS function when it needs runtime input
window.fetchInput = function (prompt) {
    if (stdinQueue.length > 0) return stdinQueue.shift();
    return window.prompt(prompt || 'Input:') || '';
};

/* ── Helper: print multi-line text to console ── */
function printLines(text, type) {
    if (!text) return;
    text.split('\n').forEach((line, i, arr) => {
        if (i === arr.length - 1 && line === '') return; // skip trailing blank
        logMsg(line, type);
    });
}

/* ── Java via Piston API ──
 *
 * Piston allows us to specify a exact filename (e.g. "StarBuilding.java")
 * so that the Java compiler doesn't complain about public class names.
 */
async function runJava(code) {
    logMsg('── Java Session (Cloud) ──', 'system');
    
    // Extract the public class name to name the file correctly
    const match = code.match(/public\s+class\s+(\w+)/);
    const className = match ? match[1] : 'Main';
    const filename = className + '.java';
    const stdin = stdinField.value || '';

    try {
        const res = await fetch('https://emkc.org/api/v2/piston/execute', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                language: 'java',
                version: '*', 
                files: [{ name: filename, content: code }],
                stdin: stdin
            })
        });

        if (!res.ok) throw new Error(`Piston error: ${res.status}`);
        const data = await res.json();

        // Display compile/run outputs
        if (data.compile && data.compile.stderr) printLines(data.compile.stderr, 'error');
        if (data.run) {
            if (data.run.stdout) printLines(data.run.stdout, 'output');
            if (data.run.stderr) printLines(data.run.stderr, 'error');
        }

        const hasOutput = (data.compile && data.compile.stderr) || (data.run && (data.run.stdout || data.run.stderr));
        if (!hasOutput) logMsg('(no output)', 'system');

    } catch (err) {
        logMsg('Java error: ' + err.message, 'error');
    }
    logMsg('── Done ──', 'system');
}

/* ── C++ via Wandbox ── */
async function runCpp(code) {
    logMsg('── C++ Session (Cloud) ──', 'system');
    const stdin = stdinField.value || '';

    try {
        const res = await fetch('https://wandbox.org/api/compile.json', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                compiler: 'gcc-head',
                code: code,
                stdin: stdin,
                save: false
            })
        });

        if (!res.ok) throw new Error(`Wandbox error: ${res.status}`);
        const data = await res.json();

        if (data.compiler_error) printLines(data.compiler_error, 'error');
        if (data.program_output) printLines(data.program_output, 'output');
        if (data.program_error)  printLines(data.program_error, 'error');

        const hasOutput = data.compiler_error || data.program_output || data.program_error;
        if (!hasOutput) logMsg('(no output)', 'system');

    } catch (err) {
        logMsg('C++ error: ' + err.message, 'error');
    }
    logMsg('── Done ──', 'system');
}

/* ============================================================
   7. SCRIPT STORAGE (localStorage)
   ============================================================ */

function getScripts() {
    try { return JSON.parse(localStorage.getItem('compiler_scripts') || '{}'); }
    catch { return {}; }
}

function saveScript(name, code) {
    const scripts = getScripts();
    scripts[name] = code;
    localStorage.setItem('compiler_scripts', JSON.stringify(scripts));
}

function deleteScript(name) {
    const scripts = getScripts();
    delete scripts[name];
    localStorage.setItem('compiler_scripts', JSON.stringify(scripts));
}

function loadScript(name) {
    const scripts = getScripts();
    return scripts[name] || null;
}

/* ============================================================
   8. TOOLBAR BUTTON HANDLERS
   ============================================================ */

/* Save button */
btnSave.addEventListener('click', () => {
    let name = fileInput.value.trim();
    if (!name) {
        showToast('Enter a file name first!');
        fileInput.focus();
        return;
    }
    // Add extension if missing
    const ext = language === 'python' ? '.py' : language === 'java' ? '.java' : '.cpp';
    if (!name.endsWith(ext)) name += ext;

    saveScript(name, codeEditor.value);
    openFileName = name;
    currentFile.textContent = name;
    fileInput.value = '';
    showToast(`Saved: ${name}`);
});

/* New file button */
btnNew.addEventListener('click', () => {
    if (codeEditor.value.trim() && !confirm('Start a new file? Unsaved changes will be lost.')) return;
    codeEditor.value = '';
    openFileName = null;
    const ext = language === 'python' ? '.py' : language === 'java' ? '.java' : '.cpp';
    currentFile.textContent = 'untitled' + ext;
    fileInput.value = '';
    updateLineNumbers();
    highlight();
});

/* Clear editor button */
btnClear.addEventListener('click', () => {
    if (codeEditor.value.trim() && !confirm('Clear all code?')) return;
    codeEditor.value = '';
    updateLineNumbers();
    highlight();
});

/* Open files button (📂) in toolbar — opens the drawer directly to file list */
btnFiles.addEventListener('click', () => {
    openDrawer();
    showFileListInDrawer();
});

/* Render files inside the drawer's file list area */
function showFileListInDrawer() {
    const scripts = getScripts();
    const ext = language === 'python' ? '.py' : language === 'java' ? '.java' : '.cpp';
    const names = Object.keys(scripts).filter(n => n.endsWith(ext)).sort();

    drawerFileList.innerHTML = '';
    // Hide preview until a file is selected
    previewActions.style.display = 'none';
    previewName.textContent = 'Select a file';
    previewCode.textContent = 'No file selected';
    currentPreview = null;

    if (names.length === 0) {
        drawerFileList.innerHTML = '<div style="color:var(--text-muted);font-style:italic;padding:8px 0">No saved files yet.</div>';
        return;
    }

    names.forEach(name => {
        const item = document.createElement('div');
        item.className = 'drawer-file-item';
        item.textContent = name;
        item.addEventListener('click', () => {
            // Highlight selected
            drawerFileList.querySelectorAll('.drawer-file-item').forEach(el => el.classList.remove('selected'));
            item.classList.add('selected');
            // Show preview
            currentPreview = name;
            previewName.textContent = name;
            previewCode.textContent = loadScript(name) || 'Unable to read file';
            previewActions.style.display = 'flex';
        });
        drawerFileList.appendChild(item);
    });
}

/* ============================================================
   9. CONSOLE HELPERS
   ============================================================ */

function showConsole() {
    outputPanel.classList.remove('hidden');
}

function hideConsole() {
    outputPanel.classList.add('hidden');
}

/* Log a system/info message */
function logMsg(text, type = 'system') {
    const div = document.createElement('div');
    div.className = type === 'system' ? 'log-system'
                  : type === 'error'  ? 'log-error'
                  : 'log-output';
    div.textContent = (type === 'system' ? '› ' : '') + text;
    terminal.appendChild(div);
    terminal.scrollTop = terminal.scrollHeight;
}

/* Buffer for partial output lines (Python stdout can come character by character) */
let outputBuffer = '';

function logOutput(text) {
    outputBuffer += text;
    // Flush complete lines
    while (outputBuffer.includes('\n')) {
        const idx  = outputBuffer.indexOf('\n');
        const line = outputBuffer.slice(0, idx);
        outputBuffer = outputBuffer.slice(idx + 1);
        logMsg(line, 'output');
    }
}

/* Flush anything remaining in the buffer */
function flushOutput() {
    if (outputBuffer) {
        logMsg(outputBuffer, 'output');
        outputBuffer = '';
    }
}

/* Console toolbar buttons */
btnClearOutput.addEventListener('click', () => {
    terminal.innerHTML = '';
    logMsg('Console cleared.', 'system');
});

btnCloseOutput.addEventListener('click', hideConsole);

/* Stdin send button */
stdinSend.addEventListener('click', () => {
    const lines = stdinField.value.split('\n');
    lines.forEach(l => stdinQueue.push(l));
    stdinField.value = '';
    logMsg(`Queued ${lines.length} line(s) of input.`, 'system');
});

stdinClearBtn.addEventListener('click', () => { stdinField.value = ''; });

/* Ctrl+Enter in stdin field = send */
stdinField.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        stdinSend.click();
    }
});

/* ============================================================
   10. FILE DRAWER + SWIPE-DOWN TO SWITCH LANGUAGE

   TAP the logo button  → slide-in drawer (Open Files / Help / Dark Mode)
   SWIPE DOWN on logo   → cycles language: Python → Java → C++ → Python
   ============================================================ */

const LANG_CONFIG = {
    python: { logo: 'img/python.webp', label: 'Python', ext: '.py'   },
    java:   { logo: 'img/java.png',    label: 'Java',   ext: '.java' },
    cpp:    { logo: 'img/cpp.png',     label: 'C++',    ext: '.cpp'  },
};

// Create an overlay div to dim the background when drawer is open
const drawerOverlay = document.createElement('div');
drawerOverlay.className = 'drawer-overlay';
document.body.appendChild(drawerOverlay);

let currentPreview = null; // which file is selected in the drawer

/* ── Open / Close drawer ── */
function openDrawer() {
    fileDrawer.classList.add('open');
    drawerOverlay.classList.add('show');
}

function closeDrawer() {
    fileDrawer.classList.remove('open');
    drawerOverlay.classList.remove('show');
}

// Tap overlay to close drawer
drawerOverlay.addEventListener('click', closeDrawer);
drawerClose.addEventListener('click', closeDrawer);

/* ── Logo TAP → open drawer ── */
let touchMovedFar = false; // to differentiate tap vs swipe

logoBtn.addEventListener('click', () => {
    // Only treat as tap if user didn't swipe
    if (!touchMovedFar) {
        if (fileDrawer.classList.contains('open')) closeDrawer();
        else openDrawer();
    }
    touchMovedFar = false;
});

/* ── Logo SWIPE DOWN → switch language ── */
let touchStartY = 0;

logoBtn.addEventListener('touchstart', (e) => {
    touchStartY  = e.changedTouches[0].screenY;
    touchMovedFar = false;
}, { passive: true });

logoBtn.addEventListener('touchend', (e) => {
    const delta = e.changedTouches[0].screenY - touchStartY;
    if (delta > 55) {
        // Swipe down detected — switch language
        touchMovedFar = true;
        logoBtn.classList.add('swipe-feedback');
        setTimeout(() => logoBtn.classList.remove('swipe-feedback'), 400);
        switchLanguage();
    }
}, { passive: true });

/* ── Drawer menu buttons ── */
drawerOpenFiles.addEventListener('click', () => {
    showFileListInDrawer();
});

drawerHelp.addEventListener('click', () => {
    closeDrawer();
    openSnippets();
});

drawerDarkToggle.addEventListener('click', () => {
    const isLight = document.body.classList.toggle('light');
    localStorage.setItem('compiler_light', isLight ? '1' : '0');
    showToast(isLight ? 'Light mode on' : 'Dark mode on');
});

/* ── Drawer preview action buttons ── */
previewLoad.addEventListener('click', () => {
    if (!currentPreview) return;
    codeEditor.value = loadScript(currentPreview) || '';
    openFileName = currentPreview;
    currentFile.textContent = currentPreview;
    updateLineNumbers();
    highlight();
    closeDrawer();
    showToast(`Loaded: ${currentPreview}`);
});

previewRun.addEventListener('click', async () => {
    if (!currentPreview) return;
    codeEditor.value = loadScript(currentPreview) || '';
    openFileName = currentPreview;
    currentFile.textContent = currentPreview;
    updateLineNumbers();
    highlight();
    closeDrawer();
    await runCode();
});

previewDelete.addEventListener('click', () => {
    if (!currentPreview) return;
    if (!confirm(`Delete "${currentPreview}"?`)) return;
    deleteScript(currentPreview);
    if (openFileName === currentPreview) {
        openFileName = null;
        codeEditor.value = '';
        updateLineNumbers();
        highlight();
    }
    showToast(`Deleted: ${currentPreview}`);
    showFileListInDrawer(); // refresh list
});

previewDownload.addEventListener('click', () => {
    if (!currentPreview) return;
    const code = loadScript(currentPreview) || '';
    const blob = new Blob([code], { type: 'text/plain' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = currentPreview;
    a.click();
    URL.revokeObjectURL(url);
});

/* ── Language switch logic ── */
function switchLanguage() {
    if (codeEditor.value.trim()) {
        if (!confirm('Switch language? Unsaved changes will be lost.')) return;
    }

    // Cycle: Python → Java → C++ → Python
    if (language === 'python')      language = 'java';
    else if (language === 'java')   language = 'cpp';
    else                            language = 'python';

    localStorage.setItem('compiler_lang', language);
    applyLanguageUI();

    codeEditor.value = '';
    openFileName = null;
    updateLineNumbers();
    highlight();

    engineReady   = false;
    btnRun.disabled = true;
    bootEngine();
}

function applyLanguageUI() {
    const cfg = LANG_CONFIG[language];
    langLogo.src            = cfg.logo;
    langName.textContent    = cfg.label;
    currentFile.textContent = 'untitled' + cfg.ext;
    codeEditor.placeholder  = `write your ${cfg.label} code here..`;
}

/* ============================================================
   11. SNIPPETS MODAL
   ============================================================ */

const SNIPPETS = {
    python: [
        { name: 'Hello World',       code: 'print("Hello, World!")' },
        { name: 'User Input',        code: 'name = input("Enter your name: ")\nprint("Hello,", name)' },
        { name: 'For Loop',          code: 'for i in range(1, 6):\n    print(i)' },
        { name: 'Fibonacci',         code: 'def fib(n):\n    a, b = 0, 1\n    while a < n:\n        print(a, end=" ")\n        a, b = b, a+b\n\nfib(100)' },
        { name: 'List Comprehension',code: 'squares = [x**2 for x in range(1, 6)]\nprint(squares)' },
        { name: 'Class Example',     code: 'class Dog:\n    def __init__(self, name):\n        self.name = name\n    def bark(self):\n        print(self.name, "says: Woof!")\n\nd = Dog("Rex")\nd.bark()' },
    ],
    java: [
        { name: 'Hello World', code: 'public class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello, World!");\n    }\n}' },
        { name: 'For Loop',    code: 'public class Main {\n    public static void main(String[] args) {\n        for (int i = 1; i <= 5; i++) {\n            System.out.println(i);\n        }\n    }\n}' },
        { name: 'Scanner',     code: 'import java.util.Scanner;\npublic class Main {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        System.out.print("Enter a number: ");\n        int n = sc.nextInt();\n        System.out.println("You typed: " + n);\n    }\n}' },
    ],
    cpp: [
        { name: 'Hello World', code: '#include <iostream>\nusing namespace std;\nint main() {\n    cout << "Hello, World!" << endl;\n    return 0;\n}' },
        { name: 'User Input',  code: '#include <iostream>\nusing namespace std;\nint main() {\n    int n;\n    cout << "Enter a number: ";\n    cin >> n;\n    cout << "You typed: " << n << endl;\n    return 0;\n}' },
        { name: 'For Loop',    code: '#include <iostream>\nusing namespace std;\nint main() {\n    for (int i = 1; i <= 5; i++) {\n        cout << i << endl;\n    }\n    return 0;\n}' },
    ],
};

// Open snippets modal via file drawer (we expose a global for convenience)
window.openSnippets = function () {
    helpTitle.textContent = `${language.toUpperCase()} Snippets`;
    helpBody.innerHTML = '';

    const list = SNIPPETS[language] || [];
    list.forEach(s => {
        const card = document.createElement('div');
        card.className = 'snippet-card';
        card.innerHTML = `<span class="snippet-name">${s.name}</span><code class="snippet-code">${escHtml(s.code)}</code>`;
        card.addEventListener('click', () => {
            // Insert snippet at cursor or append
            codeEditor.value += (codeEditor.value ? '\n\n' : '') + s.code;
            updateLineNumbers();
            highlight();
            helpModal.classList.add('hidden');
            showToast('Snippet added!');
        });
        helpBody.appendChild(card);
    });

    helpModal.classList.remove('hidden');
};

closeHelpBtn.addEventListener('click', () => helpModal.classList.add('hidden'));
helpModal.addEventListener('click', (e) => { if (e.target === helpModal) helpModal.classList.add('hidden'); });



/* ============================================================
   12. TOAST
   ============================================================ */

let toastTimer = null;

function showToast(msg) {
    toast.textContent = msg;
    toast.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.add('hidden'), 2500);
}

/* ============================================================
   STARTUP
   ============================================================ */

window.addEventListener('load', () => {
    // Restore language UI
    applyLanguageUI();

    // Restore dark/light preference
    const isLight = localStorage.getItem('compiler_light') === '1';
    if (isLight) document.body.classList.add('light');

    // Restore last opened file for the current language
    const lastName = localStorage.getItem(`compiler_last_${language}`);
    if (lastName) {
        const code = loadScript(lastName);
        if (code !== null) {
            codeEditor.value = code;
            openFileName = lastName;
            currentFile.textContent = lastName;
        }
    }

    updateLineNumbers();
    highlight();

    // Boot the engine for the current language
    bootEngine();
});

