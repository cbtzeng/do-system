// 對帳單(statement)純函式工具 — Issue #27。
//
// 以 metal 版出貨單(delivery_orders）為來源,攤平成「一列一品項」的對帳明細:
//   日期 / 品號(=品名)/ 材質 / 規格(=尺寸)/ 片數 / 重量 / 單價 / 金額
// 金額 = 重量 × 單價(四捨五入);小計 = Σ金額;營業稅 = 小計 × 5%(四捨五入);
// 合計 = 小計 + 稅。單價來自出貨單 lines.price(內部用,不印在出貨單)。
//
// 這裡只放**純函式**(不碰網路),方便單元測試。查詢 / 儲存單價 / 觸發下載
// 由 statement 頁(page.tsx)以薄包裝呼叫。

import * as XLSX from "xlsx";
import { getSupabase, isSupabaseConfigured } from "./supabase";
import type { DeliveryOrderRow, MetalLine } from "./db-types";

/** 入帳狀態(屬於整筆出貨單):未入帳 / 已請款 / 已收款。 */
export type BillingStatus = "unbilled" | "billed" | "paid";

/** 預設狀態(舊資料或缺欄位時一律當未入帳)。 */
export const DEFAULT_BILLING_STATUS: BillingStatus = "unbilled";

/** 三個合法狀態(依畫面顯示順序)。 */
export const BILLING_STATUSES: readonly BillingStatus[] = [
  "unbilled",
  "billed",
  "paid",
] as const;

/** 狀態的中文標籤。 */
export const BILLING_STATUS_LABELS: Record<BillingStatus, string> = {
  unbilled: "未入帳",
  billed: "已請款",
  paid: "已收款",
};

/** 狀態的 chip 顏色鍵(對應 CSS class:未入帳灰、已請款琥珀、已收款綠)。 */
export const BILLING_STATUS_TONES: Record<BillingStatus, "grey" | "amber" | "green"> = {
  unbilled: "grey",
  billed: "amber",
  paid: "green",
};

/** 把任意值正規化成合法 BillingStatus;非法/缺值 → 預設(未入帳)。 */
export function normalizeBillingStatus(value: unknown): BillingStatus {
  return value === "billed" || value === "paid" || value === "unbilled"
    ? value
    : DEFAULT_BILLING_STATUS;
}

/** 由選取的對帳列收集其所屬出貨單的 distinct id(保留出現順序)。 */
export function distinctOrderIds(rows: StatementRow[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of rows) {
    if (!r.sourceOrderId || seen.has(r.sourceOrderId)) continue;
    seen.add(r.sourceOrderId);
    out.push(r.sourceOrderId);
  }
  return out;
}

/** 對帳單一列(攤平後)。source* 欄位用於「儲存單價」寫回來源出貨單。 */
export interface StatementRow {
  /** 來源出貨單 id(寫回單價 / 標記狀態用;同一單的列共用)。 */
  sourceOrderId: string;
  /** 該列在來源出貨單 lines 陣列中的索引(寫回單價用)。 */
  sourceLineIndex: number;
  /** 所屬出貨單的入帳狀態(同一單的列相同)。 */
  billingStatus: BillingStatus;
  /** 客戶名稱(全部客戶時用來分工作表)。 */
  customerName: string;
  /** ISO 日期(YYYY-MM-DD);可能為 null。 */
  isoDate: string | null;
  name: string; // 品號(=品名)
  material: string; // 材質
  size: string; // 規格(=尺寸)
  sheets: number; // 片數
  weight: number; // 重量
  price: number; // 單價(可於對帳單畫面編修)
}

/** 小計 / 稅 / 合計。 */
export interface StatementTotals {
  subtotal: number;
  tax: number;
  total: number;
}

/** 營業稅率(5%)。 */
export const TAX_RATE = 0.05;

/** 四捨五入到整數(0.5 進位)。 */
function round(n: number): number {
  return Math.round(n);
}

