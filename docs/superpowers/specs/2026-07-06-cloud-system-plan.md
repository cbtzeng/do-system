# do-system 擴充案 — 雲端送貨單管理系統 實作計畫

> 日期:2026-07-06
> 基礎:已完成 MVP(公版 K 出貨單表單、預覽、ESC/P2 圖形列印管線、LQ-310 實機驗證通過)。
> 決策:Vercel 部署 · Supabase 免費方案 · 跨平台本機 agent(Mac & Windows)· 一組共用密碼 · 前端直連 Supabase(RLS)。

## 架構

```
                            ┌──────────── 客戶工廠電腦(Mac 或 Windows)───────────┐
                            │                                                      │
  Supabase (Postgres+RLS)  │   瀏覽器                                             │
        ▲  資料 CRUD       │   ├─ Vercel 上的 Next.js 網站 (HTTPS) ──直連──▶ Supabase
        └──────────────────┼───┤                                                  │
                            │   └─ fetch http://localhost:9100 ─▶ 本機 print agent ─USB─▶ LQ-310
                            └──────────────────────────────────────────────────────┘
```

- **網站**(Vercel):UI + 直連 Supabase 存取資料;前面加一道**共用密碼**閘門。
- **本機 agent**:跨平台(macOS 走 `lp -o raw`、Windows 走 `win32print`),提供 `/print-image`(PNG→ESC/P 點陣),CORS 允許 Vercel 網域 + localhost。
- **列印流程**(已驗證):瀏覽器把預覽 render 成 PNG → 送本機 agent → 轉 ESC/P 圖形 → LQ-310。中文、框線 OK。

## 資料模型(Supabase Postgres)

> 版型:支援兩種可切換 template —— **metal(峻晟金屬,預設,無金額)** 與 **standard(標準,含金額)**。

- **delivery_orders**:
  - 共同:`id(uuid)`, `template`('metal'|'standard'), `order_no`(貨單號碼), `customer_name`, `address`(住址), `phone`, `order_date`(存 ISO;畫面以**民國年**顯示,例 115 年 6 月 22 日), `remark`(備註), `carrier`(承運車行), `vehicle_no`(車號), `lines(jsonb)`, `offset_x`, `offset_y`, `status`, `print_count`, `first_printed_at`, `last_printed_at`, `created_at`, `updated_at`。
  - **metal 版** `lines`:`{ name 品名, material 材質, size 尺寸, sheets 片數, weight 重量 }`(無金額、無合計)。
  - **standard 版** `lines`:`{ name 品名/規格, unit 單位, qty 數量, price 單價 }`,另用 `subtotal`/`tax_amount`/`total`、`tax_id`/`invoice_no` 欄位。
  - 司機簽章 / 客戶簽收 = 預覽上的空白簽名欄,不建資料。
- **customers**(客戶主檔,存檔自動累積):`id`, `customer_name`, `address`, `phone`, `tax_id`(standard 用), `use_count`, `last_used_at`。→ 選客戶**自動帶出住址/電話**(standard 另帶統編)。
- **items**(品項參考,供 metal autocomplete + Excel 匯入):`id`, `name`(品名), `material`(材質), `size`(尺寸), `unit`, `price`(standard 用), `use_count`, `last_used_at`。→ 品名/材質/尺寸 各自獨立建議。
- **print_logs**(每次列印紀錄,供對帳):`id`, `order_id`, `printed_at`, `ok`, `job_id`。
- **全欄位歷史 autocomplete**:存檔時把欄位值累積進 customers / items;其餘自由欄位(承運車行、車號、備註…)以歷史 distinct 值即時建議。
- **RLS**:單一公司內部工具 → 資料表開 anon 讀寫,但整站由共用密碼閘門保護。

## 階段與 GitHub Issues

### Phase 0 — 峻晟真實版型 + 圖形列印(基礎)
- **#A0 改成峻晟真實出貨單版型 + 版型切換**:表單/預覽/escp 改成 **metal 版**(品名/材質/尺寸/片數/重量 + 客戶名稱/住址/電話 + 貨單號碼 + 民國年 + 備註/承運車行/車號 + 司機簽章/客戶簽收 空白欄 + 峻晟公司資訊固定模板),並保留可切換的 **standard(含金額)版**。無金額/無合計。
- **#A 圖形列印 end-to-end**:agent `/print-image`(Pillow,已備 `escp_image.py`)+ 前端 html-to-image 擷取預覽→PNG→送印 + 列印按鈕改走圖形 + 契約/測試更新。把目前重設計/版型/agent 全部 commit、合併回 `main`。

