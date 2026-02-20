/**
 * PyAsh - Core Logic v2
 * Focus: Stability and Offline Performance
 */

let pyodideInstance = null;
let isEngineReady = false;
let currentMode = localStorage.getItem('pyash_mode') || 'python'; // 'python' or 'cpp'

// DOM Selectors
const engineBadge = document.getElementById('engine-status');
const statusText = engineBadge.querySelector('.status-text');
const terminal = document.getElementById('output-terminal');
const outputPanel = document.getElementById('output-panel');
const codeEditor = document.getElementById('code-editor');
const lineNumbers = document.getElementById('line-numbers');
const runBtn = document.getElementById('btn-run');
const clearBtn = document.getElementById('btn-clear');
const clearOutputBtn = document.getElementById('btn-clear-output');
const closeOutputBtn = document.getElementById('btn-close-output');
const stdinArea = document.getElementById('stdin-area');
const stdinField = document.getElementById('stdin-field');
const scriptNameField = document.getElementById('script-name');
const saveBtn = document.getElementById('btn-save');
const currentFilenameEl = document.getElementById('current-filename');
const scriptControls = document.querySelector('.script-controls');
const newBtn = document.getElementById('btn-new');
const appLogo = document.querySelector('.app-logo');
const appTitle = document.querySelector('.brand h2');
const highlightLayer = document.getElementById('highlight-layer');
const helpModal = document.getElementById('help-modal');
const helpBody = document.getElementById('help-body');
const closeHelpBtn = document.getElementById('close-help');
const drawerHelpBtn = document.getElementById('drawer-help');

let cachedLineCount = 0;
let inputQueue = [];
// Queue for stdin lines entered in the console
let stdinQueue = [];
let enterSends = false;

/**
 * Update Line Numbers - Optimized
 */
function updateLineNumbers() {
    const lines = codeEditor.value.split('\n');
    const lineCount = lines.length;

    if (lineCount === cachedLineCount) return;
    cachedLineCount = lineCount;

    let numberString = '';
    for (let i = 1; i <= lineCount; i++) {
        numberString += `<div>${i}</div>`;
    }
    lineNumbers.innerHTML = numberString;
}

/**
 * Sync scrolling between textarea and line numbers
 */
codeEditor.addEventListener('input', () => {
    updateLineNumbers();
    highlightCode();
});

codeEditor.addEventListener('scroll', () => {
    lineNumbers.scrollTop = codeEditor.scrollTop;
    highlightLayer.scrollTop = codeEditor.scrollTop;
    highlightLayer.scrollLeft = codeEditor.scrollLeft;
});

/**
 * Syntax Highlighting Logic
 */
function highlightCode() {
    let code = codeEditor.value;

    // Escape HTML
    code = code.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    const rules = getHighlightRules(currentMode);

    for (const rule of rules) {
        code = code.replace(rule.regex, rule.replacement);
    }

    highlightLayer.innerHTML = code + "\n";
}

