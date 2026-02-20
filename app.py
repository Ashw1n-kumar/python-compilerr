from flask import Flask, request, jsonify, render_template, send_from_directory
import subprocess
import tempfile
import os
from pathlib import Path

app = Flask(__name__)

# Directory to store user scripts
BASE_DIR = Path(__file__).resolve().parent
SCRIPTS_DIR = BASE_DIR / "saved_scripts"
SCRIPTS_DIR.mkdir(exist_ok=True)


@app.route("/")
def home():
    # Serve a static index if available; fallback to a simple message
    try:
        return render_template("index.html")
    except Exception:
        return "Python runner server. Use the API to save/run scripts."


def safe_name(name: str) -> str:
    # Remove path separators and keep only basename
    name = os.path.basename(name)
    if not (name.endswith(".py") or name.endswith(".cpp") or name.endswith(".java")):
        # Default to .py if no supported extension is found
        name = f"{name}.py"
    return name


@app.route("/save-script", methods=["POST"])
def save_script():
    data = request.json or {}
    name = data.get("name")
    code = data.get("code", "")
    if not name:
        return jsonify({"error": "Missing script name"}), 400
    name = safe_name(name)
    path = SCRIPTS_DIR / name
    path.write_text(code, encoding="utf-8")
    return jsonify({"ok": True, "name": name})


@app.route("/scripts", methods=["GET"])
def list_scripts():
    supported = [".py", ".cpp", ".java"]
    files = [f.name for f in SCRIPTS_DIR.iterdir() if f.is_file() and f.suffix in supported]
    return jsonify({"scripts": files})


@app.route("/script/<path:name>", methods=["GET"])
def get_script(name):
    name = safe_name(name)
    path = SCRIPTS_DIR / name
    if not path.exists():
        return jsonify({"error": "Not found"}), 404
    return jsonify({"name": name, "code": path.read_text(encoding="utf-8")})


@app.route("/run-script", methods=["POST"])
def run_script():
    data = request.json or {}
    name = data.get("name")
    code = data.get("code")
    user_input = data.get("input", "")

    # If name provided, prefer running saved script
    if name:
        name = safe_name(name)
        path = SCRIPTS_DIR / name
        if not path.exists():
            return jsonify({"error": "Script not found"}), 404
        run_path = str(path)
    else:
        # write code to a temp file and run
        if not code:
            return jsonify({"error": "No code or name provided"}), 400
        tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".py")
        tmp.write(code.encode())
        tmp.close()
        run_path = tmp.name

    try:
        result = subprocess.run(
            ["python3", run_path],
            input=user_input,
            capture_output=True,
            text=True,
            timeout=15,
        )
        output = result.stdout + result.stderr
    except subprocess.TimeoutExpired:
        output = "Execution timed out."

    # If we created a temp file, remove it
    if not name and 'tmp' in locals():
        try:
            os.remove(run_path)
        except Exception:
            pass

    return jsonify({"output": output})


@app.route("/download-script/<path:name>")
def download_script(name):
    name = safe_name(name)
    return send_from_directory(directory=str(SCRIPTS_DIR), filename=name, as_attachment=True)


@app.route("/run", methods=["POST"])
def run_code():
    # legacy endpoint: run code directly from POST body
    code = request.json.get("code")
    user_input = request.json.get("input", "")

    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".py")
    tmp.write(code.encode())
    tmp.close()
    try:
        result = subprocess.run(
            ["python3", tmp.name],
            input=user_input,
            capture_output=True,
            text=True,
            timeout=10,
        )
        output = result.stdout + result.stderr
    except subprocess.TimeoutExpired:
        output = "Execution timed out."
    finally:
        try:
            os.remove(tmp.name)
        except Exception:
            pass

    return jsonify({"output": output})


if __name__ == "__main__":
    app.run(debug=True, port=5001)