/** 金額 = 重量 × 單價(四捨五入)。非有限值以 0 計。 */
export function computeAmount(weight: number, price: number): number {
  const w = Number.isFinite(weight) ? weight : 0;
  const p = Number.isFinite(price) ? price : 0;
  return round(w * p);
}

/**
 * 由對帳列算小計 / 營業稅 / 合計。
 *   小計 = Σ(金額),金額 = round(重量 × 單價)
 *   營業稅 = round(小計 × 5%)
 *   合計 = 小計 + 稅
 */
export function computeTotals(rows: StatementRow[]): StatementTotals {
  const subtotal = rows.reduce(
    (sum, r) => sum + computeAmount(r.weight, r.price),
    0,
  );
  const tax = round(subtotal * TAX_RATE);
  return { subtotal, tax, total: subtotal + tax };
}

/** 把 ISO 日期(YYYY-MM-DD)顯示成「M月D日」;null / 解析不出 → 空字串。 */
export function formatMonthDay(iso: string | null | undefined): string {
  if (!iso) return "";
  const m = iso.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!m) return "";
  return `${Number(m[2])}月${Number(m[3])}日`;
}

/**
 * 把多張出貨單攤平成對帳列(僅 metal 版有品號/材質/規格/片數/重量/單價)。
 * 保留 sourceOrderId / sourceLineIndex 以便「儲存單價」寫回。
 * 沒有 lines 的單不產生列。
 */
export function flattenToStatementRows(
  orders: DeliveryOrderRow[],
): StatementRow[] {
  const out: StatementRow[] = [];
  for (const order of orders) {
    if (order.template !== "metal") continue; // 對帳單只處理 metal 版
    const lines = Array.isArray(order.lines) ? order.lines : [];
    lines.forEach((raw, index) => {
      const line = raw as Partial<MetalLine> & { price?: number };
      out.push({
        sourceOrderId: order.id,
        sourceLineIndex: index,
        billingStatus: normalizeBillingStatus(order.billing_status),
        customerName: order.customer_name ?? "",
        isoDate: order.order_date ?? null,
        name: line.name ?? "",
        material: line.material ?? "",
        size: line.size ?? "",
        sheets: typeof line.sheets === "number" ? line.sheets : 0,
        weight: typeof line.weight === "number" ? line.weight : 0,
        price: typeof line.price === "number" ? line.price : 0,
      });
    });
  }
  return out;
}

/** 對帳單 8 欄表頭(峻晟版面)。 */
export const STATEMENT_HEADERS = [
  "日期",
  "品號",
  "材質",
  "規格",
  "片數",
  "重量",
  "單價",
  "金額",
] as const;

/** 建對帳單工作表所需資訊。 */
export interface StatementSheetInput {
  customer: string; // 客戶名稱(或「全部客戶」聚合時的單一客戶)
  period: string; // 月份 / 期間文字(例:115年7月)
  rows: StatementRow[];
}

/** 一張工作表最少要湊到的資料列(不足以空白列補齊,維持版面)。 */
const MIN_DATA_ROWS = 12;

/**
 * 產生單張對帳單工作表(峻晟版面):
 *   標題:峻晟金屬股份有限公司 / 對帳單
 *   一列:客戶名稱 + 月份
 *   8 欄表頭 → 明細列 → 空白填充列 → 小計 / 營業稅 / 合計
 */