function getHighlightRules(mode) {
    const common = [
        { regex: /("(?:\\.|[^"\\])*")/g, replacement: '<span class="hl-string">$1</span>' },
        { regex: /('(?:\\.|[^'\\])*')/g, replacement: '<span class="hl-string">$1</span>' },
        { regex: /\b(\d+)\b/g, replacement: '<span class="hl-number">$1</span>' },
    ];

    if (mode === 'python') {
        return [
            ...common,
            { regex: /(#.*)/g, replacement: '<span class="hl-comment">$1</span>' },
            { regex: /\b(def|class|if|else|elif|while|for|return|import|from|as|try|except|finally|with|lambda|in|is|not|and|or|True|False|None)\b/g, replacement: '<span class="hl-keyword">$1</span>' },
            { regex: /\b(print|input|len|range|str|int|float|list|dict|set|tuple|type|enumerate|zip|sum|min|max|abs)\b/g, replacement: '<span class="hl-func">$1</span>' },
        ];
    } else if (mode === 'java') {
        return [
            ...common,
            { regex: /(\/\/.*)/g, replacement: '<span class="hl-comment">$1</span>' },
            { regex: /(\/\*[\s\S]*?\*\/)/g, replacement: '<span class="hl-comment">$1</span>' },
            { regex: /\b(public|protected|private|static|final|class|interface|enum|extends|implements|package|import|new|return|if|else|switch|case|default|while|do|for|break|continue|try|catch|finally|throw|throws|abstract|native|volatile|transient|synchronized|strictfp|instanceof)\b/g, replacement: '<span class="hl-keyword">$1</span>' },
            { regex: /\b(int|long|short|byte|float|double|boolean|char|void|String|Integer|Double|Boolean|List|Map|Set)\b/g, replacement: '<span class="hl-type">$1</span>' },
            { regex: /\b(System\.out\.print(?:ln|f)?|Scanner\.next(?:Int|Line)?|Math\.\w+|Arrays\.\w+)\b/g, replacement: '<span class="hl-func">$1</span>' },
        ];
    } else { // cpp
        return [
            ...common,
            { regex: /(\/\/.*)/g, replacement: '<span class="hl-comment">$1</span>' },
            { regex: /(\/\*[\s\S]*?\*\/)/g, replacement: '<span class="hl-comment">$1</span>' },
            { regex: /\b(int|long|short|float|double|bool|char|void|string|auto|const|static|unsigned|signed|struct|class|enum|union|namespace|using|public|private|protected|virtual|override|final|template|typename|friend|inline|extern|volatile|transient|explicit|concept|requires)\b/g, replacement: '<span class="hl-keyword">$1</span>' },
            { regex: /\b(if|else|switch|case|default|while|do|for|break|continue|return|try|catch|throw|new|delete|sizeof|typeid|typename|operator|this)\b/g, replacement: '<span class="hl-keyword">$1</span>' },
            { regex: /\b(cout|cin|cerr|printf|scanf|std|vector|map|set|unordered_map|unordered_set|queue|stack|priority_queue|bitset|algorithm|cmath|iostream)\b/g, replacement: '<span class="hl-func">$1</span>' },
            { regex: /(#include|#define|#ifdef|#ifndef|#endif|#pragma)\b/g, replacement: '<span class="hl-operator">$1</span>' },
        ];
    }
}

/**
 * Auto-Indentation and Tab Handling
 */
codeEditor.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
        e.preventDefault();
        const start = codeEditor.selectionStart;
        const end = codeEditor.selectionEnd;
        codeEditor.value = codeEditor.value.substring(0, start) + "    " + codeEditor.value.substring(end);
        codeEditor.selectionStart = codeEditor.selectionEnd = start + 4;
        highlightCode();
    }

    if (e.key === 'Enter') {
        const start = codeEditor.selectionStart;
        const text = codeEditor.value;
        const lineStart = text.lastIndexOf('\n', start - 1) + 1;
        const currentLine = text.substring(lineStart, start);
        const indent = currentLine.match(/^\s*/)[0];

        if (indent) {
            e.preventDefault();
            const insert = "\n" + indent;
            codeEditor.value = text.substring(0, start) + insert + text.substring(start);
            codeEditor.selectionStart = codeEditor.selectionEnd = start + insert.length;
            highlightCode();
            updateLineNumbers();
        }
    }
});

// Initial update
window.addEventListener('load', () => {
    updateLineNumbers();
    // Ensure styles are applied to gutter
    lineNumbers.style.fontFamily = getComputedStyle(codeEditor).fontFamily;

    // Apply current mode UI
    applyModeUI();

    // Load last opened script if present
    const last = localStorage.getItem(`pyash_last_${currentMode}`);
    if (last) {
        const scripts = getScripts();
        if (scripts[last]) {
            codeEditor.value = scripts[last];
            updateLineNumbers();
            log(`Loaded last script: ${last}`, 'system');
            if (currentFilenameEl) {
                currentFilenameEl.textContent = last;
                currentFilenameEl.style.display = 'inline-block';
            }
            if (scriptControls) scriptControls.style.display = 'none';
        }
    } else {
        codeEditor.value = '';
        updateLineNumbers();
    }
    highlightCode();
});

// Update displayed filename live as user types
scriptNameField.addEventListener('input', () => {
    const v = scriptNameField.value.trim();
    if (!currentFilenameEl) return;
    const ext = currentMode === 'python' ? '.py' : '.cpp';
    if (!v) {
        currentFilenameEl.textContent = `untitled${ext}`;
        currentFilenameEl.style.display = 'none';
        return;
    }
    currentFilenameEl.textContent = v.endsWith(ext) ? v : `${v}${ext}`;
});

/**
 * Log to Console with Styles
 */
/**
 * Log to Console with Buffering to prevent fragmentation
 */
let logBuffer = "";
function log(msg, type = 'system') {
    if (type === 'output' || type === 'error') {
        logBuffer += msg;
        if (logBuffer.includes('\n')) {
            const lines = logBuffer.split('\n');
            logBuffer = lines.pop(); // Keep partial line in buffer
            lines.forEach(line => appendToTerminal(line, type));
        }
    } else {
        if (logBuffer) {
            appendToTerminal(logBuffer, 'output');
            logBuffer = "";
        }
        appendToTerminal(msg, type);
    }
}

function flushLog() {
    if (logBuffer) {
        appendToTerminal(logBuffer, 'output');
        logBuffer = "";
    }
}

function appendToTerminal(msg, type) {
    const div = document.createElement('div');
    div.className = `log-entry ${type}`;
    // Preserve whitespace for code/output
    div.style.whiteSpace = 'pre-wrap';
    div.textContent = (type === 'system' ? '› ' : '') + msg;
    terminal.appendChild(div);
    terminal.scrollTop = terminal.scrollHeight;
}

function ensureInputVisible() {
    try {
        // Scroll console to bottom so latest messages are visible
        terminal.scrollTop = terminal.scrollHeight;
        // Bring the input area into view on small screens
        if (stdinArea && typeof stdinArea.scrollIntoView === 'function') {
            stdinArea.scrollIntoView({ behavior: 'smooth', block: 'end' });
        }
    } catch (e) {
        // ignore
    }
}

/**
 * Boot Engine with optimized configuration
 */
async function bootEngine() {
    if (currentMode === 'cpp' || currentMode === 'java') {
        isEngineReady = true;
        engineBadge.classList.replace('loading', 'ready');
        engineBadge.querySelector('.shimmer')?.remove();
        statusText.textContent = `${currentMode === 'cpp' ? 'C++' : 'Java'} Engine Ready (Cloud)`;
        runBtn.disabled = false;
        log(`${currentMode === 'cpp' ? 'C++' : 'Java'} Compiler ready.`, "system");
        return;
    }

    if (pyodideInstance) {
        isEngineReady = true;
        engineBadge.classList.replace('loading', 'ready');
        statusText.textContent = "Python Engine Ready";
        runBtn.disabled = false;
        return;
    }

    try {
        log("Booting python engine...", "system");

        if (typeof loadPyodide === 'undefined') {
            throw new Error("Pyodide core script missing. Please check assets.");
        }

        // Initialize with local indexURL
        pyodideInstance = await loadPyodide({
            indexURL: "pyodide/",
            stdout: (text) => log(text, 'output'),
            stderr: (text) => log(text, 'error')
        });

        // Pre-configure environment
        await pyodideInstance.runPythonAsync(`
import sys
from io import StringIO
# Preset some environment variables if needed
`);

        isEngineReady = true;

        // UI Updates
        if (currentMode === 'python') {
            engineBadge.classList.replace('loading', 'ready');
            engineBadge.querySelector('.shimmer')?.remove();
            statusText.textContent = "Python Engine Ready";
            runBtn.disabled = false;
            log("Python runtime ready.", "system");
        }

    } catch (err) {
        console.error("Boot Error:", err);
        statusText.textContent = "Boot Failed";
        log(`Fatal: ${err.message}`, "error");
    }
}

/**
 * Execute Script Dispatcher
 */
async function runScript() {
    if (currentMode === 'python') {
        await runPython();
    } else if (currentMode === 'java') {
        await runJava();
    } else {
        await runCpp();
    }
}

/**
 * Execute Python Script
 */
async function runPython() {
    if (!isEngineReady || !pyodideInstance) {
        log("Python engine not ready. Initializing...", "system");
        await bootEngine();
        if (!pyodideInstance) return;
    }

    const code = codeEditor.value;
    if (!code.trim()) return;

    // UI Feedback
    runBtn.disabled = true;
    const originalText = runBtn.querySelector('span').textContent;
    runBtn.querySelector('span').textContent = "EXECUTING...";

    outputPanel.classList.remove('hidden');
    outputPanel.classList.add('visible');
    document.querySelector('.app-shell')?.classList.add('show-console');

    log("--- Python Session Started ---", "system");

    try {
        // Prepare initial stdin from field if any
        let stdinText = stdinField.value || "";
        if (stdinText && !stdinText.endsWith('\n')) stdinText += '\n';

        const wrapper = `import sys, io, traceback, builtins\n` +
            `stdin_buf = io.StringIO(${JSON.stringify(stdinText)})\n` +
            `def _pyash_input(prompt=''):\n` +
            `    try:\n` +
            `        if prompt:\n` +
            `            sys.stdout.write(str(prompt))\n` +
            `            sys.stdout.flush()\n` +
            `        line = stdin_buf.readline()\n` +
            `        if line == '':\n` +
            `            from js import pyash_fetch_input\n` +
            `            res = pyash_fetch_input(prompt)\n` +
            `            return str(res)\n` +
            `        return line.rstrip('\\n')\n` +
            `    except Exception:\n` +
            `        return ''\n` +
            `builtins.input = _pyash_input\n` +
            `try:\n` +
            `    exec(compile(${JSON.stringify(code)}, '<user_code>', 'exec'), globals())\n` +
            `except Exception:\n` +
            `    traceback.print_exc()`;

        await pyodideInstance.runPythonAsync(wrapper);
    } catch (err) {
        log(String(err), "error");
    } finally {
        flushLog();
        runBtn.disabled = false;
        runBtn.querySelector('span').textContent = originalText;
        log("--- Session Finished ---", "system");
    }
}

/**
 * Execute C++ Script via Wandbox API (Free & Public)
 */
async function runCpp() {
    const code = codeEditor.value;
    if (!code.trim()) return;

    runBtn.disabled = true;
    const originalText = runBtn.querySelector('span').textContent;
    runBtn.querySelector('span').textContent = "COMPILING...";

    outputPanel.classList.remove('hidden');
    outputPanel.classList.add('visible');
    document.querySelector('.app-shell')?.classList.add('show-console');

    log("--- C++ Session Started (Remote) ---", "system");

    try {
        const stdinText = stdinField.value || "";

        const response = await fetch('https://wandbox.org/api/compile.json', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                compiler: 'gcc-head',
                code: code,
                stdin: stdinText,
                save: false
            })
        });

        const data = await response.json();

        if (data.program_output) log(data.program_output, 'output');
        if (data.program_error) log(data.program_error, 'error');
        if (data.compiler_error) log(data.compiler_error, 'error');

        if (data.status === "0" && !data.program_output && !data.program_error) {
            log("Program finished with no output.", "system");
        } else if (data.status !== "0" && !data.compiler_error && !data.program_error) {
            log(`Program exited with status: ${data.status}`, 'error');
        }

    } catch (err) {
        log("Execution Failed: " + err.message, "error");
        log("Trying fallback Piston mirror...", "system");
        await runCppPistonMirror(code);
    } finally {
        flushLog();
        runBtn.disabled = false;
        runBtn.querySelector('span').textContent = originalText;
        log("--- Session Finished ---", "system");
    }
}

