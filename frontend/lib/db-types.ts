// Supabase 資料表對應的 TypeScript 介面。
// 對應 supabase/migrations/0001_init.sql。
// 注意:欄位命名採資料庫的 snake_case(直接對應 select 回傳的 row)。

/** delivery_orders row */
export interface DeliveryOrderRow {
  id: string;
  template: string; // 'metal' | 'standard'
  order_no: string | null; // 貨單號碼
  customer_name: string | null;
  address: string | null;
  phone: string | null;
  order_date: string | null; // ISO date (YYYY-MM-DD)
  remark: string | null;
  carrier: string | null; // 承運車行
  vehicle_no: string | null; // 車號
  lines: DeliveryOrderLine[]; // jsonb;結構依 template 而異
  subtotal: number | null; // standard 用
  tax_amount: number | null; // standard 用
  total: number | null; // standard 用
  tax_id: string | null; // standard 用(統編)
  invoice_no: string | null; // standard 用(發票號碼)
  offset_x: number;
  offset_y: number;
  status: string; // 'draft' 等
  print_count: number;
  first_printed_at: string | null; // timestamptz
  last_printed_at: string | null; // timestamptz
  created_at: string; // timestamptz
  updated_at: string; // timestamptz
}

/** metal 版品項列(無金額) */
export interface MetalLine {
  name: string; // 品名
  material: string; // 材質
  size: string; // 尺寸
  sheets: number; // 片數
  weight: number; // 重量
}

/** standard 版品項列(含金額) */
export interface StandardLine {
  name: string; // 品名 / 規格
  unit: string; // 單位
  qty: number; // 數量
  price: number; // 單價
}

/** delivery_orders.lines 的元素;實際型別依 template 而定 */
export type DeliveryOrderLine = MetalLine | StandardLine;

/** customers row(客戶主檔) */
export interface CustomerRow {
  id: string;
  customer_name: string | null;
  address: string | null;
  phone: string | null;
  tax_id: string | null; // standard 用
  use_count: number;
  last_used_at: string | null; // timestamptz
  created_at: string; // timestamptz
}

/** items row(品項參考) */
export interface ItemRow {
  id: string;
  name: string | null; // 品名
  material: string | null; // 材質
  size: string | null; // 尺寸
  unit: string | null;
  price: number | null; // standard 用
  use_count: number;
  last_used_at: string | null; // timestamptz
  created_at: string; // timestamptz
}

/** print_logs row(每次列印紀錄) */
export interface PrintLogRow {
  id: string;
  order_id: string | null;
  printed_at: string; // timestamptz
  ok: boolean | null;
  job_id: string | null;
}
