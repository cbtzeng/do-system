"""LQ-310 本機 print agent (Issue #3, 跨平台 #17)。

職責:在 localhost:9100 開 HTTP server,收 base64 ESC/P2 bytes(或 PNG),
經跨平台後端 `printer_backend` 送到 LQ-310:
  - macOS / Linux:CUPS `lp -d <printer> -o raw`
  - Windows:      win32print RAW passthrough

介面契約見 frontend/lib/contract.ts:
  POST /print        body {printer, data(base64)} -> {ok, job_id} | {ok:false, error}
  POST /print-image  body {printer, image(base64 PNG), width_dots?} -> {ok, job_id} | {ok:false, error}
  GET  /printers     -> {printers: [...]}
  CORS: 允許的 origin 由環境變數 ALLOWED_ORIGINS(逗號分隔)決定,
        預設 http://localhost:3000。可加上部署後的 Vercel 網域。
"""

import base64
import binascii
import os

from flask import Flask, jsonify, request
from flask_cors import CORS

import printer_backend
from escp_image import render_png_to_escp

PORT = 9100


def _allowed_origins() -> list:
    """從環境變數 ALLOWED_ORIGINS(逗號分隔)讀允許的 origin。

    預設 http://localhost:3000。部署後可設成
    "http://localhost:3000,https://your-app.vercel.app"。
    """
    raw = os.environ.get("ALLOWED_ORIGINS", "http://localhost:3000")
    origins = [o.strip() for o in raw.split(",") if o.strip()]
    return origins or ["http://localhost:3000"]


app = Flask(__name__)
# CORS:只允許設定的 origins,涵蓋 OPTIONS preflight。
CORS(app, origins=_allowed_origins())


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

    return _send_raw(printer, raw)


def _send_raw(printer: str, raw: bytes):
    """把 raw bytes 經 printer_backend 送到印表機,回傳 Flask 回應。"""
    try:
        job_id = printer_backend.send_raw(printer, raw)
    except printer_backend.PrinterError as exc:
        return jsonify(ok=False, error=str(exc)), 500
    return jsonify(ok=True, job_id=job_id)


@app.post("/print-image")
def print_image_route():
    """圖形列印(WYSIWYG):收 base64 PNG → escp_image 轉 ESC/P 點陣 → send_raw。"""
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

    return _send_raw(printer, raw)


@app.get("/printers")
def printers_route():
    try:
        printers = printer_backend.list_printers()
    except printer_backend.PrinterError:
        return jsonify(printers=[]), 500
    return jsonify(printers=printers)


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=PORT)