async function runCppPistonMirror(code) {
    try {
        const response = await fetch('https://piston.piston.engineer/api/v2/execute', {
            method: 'POST',
            body: JSON.stringify({
                language: 'cpp',
                version: '10.2.0',
                files: [{ name: 'main.cpp', content: code }],
                stdin: stdinField.value || ""
            })
        });
        const data = await response.json();
        if (data.run) {
            if (data.run.stdout) log(data.run.stdout, 'output');
            if (data.run.stderr) log(data.run.stderr, 'error');
        }
    } catch (e) {
        log("All compilers unavailable. Please check internet connection.", "error");
    }
}

/**
 * Execute Java Script via Wandbox API
 */
async function runJava() {
    const code = codeEditor.value;
    if (!code.trim()) return;

    runBtn.disabled = true;
    const originalText = runBtn.querySelector('span').textContent;
    runBtn.querySelector('span').textContent = "COMPILING...";

    outputPanel.classList.remove('hidden');
    outputPanel.classList.add('visible');
    document.querySelector('.app-shell')?.classList.add('show-console');

    log("--- Java Session Started (Remote) ---", "system");

    try {
        const stdinText = stdinField.value || "";

        // Try primary compiler
        const response = await fetch('https://wandbox.org/api/compile.json', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                compiler: 'openjdk-jdk-22+36',
                code: code,
                stdin: stdinText,
                save: false
            })
        });

        const text = await response.text();
        let data;
        try {
            data = JSON.parse(text);
        } catch (e) {
            throw new Error(text.slice(0, 100) || "Invalid response from compiler");
        }

        if (data.program_output) log(data.program_output, 'output');
        if (data.program_error) log(data.program_error, 'error');
        if (data.compiler_error) log(data.compiler_error, 'error');

        if (data.status === "0" && !data.program_output && !data.program_error) {
            log("Program finished with no output.", "system");
        } else if (data.status !== "0" && !data.compiler_error && !data.program_error) {
            log(`Program exited with status: ${data.status}`, 'error');
        }

    } catch (err) {
        log("Execution Failed: " + err.message, "error");
        // Fallback to secondary compiler if primary fails
        if (err.message.includes("Unknown")) {
            log("Trying secondary compiler...", "system");
            await runJavaFallback(code);
        }
    } finally {
        flushLog();
        runBtn.disabled = false;
        runBtn.querySelector('span').textContent = originalText;
        log("--- Session Finished ---", "system");
    }
}

