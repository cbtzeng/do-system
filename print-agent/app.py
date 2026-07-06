"""LQ-310 本機 print agent (Issue #3)。

職責:在 localhost:9100 開 HTTP server,收 base64 ESC/P2 bytes,
經 macOS CUPS `lp -d <printer> -o raw` 送到 LQ-310。

介面契約見 frontend/lib/contract.ts:
  POST /print        body {printer, data(base64)} -> {ok, job_id} | {ok:false, error}
  POST /print-image  body {printer, image(base64 PNG), width_dots?} -> {ok, job_id} | {ok:false, error}
  GET  /printers     -> {printers: [...]}
  CORS: 允許 http://localhost:3000
"""

import base64
import binascii
import re
import subprocess

from flask import Flask, jsonify, request
from flask_cors import CORS

from escp_image import render_png_to_escp

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

    return _lp_raw(printer, raw)


def _lp_raw(printer: str, raw: bytes):
    """把 raw bytes 經 `lp -d <printer> -o raw` 送到印表機,回傳 Flask 回應。

    以 list 傳參,絕不用 shell=True / 字串插值,printer 名稱安全。
    """
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


@app.post("/print-image")
def print_image_route():
    """圖形列印(WYSIWYG):收 base64 PNG → escp_image 轉 ESC/P 點陣 → lp -o raw。"""
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        return jsonify(ok=False, error="invalid JSON body"), 400

    printer = body.get("printer")
    image = body.get("image")
    width_dots = body.get("width_dots")

    if not printer or not isinstance(printer, str):
        return jsonify(ok=False, error="missing or invalid 'printer'"), 400
    if not isinstance(image, str) or image == "":
        return jsonify(ok=False, error="missing or invalid 'image'"), 400

    # 去掉可能的 data: 前綴,只取 base64 本體。
    if "," in image and image.strip().startswith("data:"):
        image = image.split(",", 1)[1]

    # base64 decode(嚴格,壞資料即報錯)
    try:
        png = base64.b64decode(image, validate=True)
    except (binascii.Error, ValueError):
        return jsonify(ok=False, error="invalid base64 image"), 400

    # width_dots:可選,預設 1400。
    try:
        w = int(width_dots) if width_dots is not None else 1400
    except (TypeError, ValueError):
        return jsonify(ok=False, error="invalid 'width_dots'"), 400
    if w <= 0:
        return jsonify(ok=False, error="invalid 'width_dots'"), 400

    # PNG → ESC/P 點陣
    try:
        raw = render_png_to_escp(png, w)
    except Exception as exc:  # noqa: BLE001 — 回報給前端,勿讓 agent 掛掉
        return jsonify(ok=False, error=f"image render failed: {exc}"), 400

    return _lp_raw(printer, raw)


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
