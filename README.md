# do-system — LQ-310 網頁送貨單列印 (本機版)

本機端開網頁填送貨單 → 預覽 → 從 EPSON LQ-310 (ESC/P2 點陣機) 印出一張紙。
macOS 開發/測試,走 CUPS `lp -o raw`。無線上資料庫、無線上部署。

## 架構

```
Next.js 網頁 (:3000)  ──POST {printer, data(base64)}──▶  Python print agent (:9100)  ──lp -o raw──▶  LQ-310
 CRUD + 預覽 + ESC/P 產生                                  Flask + CORS + CUPS
```

## 元件

| 路徑 | 說明 | Issue |
|---|---|---|
| `frontend/` | Next.js:送貨單 CRUD、總額計算、CSS 三聯單預覽、X/Y 位置微調 | #1 |
| `frontend/lib/escp.ts` | ESC/P2 產生器 + 列印 client | #2 |
| `print-agent/` | Flask:收 base64 → CUPS `lp -o raw` → LQ-310 | #3 |
| `frontend/lib/contract.ts` | 三方共用介面契約 | — |
| `docs/` | 設計文件與原始 guide | — |

## 本機啟動

### 1. Print agent (terminal A)
```bash
cd print-agent
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python app.py            # http://localhost:9100
```

### 2. 網頁 (terminal B)
```bash
cd frontend
npm install
npm run dev              # http://localhost:3000
```

### 3. macOS 印表機設定 (接 LQ-310 那台)
```bash
# 列出可用 USB 裝置
lpinfo -v
# 建一個 raw queue 給 LQ-310
sudo lpadmin -p LQ-310 -E -v "usb://EPSON/LQ-310" -m raw
lpstat -p               # 確認 LQ-310 在清單
```

## 介面契約

`POST http://localhost:9100/print`
```json
{ "printer": "LQ-310", "data": "<base64 of ESC/P2 bytes>" }
```
→ `{ "ok": true, "job_id": "LQ-310-42" }`

`GET http://localhost:9100/printers` → `{ "printers": ["LQ-310", "..."] }`

詳見 `frontend/lib/contract.ts` 與 `docs/superpowers/specs/2026-07-01-do-system-design.md`。

## 收工標準

- ✅ 網頁填一張送貨單 → 預覽 → 按列印 → LQ-310 吐出一張紙
- ✅ 網頁端可微調 X/Y 位置 (offset 輸入框)