async function runJavaFallback(code) {
    try {
        const stdinText = stdinField.value || "";
        const response = await fetch('https://wandbox.org/api/compile.json', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                compiler: 'openjdk-jdk-21+35',
                code: code,
                stdin: stdinText,
                save: false
            })
        });
        const data = await response.json();
        if (data.program_output) log(data.program_output, 'output');
        if (data.program_error) log(data.program_error, 'error');
        if (data.compiler_error) log(data.compiler_error, 'error');
    } catch (e) {
        log("All Java compilers currently unavailable.", "error");
    }
}

// Listeners
runBtn.addEventListener('click', runScript);

// Send lines from the stdin textarea to the running program
function sendStdinFromField(all = true) {
    const val = stdinField.value;
    if (!val) return;
    if (all) {
        // Split into lines and enqueue each line in order
        const lines = val.split(/\r?\n/);
        lines.forEach((ln) => stdinQueue.push(ln));
        stdinField.value = '';
        log(`Queued ${lines.length} stdin line(s).`, 'system');
        updateQueueBadge();
        ensureInputVisible();
        return;
    }
    // Send only the current line where the caret is
    const pos = stdinField.selectionStart || 0;
    const before = val.slice(0, pos);
    const after = val.slice(pos);
    const start = before.lastIndexOf('\n') + 1;
    const endRel = after.indexOf('\n');
    const end = endRel === -1 ? val.length : pos + endRel;
    const line = val.slice(start, end);
    // Remove that line from textarea
    const newText = val.slice(0, start) + (end < val.length ? val.slice(end + 1) : '');
    stdinField.value = newText;
    stdinQueue.push(line);
    log(`Queued 1 stdin line.`, 'system');
    updateQueueBadge();
    ensureInputVisible();
}

if (stdinField) {
    stdinField.addEventListener('keydown', (e) => {
        // If Enter=Send mode is ON, send the current line on Enter
        if (e.key === 'Enter' && !(e.ctrlKey || e.metaKey)) {
            if (enterSends) {
                e.preventDefault();
                sendStdinFromField(false);
                return;
            }
            // otherwise allow newline
            return;
        }
        // Use Ctrl+Enter / Cmd+Enter to send entire textarea
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            sendStdinFromField(true);
        }
    });

    stdinField.addEventListener('focus', () => {
        ensureInputVisible();
    });

    const sendBtn = document.getElementById('stdin-send');
    const clearBtnStdin = document.getElementById('stdin-clear');
    const toggleEnterBtn = document.getElementById('stdin-toggle-enter');
    if (sendBtn) sendBtn.addEventListener('click', () => sendStdinFromField(true));
    if (clearBtnStdin) clearBtnStdin.addEventListener('click', () => { stdinField.value = ''; });
    if (toggleEnterBtn) toggleEnterBtn.addEventListener('click', () => {
        enterSends = !enterSends;
        toggleEnterBtn.textContent = `Enter=Send: ${enterSends ? 'On' : 'Off'}`;
    });
}

