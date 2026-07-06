# Supabase 設定

do-system 前端**直連 Supabase**(Postgres + RLS)。此資料夾放 SQL migration。

> 安全模型:所有資料表都啟用 RLS,但政策對 anon(前端匿名 key)開放完整讀寫。
> 這是單一公司的內部工具,真正的存取控制是**整站共用密碼閘門**(Issue #C),
> 不是 Postgres row-level security。anon key 是 public 值,不要放機密資料。

## 1. 建立免費 Supabase 專案

1. 到 <https://supabase.com> 註冊並登入。
2. 點 **New project**,選一個 organization、填專案名稱、設定資料庫密碼、選就近 region。
3. 等專案 provision 完成(約 1–2 分鐘)。

> 注意:免費專案閒置 7 天會暫停,長假後首次開啟可能需要喚醒一下。

## 2. 執行 migration

資料表結構在 `supabase/migrations/0001_init.sql`。二選一:

### A. Supabase SQL Editor(最簡單)

1. 專案後台左側 **SQL Editor** → **New query**。
2. 貼上 `supabase/migrations/0001_init.sql` 全部內容,按 **Run**。

### B. Supabase CLI

```bash
# 安裝(macOS)
brew install supabase/tap/supabase

# 連到你的專案(<project-ref> 見專案設定 URL)
supabase link --project-ref <project-ref>

# 套用 repo 內的 migration
supabase db push
```

## 3. 取得連線資訊

專案後台 **Project Settings → API**:

- **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
- **Project API keys → anon / public** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## 4. 設定環境變數

### 本機

在 `frontend/` 下複製範本並填值:

```bash
cd frontend
cp .env.example .env.local
# 編輯 .env.local 填入上一步的兩個值
```

`.env.local` 已被 `.gitignore` 忽略,不會進版控。

### Vercel

專案 **Settings → Environment Variables**,新增(Production + Preview + Development):

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

改完環境變數後要 **redeploy** 才會生效。

## 5. 前端如何使用

```ts
import { supabase } from "@/lib/supabase";
import type { DeliveryOrderRow } from "@/lib/db-types";

const { data, error } = await supabase
  .from("delivery_orders")
  .select("*")
  .returns<DeliveryOrderRow[]>();
```

未設定 env 時,client 採延遲初始化:`npm run build` 不會崩潰,只有實際查詢時才會丟出清楚的錯誤訊息。可用 `isSupabaseConfigured` 判斷是否已設定。
