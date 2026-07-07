// 區間匯出 Excel(對帳)。
//
// 選日期區間 → 查 delivery_orders → 攤平每張單的 lines 成「一列一品項」的表格,
// 讓紙本出貨單可以逐行對帳 → 產生 .xlsx 讓瀏覽器下載(SheetJS/xlsx)。
//
// 全部在前端(browser)直連 Supabase;未設定 env 時 getSupabase() 會在查詢時丟出清楚的錯,
// UI 應以 isSupabaseConfigured 先擋。buildWorkbook 為純函式、不碰網路,方便單元測試。

import * as XLSX from "xlsx";
import { getSupabase } from "./supabase";
import type {
  DeliveryOrderRow,
  DeliveryOrderLine,
  MetalLine,
  StandardLine,
} from "./db-types";

// ---- 型別守衛:依欄位判斷 line 是 metal 還是 standard ----

function isStandardLine(line: DeliveryOrderLine): line is StandardLine {
  return (
    typeof (line as StandardLine).unit !== "undefined" ||
    typeof (line as StandardLine).qty !== "undefined" ||
    typeof (line as StandardLine).price !== "undefined"
  );
}

// ---- 小工具 ----

/** 空值安全:null/undefined → 空字串;其餘照原值。 */
function safe<T>(v: T | null | undefined): T | "" {
  return v === null || v === undefined ? "" : v;
}

/** 數字空值安全:非有限數 → 空字串。 */
function safeNum(v: number | null | undefined): number | "" {
  return typeof v === "number" && Number.isFinite(v) ? v : "";
}

/** 攤平後的一列(欄位以中文表頭為 key)。 */
export type ExportRow = Record<string, string | number>;

// metal 表頭:貨單號碼 / 日期 / 客戶 / 品名 / 材質 / 尺寸 / 片數 / 重量
const METAL_HEADERS = [
  "貨單號碼",
  "日期",
  "客戶",
  "品名",
  "材質",
  "尺寸",
  "片數",
  "重量",
] as const;

// standard 表頭:另含 單位 / 數量 / 單價 / 金額
const STANDARD_HEADERS = [
  "貨單號碼",
  "日期",
  "客戶",
  "品名",
  "單位",
  "數量",
  "單價",
  "金額",
] as const;

/**
 * 把單張 order 攤平成多列(一列一品項),重複帶入表頭資訊(貨單號碼/日期/客戶)。
 * 空白單(無 lines)也會輸出一列,只有表頭資訊,方便對帳看到這張單存在。
 */
export function flattenOrder(order: DeliveryOrderRow): ExportRow[] {
  const header = {
    貨單號碼: safe(order.order_no),
    日期: safe(order.order_date),
    客戶: safe(order.customer_name),
  };

  const lines = Array.isArray(order.lines) ? order.lines : [];
  const isStandard = order.template === "standard";

  if (lines.length === 0) {
    // 沒有品項也保留一列,欄位補齊(依版型)以維持表格對齊。
    if (isStandard) {
      return [{ ...header, 品名: "", 單位: "", 數量: "", 單價: "", 金額: "" }];
    }
    return [{ ...header, 品名: "", 材質: "", 尺寸: "", 片數: "", 重量: "" }];
  }

  return lines.map((line) => {
    if (isStandard || isStandardLine(line)) {
      const l = line as StandardLine;
      const qty = safeNum(l.qty);
      const price = safeNum(l.price);
      const amount =
        typeof qty === "number" && typeof price === "number" ? qty * price : "";
      return {
        ...header,
        品名: safe(l.name),
        單位: safe(l.unit),
        數量: qty,
        單價: price,
        金額: amount,
      };
    }
    const l = line as MetalLine;
    return {
      ...header,
      品名: safe(l.name),
      材質: safe(l.material),
      尺寸: safe(l.size),
      片數: safeNum(l.sheets),
      重量: safeNum(l.weight),
    };
  });
}

/**
 * 依日期區間查 delivery_orders(以 order_date 為主,order_date 為 null 者退回 created_at 排序尾端)。
 * from/to 皆為 'YYYY-MM-DD';含頭含尾(to 用 lte)。
 */
export async function fetchOrdersInRange(
  from: string,
  to: string,
): Promise<DeliveryOrderRow[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("delivery_orders")
    .select("*")
    .gte("order_date", from)
    .lte("order_date", to)
    .order("order_date", { ascending: true })
    .order("order_no", { ascending: true });
  if (error) throw error;
  return (data ?? []) as DeliveryOrderRow[];
}

/**
 * 由 orders 產生一本 workbook。
 * - 依版型分兩張工作表:「峻晟(metal)」與「標準(standard)」,
 *   讓 metal(無金額)與 standard(含金額)欄位不會互相混欄。
 * - 只有存在資料的工作表才建立;若全部為某一版型,另一張不建。
 * - 若完全沒有資料,仍建立一張空的 metal 表(含表頭),避免空 workbook。
 */
export function buildWorkbook(orders: DeliveryOrderRow[]): XLSX.WorkBook {
  const metalRows: ExportRow[] = [];
  const standardRows: ExportRow[] = [];

  for (const order of orders) {
    const rows = flattenOrder(order);
    if (order.template === "standard") standardRows.push(...rows);
    else metalRows.push(...rows);
  }

  const wb = XLSX.utils.book_new();

  if (metalRows.length > 0 || standardRows.length === 0) {
    const ws = XLSX.utils.json_to_sheet(metalRows, {
      header: METAL_HEADERS as unknown as string[],
    });
    XLSX.utils.book_append_sheet(wb, ws, "峻晟(金屬)");
  }

  if (standardRows.length > 0) {
    const ws = XLSX.utils.json_to_sheet(standardRows, {
      header: STANDARD_HEADERS as unknown as string[],
    });
    XLSX.utils.book_append_sheet(wb, ws, "標準(含金額)");
  }

  return wb;
}

/** 依區間組出檔名:出貨單對帳_YYYYMMDD-YYYYMMDD.xlsx。 */
export function buildFileName(from: string, to: string): string {
  const compact = (d: string) => d.replace(/-/g, "");
  return `出貨單對帳_${compact(from)}-${compact(to)}.xlsx`;
}

/**
 * 一站式:查區間 → 建 workbook → 觸發瀏覽器下載。
 * 回傳查到的筆數(orders 數量),供 UI 顯示。
 */
export async function exportRange(from: string, to: string): Promise<number> {
  const orders = await fetchOrdersInRange(from, to);
  const wb = buildWorkbook(orders);
  // XLSX.writeFile 在瀏覽器會自動觸發下載。
  XLSX.writeFile(wb, buildFileName(from, to));
  return orders.length;
}