// Expose a synchronous bridge for Python to call when it needs more input
window.pyash_fetch_input = function (promptText) {
    if (stdinQueue.length) {
        const v = stdinQueue.shift();
        updateQueueBadge();
        return v;
    }
    // Fallback to window.prompt for synchronous blocking input as requested
    const val = window.prompt(promptText || "Input required:");
    return val || "";
};

function updateQueueBadge() {
    const el = document.getElementById('stdin-count');
    if (el) el.textContent = String(stdinQueue.length || 0);
}

clearBtn.addEventListener('click', () => {
    if (confirm("Clear code workspace?")) {
        codeEditor.value = "";
        updateLineNumbers();
    }
});

newBtn.addEventListener('click', async () => {
    if (codeEditor.value.trim().length > 0) {
        const choice = confirm("Do you want to SAVE your current script? Click 'OK' to save it first, or 'Cancel' to DISCARD it and start new.");
        if (choice) {
            // Check if we need a filename
            if (currentFilenameEl.style.display === 'none') {
                scriptControls.style.display = 'inline-flex';
                scriptNameField.focus();
                log("Please enter a name to save your work first.", "system");
                return; // Stop and let user save
            } else {
                // Auto save
                const name = currentFilenameEl.textContent;
                saveScriptLocal(name, codeEditor.value);
                log(`Saved '${name}' automatically.`, 'system');
            }
        }
    }

    // Clear for new script
    codeEditor.value = "";
    updateLineNumbers();
    currentFilenameEl.style.display = 'none';
    const ext = currentMode === 'python' ? '.py' : (currentMode === 'java' ? '.java' : '.cpp');
    currentFilenameEl.textContent = 'untitled' + ext;

    // Show save input for the NEW file
    scriptControls.style.display = 'inline-flex';
    scriptNameField.value = "";
    scriptNameField.placeholder = `New ${currentMode} file name...`;
    scriptNameField.focus();

    log(`Started new ${currentMode.toUpperCase()} file.`, "system");
});

clearOutputBtn.addEventListener('click', () => {
    terminal.innerHTML = "";
    log("Console cleared.", "system");
});

closeOutputBtn.addEventListener('click', () => {
    // Fully hide the output panel and any active stdin UI
    outputPanel.classList.remove('visible');
    outputPanel.classList.add('hidden');
    stdinArea.classList.remove('active');
    // Return to normal code editor view
    document.querySelector('.app-shell')?.classList.remove('show-console');
});

// Auto-boot on load
window.addEventListener('load', bootEngine);
window.addEventListener('load', updateQueueBadge);

// Dark mode support
function applyDarkPref(pref) {
    if (pref) document.body.classList.add('dark-theme');
    else document.body.classList.remove('dark-theme');
}

function toggleDarkMode() {
    const isDark = document.body.classList.toggle('dark-theme');
    localStorage.setItem('pyash_dark', isDark ? '1' : '0');
    log(isDark ? 'Dark mode enabled' : 'Light mode enabled', 'system');
}

// Apply persisted preference on load
window.addEventListener('load', () => {
    const pref = localStorage.getItem('pyash_dark');
    applyDarkPref(pref === '1');
});

// -----------------------------
// Script storage (local device)
// -----------------------------
function getScripts() {
    try {
        return JSON.parse(localStorage.getItem('pyash_scripts') || '{}');
    } catch (e) {
        return {};
    }
}

function saveScriptsMap(map) {
    localStorage.setItem('pyash_scripts', JSON.stringify(map));
}

function saveScriptLocal(name, code) {
    if (!name) return { error: 'Missing name' };
    const map = getScripts();
    map[name] = code;
    saveScriptsMap(map);
    localStorage.setItem(`pyash_last_${currentMode}`, name);
    return { ok: true };
}

async function trySyncToServer(name, code) {
    try {
        await fetch('/save-script', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: name, code: code })
        });
        log(`Synced '${name}' to server.`, 'system');
    } catch (e) {
        // ignore if offline
        log('Server sync unavailable (offline)', 'system');
    }
}

function loadScriptLocal(name) {
    const map = getScripts();
    if (!map[name]) return { error: 'Not found' };
    codeEditor.value = map[name];
    updateLineNumbers();
    localStorage.setItem(`pyash_last_${currentMode}`, name);
    if (currentFilenameEl) {
        currentFilenameEl.textContent = name;
        currentFilenameEl.style.display = 'inline-block';
    }
    if (scriptControls) scriptControls.style.display = 'none';
    return { ok: true };
}

function deleteScriptLocal(name) {
    const map = getScripts();
    if (!map[name]) return { error: 'Not found' };
    delete map[name];
    saveScriptsMap(map);
    if (localStorage.getItem(`pyash_last_${currentMode}`) === name) localStorage.removeItem(`pyash_last_${currentMode}`);
    if (currentFilenameEl && currentFilenameEl.textContent === name) {
        const ext = currentMode === 'python' ? '.py' : (currentMode === 'java' ? '.java' : '.cpp');
        currentFilenameEl.textContent = `untitled${ext}`;
        currentFilenameEl.style.display = 'none';
        if (scriptControls) scriptControls.style.display = '';
    }
    // Clear the editor when a script is deleted so no stale code remains
    codeEditor.value = '';
    updateLineNumbers();
    return { ok: true };
}

