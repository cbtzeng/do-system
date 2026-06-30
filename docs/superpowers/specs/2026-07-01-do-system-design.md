# do-system — LQ-310 網頁送貨單列印 (本機版) 設計

> 日期:2026-07-01
> 目標:本機端 `localhost` 開網頁填送貨單 → 預覽 → 從 EPSON LQ-310 印出一張紙。
> 平台:macOS 開發與測試(原 guide 為 Windows,本設計改用 CUPS)。

## 1. 範圍

**做:**
- Next.js 網頁:送貨單 CRUD 表單(品名/尺寸/數量/單價,可多列)、自動算小計+總額、CSS 三聯單預覽框、X/Y 位置微調。
- ESC/P2 產生器(TypeScript):表單資料 → ESC/P2 byte array → base64。
- Python print agent(Flask + CORS):收 base64 → CUPS `lp -o raw` → LQ-310。

**先不做(對齊原 guide「明天先不做」):**
- 線上資料庫(用 `useState` 記憶體狀態)
- 線上部署(純本機 localhost)
- 登入 / autocomplete / 完美對位 / 完整三聯版面

## 2. 架構

```
┌──────────────────────┐   POST {printer, data(base64)}   ┌─────────────────────┐   lp -o raw   ┌─────────┐
│ Next.js 網頁          │ ────── http://localhost:9100 ──→ │ Python print agent  │ ───CUPS───→  │ LQ-310  │
│ frontend/ :3000      │                                  │ print-agent/ Flask  │              │ (raw)   │
│ CRUD+預覽+ESC/P產生   │                                  │ +CORS, lp -o raw    │              │         │
└──────────────────────┘                                  └─────────────────────┘              └─────────┘
```

全程記憶體狀態,無 DB、無登入、無線上部署。

## 3. Repo 結構

```
do-system/
├── frontend/          Next.js (Issue #1 + #2)
│   ├── app/
│   ├── lib/escp.ts    ESC/P2 產生器 (Issue #2)
│   └── lib/printClient.ts  呼叫 agent 的 client
├── print-agent/       Python Flask + CUPS (Issue #3)
│   ├── app.py
│   └── requirements.txt
├── docs/              本設計與原 guide
└── README.md          整合與啟動說明
```

## 4. 介面契約(先定好,3 個 worktree 才能平行)

### 4.1 Print agent HTTP API

`POST http://localhost:9100/print`

Request body:
```json
{ "printer": "LQ-310", "data": "<base64 of ESC/P2 bytes>" }
```
Response:
```json
{ "ok": true, "job_id": "LQ-310-42" }
```
錯誤回 `{ "ok": false, "error": "<message>" }`,HTTP 4xx/5xx。

`GET http://localhost:9100/printers` → `{ "printers": ["LQ-310", "..."] }`(供網頁下拉選單)。

CORS:`Access-Control-Allow-Origin: http://localhost:3000`(含 OPTIONS preflight)。

### 4.2 ESC/P 產生器介面(frontend/lib/escp.ts)

```ts
export interface DoLine { name: string; size: string; qty: number; price: number }
export interface DoForm {
  lines: DoLine[];
  offsetX: number;   // 水平微調,單位 1/60 吋 (ESC $)
  offsetY: number;   // 垂直微調,單位 1/180 吋 (ESC 3)
}
export function buildEscp(form: DoForm): Uint8Array  // 含 ESC @ 初始化、定位、LF、FF
export function toBase64(bytes: Uint8Array): string
```

ESC/P2 關鍵指令:`ESC @`(初始化)、`ESC $ nL nH`(絕對水平)、`ESC 3 n`(行距 n/180)、`LF`、`FF`、`ESC E`/`ESC F`(粗體)。第一版先全英數驗證通道,中文 code page 之後再處理。

## 5. 三個平行 Issue

| # | 標題 | 範圍 | 主要檔案 | 驗收 |
|---|---|---|---|---|
| 1 | 網頁 CRUD + 預覽 | 多列表單、自動算小計+總額、CSS 三聯單預覽框 | `frontend/app/page.tsx`, components | 可新增/刪除列、總額即時更新、預覽框反映輸入 |
| 2 | ESC/P2 產生器 + 列印按鈕 + 位置微調 | `buildEscp` 模組、X/Y offset 輸入框、列印按鈕 POST 到 agent | `frontend/lib/escp.ts`, `lib/printClient.ts` | 單元測試驗證 byte 序列;按鈕送出 base64;offset 改變反映在 bytes |
| 3 | Python print agent (Mac CUPS) | Flask 收 base64、`lp -d <printer> -o raw`、`/printers`、CORS | `print-agent/app.py` | 收 POST 印出;`/printers` 回清單;CORS preflight 通過;單元測試 mock subprocess |

## 6. 執行流程(對齊 airexpert worktree skill,改用本 repo)

1. 在 `main` scaffold 骨架(Next.js 空殼 + print-agent 骨架 + 介面契約 stub + README),commit & push。
2. 建 3 個 GitHub issues(上表)。
3. 每個 issue 開一個 worktree(`.worktrees/issue-N`,branch off `origin/main`),subagent 各自 TDD 實作 → commit → push → PR。
4. 整合:合併 3 個 PR,本機 `npm run dev`(:3000)+ `python app.py`(:9100),接印表機驗證。

## 7. 收工標準

- ✅ 網頁填一張送貨單
- ✅ 能預覽
- ✅ 按列印,LQ-310 真的吐出一張紙(位置先不要求完美)
- ✅ 網頁端可微調 X/Y 位置(offset 輸入框)

## 8. 預期會卡的點

1. macOS CUPS 需裝一個 raw/Generic queue 給 LQ-310(`lpadmin -p LQ-310 -E -v usb://... -m raw`)。
2. CUPS 可能佔用 USB,所以走 `lp -o raw` 而非直接寫裝置。
3. CORS preflight(OPTIONS)要正確回應。
4. 中文 code page — 第一版先全英數驗證通道。
5. 對位偏移 1–2mm 是點陣機天性,用 offset 微調吸收。
