"""LQ-310 本機 print agent (Issue #3)。

職責:在 localhost:9100 開 HTTP server,收 base64 ESC/P2 bytes,
經 macOS CUPS `lp -d <printer> -o raw` 送到 LQ-310。

介面契約見 frontend/lib/contract.ts:
  POST /print     body {printer, data(base64)} -> {ok, job_id} | {ok:false, error}
  GET  /printers  -> {printers: [...]}
  CORS: 允許 http://localhost:3000
"""

import base64
import binascii
import re
import subprocess

from flask import Flask, jsonify, request
from flask_cors import CORS

PORT = 9100
ALLOWED_ORIGIN = "http://localhost:3000"

app = Flask(__name__)
# CORS:只允許前端 origin,涵蓋 OPTIONS preflight。
CORS(app, origins=[ALLOWED_ORIGIN])


def _parse_job_id(stdout: str) -> str:
    """從 lp stdout 解析 request id。

    `lp` 典型輸出: "request id is EPSON_LQ-310-42 (1 file(s))"
    回傳 "EPSON_LQ-310-42";解析不到時回傳整段(去除前後空白)。
    """
    if not stdout:
        return ""
    m = re.search(r"request id is (\S+)", stdout)
    if m:
        return m.group(1)
    return stdout.strip()


@app.post("/print")
def print_route():
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        return jsonify(ok=False, error="invalid JSON body"), 400

    printer = body.get("printer")
    data = body.get("data")

    if not printer or not isinstance(printer, str):
        return jsonify(ok=False, error="missing or invalid 'printer'"), 400
    if not isinstance(data, str) or data == "":
        return jsonify(ok=False, error="missing or invalid 'data'"), 400

    # base64 decode(嚴格,壞資料即報錯)
    try:
        raw = base64.b64decode(data, validate=True)
    except (binascii.Error, ValueError):
        return jsonify(ok=False, error="invalid base64 data"), 400

    # 以 list 傳參,絕不用 shell=True / 字串插值,printer 名稱安全。
    cmd = ["lp", "-d", printer, "-o", "raw"]
    try:
        result = subprocess.run(
            cmd,
            input=raw,
            capture_output=True,
        )
    except FileNotFoundError:
        return jsonify(ok=False, error="lp command not found"), 500

    if result.returncode != 0:
        err = (result.stderr or b"").decode("utf-8", "replace").strip()
        return jsonify(ok=False, error=err or "lp failed"), 500

    stdout = (result.stdout or b"").decode("utf-8", "replace")
    return jsonify(ok=True, job_id=_parse_job_id(stdout))


def _parse_printers(stdout: str) -> list:
    """從 `lpstat -p` 輸出解析印表機名稱。

    典型行: "printer EPSON_LQ-310 is idle.  enabled since ..."
    """
    printers = []
    for line in stdout.splitlines():
        m = re.match(r"printer (\S+)", line)
        if m:
            printers.append(m.group(1))
    return printers


@app.get("/printers")
def printers_route():
    try:
        result = subprocess.run(
            ["lpstat", "-p"],
            capture_output=True,
        )
    except FileNotFoundError:
        return jsonify(printers=[]), 500

    stdout = (result.stdout or b"").decode("utf-8", "replace")
    return jsonify(printers=_parse_printers(stdout))


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=PORT)