export function buildStatementSheet(input: StatementSheetInput): XLSX.WorkSheet {
  const { customer, period, rows } = input;
  const totals = computeTotals(rows);

  const aoa: (string | number)[][] = [];
  aoa.push(["峻晟金屬股份有限公司"]);
  aoa.push(["對帳單"]);
  aoa.push([`客戶名稱：${customer}`, "", "", "", "", "", "月份：", period]);
  aoa.push([...STATEMENT_HEADERS]);

  for (const r of rows) {
    aoa.push([
      formatMonthDay(r.isoDate),
      r.name,
      r.material,
      r.size,
      r.sheets || "",
      r.weight || "",
      r.price || "",
      computeAmount(r.weight, r.price) || "",
    ]);
  }

  // 空白填充列(讓表格有足夠高度,對齊紙本)。
  const pad = Math.max(0, MIN_DATA_ROWS - rows.length);
  for (let i = 0; i < pad; i++) {
    aoa.push(["", "", "", "", "", "", "", ""]);
  }

  aoa.push(["", "", "", "", "", "", "小計", totals.subtotal]);
  aoa.push(["", "", "", "", "", "", "營業稅", totals.tax]);
  aoa.push(["", "", "", "", "", "", "合計", totals.total]);

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  // 欄寬(概略對齊峻晟版面)。
  ws["!cols"] = [
    { wch: 10 }, // 日期
    { wch: 18 }, // 品號
    { wch: 12 }, // 材質
    { wch: 18 }, // 規格
    { wch: 8 }, // 片數
    { wch: 10 }, // 重量
    { wch: 10 }, // 單價
    { wch: 12 }, // 金額
  ];
  // 標題橫向合併 8 欄。
  ws["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 7 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 7 } },
  ];
  return ws;
}

/** Excel 工作表名稱不可含 : \ / ? * [ ] 且 <=31 字。 */
function safeSheetName(name: string, fallback: string): string {
  const cleaned = (name || fallback).replace(/[:\\/?*[\]]/g, " ").trim();
  return (cleaned || fallback).slice(0, 31);
}

/**
 * 由(單一客戶或「全部客戶」)對帳列建一本 workbook。
 *   - customer 給定具體客戶名 → 單張工作表。
 *   - customer 為 null(全部客戶)→ 依 customerName 分組,每客戶一張工作表。
 */
export function buildStatementWorkbook(
  customer: string | null,
  period: string,
  rows: StatementRow[],
): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();

  if (customer !== null) {
    const ws = buildStatementSheet({ customer, period, rows });
    XLSX.utils.book_append_sheet(wb, ws, safeSheetName(customer, "對帳單"));
    return wb;
  }

  // 全部客戶:依 customerName 分組(保留出現順序),每組一張工作表。
  const groups = new Map<string, StatementRow[]>();
  for (const r of rows) {
    const key = r.customerName || "(未填客戶)";
    const arr = groups.get(key);
    if (arr) arr.push(r);
    else groups.set(key, [r]);
  }

  if (groups.size === 0) {
    // 完全沒資料:仍建一張空表,避免空 workbook。
    const ws = buildStatementSheet({ customer: "全部客戶", period, rows: [] });
    XLSX.utils.book_append_sheet(wb, ws, "對帳單");
    return wb;
  }

  const used = new Set<string>();
  for (const [name, groupRows] of groups) {
    const ws = buildStatementSheet({ customer: name, period, rows: groupRows });
    // 確保工作表名唯一。
    let sheetName = safeSheetName(name, "對帳單");
    let n = 2;
    while (used.has(sheetName)) {
      sheetName = safeSheetName(name, "對帳單").slice(0, 28) + `_${n++}`;
    }
    used.add(sheetName);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  }
  return wb;
}

/** 西元 → 民國期間文字。例:2026-07 → 「115年7月」。 */
export function rocPeriodLabel(year: number, month: number): string {
  return `${year - 1911}年${month}月`;
}

