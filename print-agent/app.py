"""LQ-310 本機 print agent 骨架 (Issue #3 中實作完整邏輯)。

職責:在 localhost:9100 開 HTTP server,收 base64 ESC/P2 bytes,
經 macOS CUPS `lp -d <printer> -o raw` 送到 LQ-310。

介面契約見 frontend/lib/contract.ts:
  POST /print     body {printer, data(base64)} -> {ok, job_id} | {ok:false, error}
  GET  /printers  -> {printers: [...]}
  CORS: 允許 http://localhost:3000
"""

# Issue #3 在此實作。骨架僅標示預期形狀。

PORT = 9100
ALLOWED_ORIGIN = "http://localhost:3000"

if __name__ == "__main__":
    raise SystemExit("print-agent 尚未實作 — 見 Issue #3")
