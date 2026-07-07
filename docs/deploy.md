# 部署指南 — Vercel + Supabase + 本機列印 agent

> 對象:把雲端送貨單系統(Issue #C)上線到 Vercel。
> 架構:Vercel 上的 Next.js 網站(HTTPS)直連 Supabase;工廠電腦的瀏覽器另外 fetch `http://localhost:9100` 本機 print agent 出圖列印。

---

## 1. 前置

- GitHub repo:`cbtzeng/do-system`(Next.js app 在 `frontend/` 子目錄)。
- 一個 Supabase 專案(見 `supabase/README.md`,由 Issue #B 建置),取得:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- 一組共用密碼(自訂,給工廠同仁共用):`SITE_PASSWORD`。

---

## 2. 連接 GitHub repo 到 Vercel

1. 登入 <https://vercel.com> → **Add New… → Project**。
2. 選 **Import Git Repository** → 授權並選 `cbtzeng/do-system`。
3. **Root Directory**:設為 `frontend`(app 不在 repo 根目錄)。
   - 在 Import 畫面的 *Root Directory* 欄按 **Edit** → 選 `frontend`。
4. **Framework Preset**:應自動偵測為 **Next.js**(`frontend/vercel.json` 亦已標明)。
5. Build / Output 用預設即可(`next build`)。

---

## 3. 設定環境變數(Environment Variables)

在 Vercel 專案 → **Settings → Environment Variables** 新增以下三個,套用到 **Production**(建議也套 Preview):

| Name | 值 | 說明 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 專案 URL | 前端直連 Supabase(public 值) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key | public 值;真正保護靠共用密碼閘門 |
| `SITE_PASSWORD` | 你的共用密碼 | **正式環境必填**。共用密碼閘門用它產出/驗證授權 cookie |

> **重要:`SITE_PASSWORD` 在正式環境務必設定。**
> 為了讓 `npm run build` 在沒有 env 的環境也能通過,程式在 `SITE_PASSWORD` 未設定時會**放行整站(不啟用密碼閘門)**。若正式環境忘了設,網站將對外**完全開放**。設定後重新部署即生效。

改動環境變數後,到 **Deployments** 對最新一筆按 **Redeploy** 讓變數生效。

---

## 4. 共用密碼閘門怎麼運作(參考)

- Next.js 16 的 `frontend/proxy.ts`(即舊版 `middleware`,Next 16 已更名為 Proxy)攔截所有頁面。
- 沒有有效 `site_auth` cookie → 導向 `/login`。
- `/login` 表單 POST 到 `/api/login`,以**常數時間**比對 `SITE_PASSWORD`。
- 成功後設一個 **HttpOnly** cookie,值為 `HMAC-SHA256(固定訊息, key=SITE_PASSWORD)` —— **不儲存原始密碼**;proxy 重算同一個 HMAC 驗證。
- 頂部導覽的「登出」POST 到 `/api/logout` 清除 cookie。

這是輕量保護,適合單一公司內部工具(見計畫書風險 4)。

---

## 5. 部署後驗證(務必逐項確認)

1. **密碼閘門**
   - 開 Production 網址 → 應被導向 `/login`。
   - 輸入錯誤密碼 → 顯示「密碼錯誤」。
   - 輸入正確 `SITE_PASSWORD` → 進入開單頁,重新整理仍保持登入。
   - 按「登出」→ 回到 `/login`。
2. **Supabase 連線**:進站後確認資料相關功能(由 #B/#D 提供)能讀寫,沒有「Supabase env 未設定」錯誤。
3. **本機列印 agent(關鍵路徑,計畫書風險 1)**
   - 在**工廠電腦**先啟動本機 print agent(見 `print-agent/`;監聽 `:9100`)。
   - 用 **Chrome 或 Edge** 開 Production(HTTPS)網站。
   - 實測列印:預覽 → 送印 → LQ-310 印出。
     - 瀏覽器會從 HTTPS 頁面 fetch `http://localhost:9100`。Chrome/Edge 把 `localhost` 視為**安全來源**,允許此混合請求(Safari 大致 OK)。
     - agent 端的 CORS 需允許 Vercel 網域 +（開發時）localhost。
   - 快速檢查(不出紙):在網站分頁的 DevTools Console 執行
     ```js
     fetch("http://localhost:9100/health").then(r => r.text()).then(console.log)
     ```
     能回應即代表 HTTPS→localhost 這條路徑通。若被 CORS 擋,調整 agent 的允許來源。
   - **備案**(若某環境擋掉 http→localhost):agent 自簽 HTTPS,或用本機 tunnel。

---

## 6. 常見問題

- **部署成功但整站不需密碼就能進**:`SITE_PASSWORD` 未設定或未 Redeploy。補設定後 Redeploy。
- **Build 失敗找不到 app**:Root Directory 沒設成 `frontend`。
- **Supabase 免費專案閒置 7 天會暫停**:長假後首次開啟可能要先喚醒(計畫書風險 2)。
