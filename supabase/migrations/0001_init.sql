-- 0001_init.sql — do-system 雲端送貨單管理系統 初始 schema
-- 資料模型見 docs/superpowers/specs/2026-07-06-cloud-system-plan.md
--
-- 安全模型(重要):這是「單一公司內部工具」。所有資料表都啟用 RLS,
-- 但政策對 anon 角色開放完整讀寫(select/insert/update/delete)。
-- 真正的存取控制是「整站共用密碼閘門」(見 Issue #C),而非 Postgres row-level。
-- 前端以 NEXT_PUBLIC anon key 直連 Supabase;不要在此 anon key 存放機密資料。

-- 需要 gen_random_uuid()(Postgres 13+ 內建於 pgcrypto)
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- delivery_orders — 送貨單(支援 metal 預設無金額 / standard 含金額 兩種版型)
-- ---------------------------------------------------------------------------
create table if not exists delivery_orders (
  id                uuid primary key default gen_random_uuid(),
  template          text not null default 'metal',   -- 'metal' | 'standard'
  order_no          text,                             -- 貨單號碼
  customer_name     text,
  address           text,
  phone             text,
  order_date        date,                             -- 存 ISO;畫面以民國年顯示
  remark            text,
  carrier           text,                             -- 承運車行
  vehicle_no        text,                             -- 車號
  lines             jsonb not null default '[]',      -- 品項列;結構依 template 而異
  subtotal          numeric,                          -- standard 用
  tax_amount        numeric,                          -- standard 用
  total             numeric,                          -- standard 用
  tax_id            text,                             -- standard 用(統編)
  invoice_no        text,                             -- standard 用(發票號碼)
  offset_x          int default 0,                    -- 列印水平微調
  offset_y          int default 0,                    -- 列印垂直微調
  status            text default 'draft',
  print_count       int default 0,
  first_printed_at  timestamptz,
  last_printed_at   timestamptz,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- customers — 客戶主檔(存檔時自動累積;選客戶自動帶出住址/電話/統編)
-- ---------------------------------------------------------------------------
create table if not exists customers (
  id             uuid primary key default gen_random_uuid(),
  customer_name  text,
  address        text,
  phone          text,
  tax_id         text,               -- standard 用
  use_count      int default 0,
  last_used_at   timestamptz,
  created_at     timestamptz default now()
);

-- 同名客戶只保留一筆(供 upsert on conflict)
create unique index if not exists customers_customer_name_key
  on customers (customer_name);

-- ---------------------------------------------------------------------------
-- items — 品項參考(metal autocomplete + Excel 匯入)
-- ---------------------------------------------------------------------------
create table if not exists items (
  id             uuid primary key default gen_random_uuid(),
  name           text,               -- 品名
  material       text,               -- 材質
  size           text,               -- 尺寸
  unit           text,
  price          numeric,            -- standard 用
  use_count      int default 0,
  last_used_at   timestamptz,
  created_at     timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- print_logs — 每次列印紀錄(供對帳)
-- ---------------------------------------------------------------------------
create table if not exists print_logs (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid references delivery_orders(id) on delete cascade,
  printed_at  timestamptz default now(),
  ok          boolean,
  job_id      text
);

-- ---------------------------------------------------------------------------
-- 有用的索引
-- ---------------------------------------------------------------------------
create index if not exists delivery_orders_order_no_idx      on delivery_orders (order_no);
create index if not exists delivery_orders_customer_name_idx on delivery_orders (customer_name);
create index if not exists delivery_orders_order_date_idx    on delivery_orders (order_date);
create index if not exists delivery_orders_created_at_idx    on delivery_orders (created_at);
create index if not exists print_logs_order_id_idx           on print_logs (order_id);

-- ---------------------------------------------------------------------------
-- 觸發器:更新 delivery_orders 時自動刷新 updated_at
-- ---------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists delivery_orders_set_updated_at on delivery_orders;
create trigger delivery_orders_set_updated_at
  before update on delivery_orders
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
--
-- 啟用 RLS,但對 anon(前端匿名 key)開放完整讀寫。
-- 站台級驗證由「共用密碼閘門」(Issue #C)負責,而非這裡的 row 政策。
-- 若日後要做多租戶,再收緊這些政策。
-- ---------------------------------------------------------------------------
alter table delivery_orders enable row level security;
alter table customers       enable row level security;
alter table items           enable row level security;
alter table print_logs      enable row level security;

-- delivery_orders
drop policy if exists delivery_orders_anon_all on delivery_orders;
create policy delivery_orders_anon_all on delivery_orders
  for all to anon using (true) with check (true);

-- customers
drop policy if exists customers_anon_all on customers;
create policy customers_anon_all on customers
  for all to anon using (true) with check (true);

-- items
drop policy if exists items_anon_all on items;
create policy items_anon_all on items
  for all to anon using (true) with check (true);

-- print_logs
drop policy if exists print_logs_anon_all on print_logs;
create policy print_logs_anon_all on print_logs
  for all to anon using (true) with check (true);