### Phase 1 — 雲端 + DB 基礎(報價項 1、5)
- **#B Supabase 建置 + 前端串接**:建 schema(SQL migration 進 repo)+ RLS + Supabase JS client + `.env` 設定。
- **#C 共用密碼閘門 + Vercel 部署**:網站前置密碼(middleware/cookie)+ 部署 Vercel + agent CORS 加上 Vercel 網域。

### Phase 2 — 送貨單存檔 / 清單 / 查詢 / 重印(報價項 2 + 你的需求)
- **#D 按列印即存檔**:每次按列印 → upsert 到 Supabase(新單 insert、舊單 update)+ 確認提示 + `print_count`/時間戳 + 寫 print_logs。
- **#E 歷史清單 + 查詢 + 重開編修重印**:清單 + 依單號/客戶/日期區間查詢 + 點開載回編輯器 → 改 → 存 → 重印(對位不好可重調再印)。

### Phase 3 — 主檔 + 全欄位 autocomplete(報價項 3、4 + 你的需求)
- **#F 品項主檔 + Excel 匯入**:items 表 + 上傳 Excel 匯入現成清單。
- **#G 全欄位 autocomplete**:
  - 客戶名稱 → 建議 + **選客戶自動帶出住址/電話**(standard 另帶統編)。
  - 品名 / 材質 / 尺寸 → **各欄獨立**從 items 歷史建議(同品名可多種材質/尺寸,不綁死);standard 版品名可帶單位/單價。
  - 承運車行 / 車號 / 備註 等自由欄位 → 以歷史 distinct 值即時建議。
  - **存檔時(#D)自動 upsert customers / items 主檔**,歷史越用越完整。

### Phase 4 — 區間匯出 Excel(你的需求:紙本對帳)
- **#H 區間匯出**:選日期區間 → 查詢 → 匯出 `.xlsx`(SheetJS/xlsx,前端產生下載)。

### Phase 5 — 跨平台本機 agent 打包(工廠兩種 OS,報價項 5)
- **#I 跨平台 agent**:Windows 版(win32print)+ 自動偵測 OS + 打包/啟動說明(Windows 打包 exe、Mac 附啟動腳本)+ CORS 設定。

## Subagent 執行波次(平行 / 相依)

- **Wave 1(可平行)**:#A(圖形列印,含 agent 收斂)、#B(Supabase schema+client)。
- **Wave 2(相依 #B)**:#C(密碼+部署)、#D(存檔)、#F(品名主檔)。
- **Wave 3**:#E(清單/查詢/重印,依 #D)、#G(autocomplete,依 #F)、#H(匯出,依 #B/#D)。
- **#I(跨平台 agent)**:依 #A 之後(避免與 agent 檔案衝突),可與 Wave 2/3 平行。

## 風險 / 需早期驗證

1. **HTTPS 網站 → http://localhost agent**:Chrome/Edge 把 localhost 視為安全來源,可 fetch(OK);Safari 大致 OK。**部署後第一件事就實測**。備案:agent 自簽 HTTPS 或本機 tunnel。
2. **Supabase 免費專案閒置 7 天會暫停**:每日使用不受影響;長假後首次開啟可能要喚醒。
3. **Windows agent**:USB raw 走 win32print + Generic/Text Only 驅動,需 Windows 現場實測。
4. **共用密碼**是輕量保護(內部工具足夠)。
5. **agent 需開機自動啟動**:打包時附自動啟動設定。

## 收工標準(對齊報價單)

- 客戶在工廠電腦開網站(輸入共用密碼)→ 開單 → 按列印 → 存進雲端 + LQ-310 印出完整三聯內容。
- 可查歷史(單號/客戶/日期)、重開編修重印。
- 品名 autocomplete 帶單位/單價;可 Excel 匯入品名主檔。
- 可選區間匯出 Excel 對帳。
- Mac 與 Windows 兩種工廠電腦皆可跑本機 agent 列印。
