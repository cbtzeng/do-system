-- 0002_billing_status.sql — 對帳單入帳狀態(Issue #44)
--
-- ⚠️ 這個 migration 需在 Supabase SQL editor 手動執行(無法從程式端跑)。
-- 為 delivery_orders 加上「入帳狀態」欄位,供對帳單頁逐筆/多筆標記:
--   unbilled 未入帳(預設) / billed 已請款 / paid 已收款
-- 狀態屬於「出貨單(整筆單)」,對帳單列出的品項列共用其所屬單的狀態。

-- 加欄位(冪等:已存在則略過)。預設未入帳。
alter table delivery_orders
  add column if not exists billing_status text not null default 'unbilled';

-- 只允許三個合法值(先移除舊約束再建立,維持冪等)。
alter table delivery_orders
  drop constraint if exists delivery_orders_billing_status_chk;
alter table delivery_orders
  add constraint delivery_orders_billing_status_chk
  check (billing_status in ('unbilled', 'billed', 'paid'));

-- 依狀態查詢/篩選用的索引。
create index if not exists delivery_orders_billing_status_idx
  on delivery_orders (billing_status);