function downloadScript(name) {
    const map = getScripts();
    if (!map[name]) return;
    const blob = new Blob([map[name]], { type: 'text/x-python' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name.endsWith('.py') ? name : `${name}.py`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

// -----------------------------
// UI: Save & Manage actions
// -----------------------------
saveBtn.addEventListener('click', async () => {
    const nameRaw = scriptNameField.value.trim();
    if (!nameRaw) {
        alert('Please enter a script name');
        return;
    }
    const ext = currentMode === 'python' ? '.py' : (currentMode === 'java' ? '.java' : '.cpp');
    const name = nameRaw.endsWith(ext) ? nameRaw : `${nameRaw}${ext}`;
    const code = codeEditor.value;
    saveScriptLocal(name, code);
    log(`Saved script '${name}' on device.`, 'system');
    // try sync to server in background
    trySyncToServer(name, code);
    if (currentFilenameEl) {
        currentFilenameEl.textContent = name;
        currentFilenameEl.style.display = 'inline-block';
    }
    // hide the save box after saving
    if (scriptControls) scriptControls.style.display = 'none';
    // clear the input for a cleaner look
    scriptNameField.value = '';
});
// manage modal removed — using file drawer instead

// -----------------------------
// File drawer (logo button)
// -----------------------------
const logoBtn = document.getElementById('btn-logo');
const drawerOpenFilesBtn = document.getElementById('drawer-open-files');
const drawerDarkToggle = document.getElementById('drawer-dark-toggle');
const fileDrawer = document.getElementById('file-drawer');
const drawerClose = document.getElementById('drawer-close');
const drawerList = document.getElementById('drawer-list');
const previewName = document.getElementById('preview-name');
const previewCode = document.getElementById('preview-code');
const previewLoad = document.getElementById('preview-load');
const previewRun = document.getElementById('preview-run');
const previewDelete = document.getElementById('preview-delete');
const previewDownload = document.getElementById('preview-download');

let currentPreview = null;

function openDrawer() {
    // hide running console while browsing files
    outputPanel.classList.remove('visible');
    outputPanel.classList.add('hidden');
    // do not auto-render list; user must click 'Open Files'
    fileDrawer.classList.add('open');
}

function closeDrawer() {
    fileDrawer.classList.remove('open');
}

// Logo click handler: Single tap for drawer
logoBtn.addEventListener('click', () => {
    if (fileDrawer.classList.contains('open')) closeDrawer();
    else openDrawer();
});

// Swipe Down detection on logo to switch compiler
let touchStartY = 0;
logoBtn.addEventListener('touchstart', e => {
    touchStartY = e.changedTouches[0].screenY;
}, { passive: true });

logoBtn.addEventListener('touchend', e => {
    let touchEndY = e.changedTouches[0].screenY;
    if (touchEndY - touchStartY > 60) { // Threshold for swipe down
        // Add a visual 'bounce' effect
        logoBtn.classList.add('swipe-feedback');
        setTimeout(() => logoBtn.classList.remove('swipe-feedback'), 400);

        toggleMode();
        log(`Swiped Down! Switched to ${currentMode.toUpperCase()}`, 'system');
    }
}, { passive: true });

// Drawer action buttons
if (drawerOpenFilesBtn) {
    drawerOpenFilesBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        // Toggle showing the file list inside the drawer
        if (fileDrawer.classList.contains('list-visible')) {
            fileDrawer.classList.remove('list-visible');
            drawerList.innerHTML = '';
            previewName.textContent = 'Select a file';
            previewCode.textContent = 'No file selected';
            currentPreview = null;
            const pa = document.querySelector('.preview-actions'); if (pa) pa.style.display = 'none';
        } else {
            renderDrawerList();
            fileDrawer.classList.add('list-visible');
        }
    });
}
if (drawerDarkToggle) {
    drawerDarkToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleDarkMode();
    });
}

drawerClose.addEventListener('click', closeDrawer);

function renderDrawerList() {
    const map = getScripts();
    drawerList.innerHTML = '';
    const ext = currentMode === 'python' ? '.py' : (currentMode === 'java' ? '.java' : '.cpp');
    const names = Object.keys(map).filter(n => n.endsWith(ext)).sort();
    if (names.length === 0) {
        drawerList.innerHTML = `<div class="file-empty">No ${currentMode.toUpperCase()} scripts</div>`;
        previewName.textContent = 'Select a file';
        previewCode.textContent = 'No file selected';
        currentPreview = null;
        // hide preview actions until a file is selected
        const pa = document.querySelector('.preview-actions'); if (pa) pa.style.display = 'none';
        return;
    }
    names.forEach(n => {
        const row = document.createElement('div');
        row.className = 'file-item';
        const label = document.createElement('div');
        label.className = 'file-name';
        label.textContent = n;
        row.appendChild(label);
        row.addEventListener('click', () => selectFile(n));
        drawerList.appendChild(row);
    });
    // hide preview actions until a file is selected
    const pa = document.querySelector('.preview-actions'); if (pa) pa.style.display = 'none';
}