/** 對帳單檔名:對帳單_<客戶>_<115年7月>.xlsx(客戶為「全部客戶」時亦可)。 */
export function buildStatementFileName(
  customerLabel: string,
  periodLabel: string,
): string {
  const safe = (s: string) => s.replace(/[\\/:*?"<>|]/g, "").trim();
  return `對帳單_${safe(customerLabel) || "全部客戶"}_${safe(periodLabel)}.xlsx`;
}

/* ================================================================
 * 網路薄包裝(查詢 / 儲存單價)。未設定 Supabase env 時查詢會丟清楚的錯,
 * 呼叫端(page)以 isSupabaseConfigured 先擋。
 * ================================================================ */

/** 對帳單查詢條件:客戶(空 = 全部)+ 日期區間(ISO,含頭含尾)。 */
export interface StatementFilters {
  /** 客戶名稱;空字串 = 全部客戶。 */
  customer?: string;
  from?: string; // YYYY-MM-DD
  to?: string; // YYYY-MM-DD
}

/**
 * 查 metal 版出貨單(供對帳單)。依日期區間 + 客戶精確比對。
 * 依 order_date 由舊到新排序(對帳習慣)。
 */
export async function fetchStatementOrders(
  filters: StatementFilters,
): Promise<DeliveryOrderRow[]> {
  let query = getSupabase()
    .from("delivery_orders")
    .select("*")
    .eq("template", "metal")
    .order("order_date", { ascending: true, nullsFirst: false })
    .order("order_no", { ascending: true });

  const customer = filters.customer?.trim();
  if (customer) query = query.eq("customer_name", customer);
  if (filters.from) query = query.gte("order_date", filters.from);
  if (filters.to) query = query.lte("order_date", filters.to);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as DeliveryOrderRow[];
}

/** 取得客戶名稱清單(供對帳單客戶下拉),常用在前。未設定 env → []。 */
export async function fetchCustomerNames(): Promise<string[]> {
  if (!isSupabaseConfigured) return [];
  try {
    const { data, error } = await getSupabase()
      .from("customers")
      .select("customer_name")
      .order("use_count", { ascending: false })
      .order("customer_name", { ascending: true });
    if (error) return [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const row of (data ?? []) as { customer_name: string | null }[]) {
      const name = (row.customer_name ?? "").trim();
      if (!name || seen.has(name)) continue;
      seen.add(name);
      out.push(name);
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * 批次更新出貨單的入帳狀態(未入帳/已請款/已收款)。
 * `update delivery_orders set billing_status=... where id in (...)`。
 * orderIds 為空則不打 DB。
 */
export async function updateBillingStatus(
  orderIds: string[],
  status: BillingStatus,
): Promise<void> {
  const ids = Array.from(new Set(orderIds.filter(Boolean)));
  if (ids.length === 0) return;
  const { error } = await getSupabase()
    .from("delivery_orders")
    .update({ billing_status: status })
    .in("id", ids);
  if (error) throw error;
}

/**
 * 把對帳列上編修過的單價寫回來源出貨單的 lines jsonb。
 * 依 sourceOrderId 分組,對每張單讀回現有 lines、更新對應索引的 price,再整包 update。
 * **已收款(paid)的單會被跳過**,不覆寫其單價。
 * 回傳實際更新的出貨單張數。
 */
export async function savePrices(rows: StatementRow[]): Promise<number> {
  const supabase = getSupabase();

  // 依出貨單分組:orderId → (lineIndex → price)。已收款的單直接跳過。
  const byOrder = new Map<string, Map<number, number>>();
  for (const r of rows) {
    if (r.billingStatus === "paid") continue; // 已收款鎖單價:不寫回
    let m = byOrder.get(r.sourceOrderId);
    if (!m) {
      m = new Map();
      byOrder.set(r.sourceOrderId, m);
    }
    m.set(r.sourceLineIndex, r.price);
  }

  let updated = 0;
  for (const [orderId, priceByIndex] of byOrder) {
    const { data, error } = await supabase
      .from("delivery_orders")
      .select("lines")
      .eq("id", orderId)
      .single();
    if (error) throw error;

    const lines = Array.isArray((data as { lines: unknown[] }).lines)
      ? ((data as { lines: MetalLine[] }).lines as MetalLine[])
      : [];
    const nextLines = lines.map((line, i) =>
      priceByIndex.has(i) ? { ...line, price: priceByIndex.get(i) } : line,
    );

    const { error: updErr } = await supabase
      .from("delivery_orders")
      .update({ lines: nextLines })
      .eq("id", orderId);
    if (updErr) throw updErr;
    updated++;
  }
  return updated;
}
