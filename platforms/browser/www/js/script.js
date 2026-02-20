/**
 * PyAsh - Core Logic v2
 * Focus: Stability and Offline Performance
 */

let pyodideInstance = null;
let isEngineReady = false;

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

let cachedLineCount = 0;
let inputQueue = [];

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
codeEditor.addEventListener('scroll', () => {
    lineNumbers.scrollTop = codeEditor.scrollTop;
});

codeEditor.addEventListener('input', updateLineNumbers);

// Initial update
window.addEventListener('load', () => {
    updateLineNumbers();
    // Ensure styles are applied to gutter
    lineNumbers.style.fontFamily = getComputedStyle(codeEditor).fontFamily;
});

/**
 * Log to Console with Styles
 */
function log(msg, type = 'system') {
    const div = document.createElement('div');
    div.className = `log-entry ${type}`;
    div.textContent = (type === 'system' ? '› ' : '') + msg;
    terminal.appendChild(div);
    terminal.scrollTop = terminal.scrollHeight;
}

/**
 * Boot Engine with optimized configuration
 */
async function bootEngine() {
    try {
        log("Booting crystal engine...", "system");

        if (typeof loadPyodide === 'undefined') {
            throw new Error("Pyodide core script missing. Please check assets.");
        }

        // Initialize with local indexURL
        pyodideInstance = await loadPyodide({
            indexURL: "pyodide/",
            stdout: (text) => log(text, 'output'),
            stderr: (text) => log(text, 'error'),
            stdin: () => {
                // Show the console input area
                stdinArea.classList.add('active');
                stdinField.focus();

                // On main thread we still need prompt() to pause execution
                // but now the user sees the console input context
                const result = window.prompt("Program needs input (see console):");

                stdinArea.classList.remove('active');
                if (result !== null) {
                    log(`> Input: ${result}`, 'system');
                    return result;
                }
                return "";
            }
        });

        // Pre-configure environment
        await pyodideInstance.runPythonAsync(`
import sys
from io import StringIO
# Preset some environment variables if needed
`);

        isEngineReady = true;

        // UI Updates
        engineBadge.classList.replace('loading', 'ready');
        engineBadge.querySelector('.shimmer')?.remove();
        statusText.textContent = "Engine Ready";
        runBtn.disabled = false;

        log("Runtime optimized and ready.", "system");

    } catch (err) {
        console.error("Boot Error:", err);
        statusText.textContent = "Boot Failed";
        log(`Fatal: ${err.message}`, "error");

        // Fallback info
        if (err.message.includes("fetch")) {
            log("Hint: Files might be missing in www/pyodide/", "system");
        }
    }
}

/**
 * Execute Script
 */
async function runScript() {
    if (!isEngineReady || !pyodideInstance) return;

    const code = codeEditor.value;
    if (!code.trim()) return;

    // UI Feedback
    runBtn.disabled = true;
    const originalText = runBtn.querySelector('span').textContent;
    runBtn.querySelector('span').textContent = "EXECUTING...";

    // Show console when execution starts
    outputPanel.classList.add('visible');

    log("--- Session Started ---", "system");

    try {
        // Run with a wrapper to handle async and clean results
        const result = await pyodideInstance.runPythonAsync(code);

        if (result !== undefined && result !== null) {
            log(`[Result]: ${result}`, "output");
        }
    } catch (err) {
        log(String(err), "error");
    } finally {
        runBtn.disabled = false;
        runBtn.querySelector('span').textContent = originalText;
        log("--- Session Finished ---", "system");
    }
}

// Listeners
runBtn.addEventListener('click', runScript);

clearBtn.addEventListener('click', () => {
    if (confirm("Clear code workspace?")) {
        codeEditor.value = "";
    }
});

clearOutputBtn.addEventListener('click', () => {
    terminal.innerHTML = "";
    log("Console cleared.", "system");
});

closeOutputBtn.addEventListener('click', () => {
    outputPanel.classList.remove('visible');
});

// Auto-boot on load
window.addEventListener('load', bootEngine);