function selectFile(name) {
    const map = getScripts();
    currentPreview = name;
    previewName.textContent = name;
    previewCode.textContent = map[name] || 'Unable to load file';
    // show preview action buttons now that a file is selected
    const pa = document.querySelector('.preview-actions'); if (pa) pa.style.display = 'flex';
}

previewLoad.addEventListener('click', () => {
    if (!currentPreview) return;
    loadScriptLocal(currentPreview);
    log(`Loaded '${currentPreview}' from device.`, 'system');
    closeDrawer();
});

previewRun.addEventListener('click', async () => {
    if (!currentPreview) return;
    loadScriptLocal(currentPreview);
    // Ensure editor shows and then run
    outputPanel.classList.add('visible');
    await runScript();
});

previewDelete.addEventListener('click', () => {
    if (!currentPreview) return;
    if (!confirm(`Delete '${currentPreview}' from device?`)) return;
    deleteScriptLocal(currentPreview);
    log(`Deleted '${currentPreview}'.`, 'system');
    renderDrawerList();
    previewName.textContent = 'Select a file';
    previewCode.textContent = 'No file selected';
    currentPreview = null;
});

previewDownload.addEventListener('click', () => {
    if (!currentPreview) return;
    downloadScript(currentPreview);
});

// -----------------------------
// Mode Selection & Swipe Logic
// -----------------------------

function applyModeUI() {
    const isPython = currentMode === 'python';
    const isJava = currentMode === 'java';
    const isCpp = currentMode === 'cpp';

    if (isPython) appLogo.src = 'img/python.webp';
    else if (isJava) appLogo.src = 'img/java.png';
    else appLogo.src = 'img/cpp.png';

    appTitle.textContent = isPython ? 'Python' : (isJava ? 'Java' : 'C++');
    codeEditor.placeholder = `write your ${currentMode} code here..`;

    // Update engine badge state
    engineBadge.classList.remove('ready', 'loading');
    engineBadge.classList.add('loading');
    statusText.textContent = `Booting ${currentMode.toUpperCase()} Engine...`;

    // Clear console on mode change
    terminal.innerHTML = "";
    log(`Switched to ${currentMode.toUpperCase()} mode.`, 'system');
    highlightCode(); // Refresh highlighting for new mode

    // Add a transition class to title for a smooth fade
    appTitle.style.opacity = '0';
    setTimeout(() => {
        appTitle.textContent = isPython ? 'Python' : (isJava ? 'Java' : 'C++');
        appTitle.style.opacity = '1';
    }, 200);

    // Show current filename with correct extension
    const ext = isPython ? '.py' : (isJava ? '.java' : '.cpp');
    if (currentFilenameEl) {
        const current = currentFilenameEl.textContent;
        if (current.includes('.')) {
            // Keep filename but change extension
            const base = current.substring(0, current.lastIndexOf('.'));
            currentFilenameEl.textContent = base + ext;
        } else {
            currentFilenameEl.textContent = 'untitled' + ext;
        }
    }

    bootEngine();
}

function toggleMode() {
    // Check for unsaved changes before switching
    if (codeEditor.value.trim().length > 0) {
        const choice = confirm("You have unsaved work. Would you like to SAVE it before switching languages? Click 'OK' to save, or 'Cancel' to DISCARD and switch.");
        if (choice) {
            // Check if we need a filename
            if (currentFilenameEl.style.display === 'none') {
                scriptControls.style.display = 'inline-flex';
                scriptNameField.focus();
                log("Please enter a name to save your work first.", "system");
                return; // Stop and let user save
            } else {
                const name = currentFilenameEl.textContent;
                saveScriptLocal(name, codeEditor.value);
                log(`Saved '${name}' automatically.`, 'system');
            }
        }
    }

    if (currentMode === 'python') currentMode = 'java';
    else if (currentMode === 'java') currentMode = 'cpp';
    else currentMode = 'python';

    localStorage.setItem('pyash_mode', currentMode);

    applyModeUI();

    // ALWAYS CLEAR for a fresh experience when swiping as requested
    codeEditor.value = "";
    updateLineNumbers();
    if (currentFilenameEl) {
        currentFilenameEl.style.display = 'none';
        const ext = currentMode === 'python' ? '.py' : (currentMode === 'java' ? '.java' : '.cpp');
        currentFilenameEl.textContent = 'untitled' + ext;
    }
    if (scriptControls) scriptControls.style.display = 'inline-flex';
    scriptNameField.value = "";
    scriptNameField.placeholder = `New ${currentMode} source name...`;

    highlightCode();
}

// Triple tap logic implemented above in logoBtn listener.
// Swipe logic removed as requested.

// -----------------------------
// Help Snippets and Modal
// -----------------------------
const SNIPPETS = {
    python: [
        { name: 'Hello World', code: 'print("Hello, Python!")' },
        { name: 'Fibonacci Series', code: 'def fib(n):\n    a, b = 0, 1\n    while a < n:\n        print(a, end=" ")\n        a, b = b, a+b\n\nfib(100)' },
        { name: 'File Writing (Mock)', code: 'with open("test.txt", "w") as f:\n    f.write("Ashiwn Was Here\\n")\nprint("File write simulated.")' },
        { name: 'Dictionary & Loops', code: 'data = {"A": 10, "B": 20, "C": 30}\nfor key, val in data.items():\n    print(f"{key} maps to {val}")' },
        { name: 'Try-Except Block', code: 'try:\n    num = int(input("Enter number: "))\n    print(100 / num)\nexcept ZeroDivisionError:\n    print("Can\'t divide by zero!")\nexcept ValueError:\n    print("Invalid number!")' },
        { name: 'List Comprehension', code: 'nums = [1, 2, 3, 4, 5]\nsquares = [x**2 for x in nums if x % 2 == 0]\nprint(squares)' },
        { name: 'Class & Object', code: 'class Robot:\n    def __init__(self, name):\n        self.name = name\n    def say_hi(self):\n        print(f"Hi, I am {self.name}!")\n\nr = Robot("MYCompiler")\nr.say_hi()' }
    ],
    java: [
        { name: 'Boilerplate Main', code: 'public class Main {\n    public static void main(String[] args) {\n        System.out.println("Java Engine Ready.");\n    }\n}' },
        { name: 'Factorial (Recursion)', code: 'public class Main {\n    public static int fact(int n) {\n        if (n <= 1) return 1;\n        return n * fact(n-1);\n    }\n    public static void main(String[] args) {\n        System.out.println("Factorial of 5: " + fact(5));\n    }\n}' },
        { name: 'Scanner Input', code: 'import java.util.Scanner;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        System.out.print("Enter value: ");\n        int x = sc.nextInt();\n        System.out.println("Result: " + (x * 2));\n    }\n}' },
        { name: 'Array Sorting', code: 'import java.util.Arrays;\n\npublic class Main {\n    public static void main(String[] args) {\n        int[] arr = {5, 2, 8, 1};\n        Arrays.sort(arr);\n        System.out.println(Arrays.toString(arr));\n    }\n}' },
        { name: 'Simple Interface', code: 'interface Action {\n    void execute();\n}\n\npublic class Main {\n    public static void main(String[] args) {\n        Action a = () -> System.out.println("Action executed!");\n        a.execute();\n    }\n}' },
        { name: 'HashMap Usage', code: 'import java.util.HashMap;\n\nHashMap<String, Integer> map = new HashMap<>();\nmap.put("Java", 1);\nmap.put("Python", 2);\nSystem.out.println(map);' }
    ],
    cpp: [
        { name: 'Basic I/O', code: '#include <iostream>\nusing namespace std;\n\nint main() {\n    int n;\n    cout << "Enter n: ";\n    cin >> n;\n    cout << "Square: " << n*n << endl;\n    return 0;\n}' },
        { name: 'Binary Search', code: '#include <iostream>\n#include <vector>\n#include <algorithm>\n\nint main() {\n    std::vector<int> v = {1, 3, 5, 7, 9};\n    if(std::binary_search(v.begin(), v.end(), 5)) {\n        std::cout << "5 found!" << std::endl;\n    }\n    return 0;\n}' },
        { name: 'STL Vector', code: '#include <iostream>\n#include <vector>\n#include <algorithm>\n\nint main() {\n    std::vector<int> v = {4, 1, 3, 2};\n    std::sort(v.begin(), v.end());\n    for(int x : v) std::cout << x << " ";\n    return 0;\n}' },
        { name: 'Struct Template', code: '#include <iostream>\n#include <string>\n\nstruct User {\n    std::string name;\n    int age;\n};\n\nint main() {\n    User u = {"Admin", 25};\n    std::cout << u.name << " is " << u.age << " years old." << std::endl;\n    return 0;\n}' },
        { name: 'Pointer Magic', code: '#include <iostream>\n\nint main() {\n    int val = 10;\n    int* ptr = &val;\n    std::cout << "Value: " << *ptr << " at " << ptr << std::endl;\n    return 0;\n}' },
        { name: 'Class Example', code: '#include <iostream>\n\nclass Calc {\npublic:\n    int add(int a, int b) { return a + b; }\n};\n\nint main() {\n    Calc c;\n    std::cout << c.add(5, 7) << std::endl;\n    return 0;\n}' }
    ]
};

function openHelp() {
    helpBody.innerHTML = '';
    document.getElementById('help-title').textContent = `${currentMode.toUpperCase()} Snippets`;

    const langSnippets = SNIPPETS[currentMode] || [];
    langSnippets.forEach(s => {
        const card = document.createElement('div');
        card.className = 'snippet-card';
        card.innerHTML = `
            <span class="snippet-name">${s.name}</span>
            <code class="snippet-code">${s.code}</code>
        `;
        card.onclick = () => {
            codeEditor.value += (codeEditor.value ? '\n\n' : '') + s.code;
            highlightCode();
            updateLineNumbers();
            closeHelp();
            log(`Added snippet: ${s.name}`, 'system');
        };
        helpBody.appendChild(card);
    });

    helpModal.classList.add('active');
}

function closeHelp() {
    helpModal.classList.remove('active');
}

if (drawerHelpBtn) drawerHelpBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    openHelp();
    closeDrawer();
});

if (closeHelpBtn) closeHelpBtn.addEventListener('click', closeHelp);
window.addEventListener('click', (e) => { if (e.target === helpModal) closeHelp(); });



