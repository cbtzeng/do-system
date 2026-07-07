// 全欄位歷史 autocomplete 的建議查詢 (Issue #G)。
//
// 全部在前端(browser)直連 Supabase 讀取:
//   - suggestCustomers → customers 主檔(帶回住址/電話/統編,供選取後自動帶入)。
//   - suggestItems      → items 主檔的品名/材質/尺寸各欄「獨立」distinct 值。
//   - suggestField      → delivery_orders 自由文字欄(承運車行、車號…)的歷史 distinct 值。
//
// 設計成 debounce-friendly:呼叫端自行 debounce,這裡只負責一次查詢。
// 未設定 Supabase env 時「不丟例外」,一律回傳 [](autocomplete 靜默停用),
// 讓 build / 無雲端環境仍可正常運作。

import { isSupabaseConfigured, getSupabase } from "./supabase";
import type { CustomerRow } from "./db-types";

/** 一次建議查詢預設回傳筆數上限。 */
const DEFAULT_LIMIT = 8;

/** items 可獨立建議的欄位。 */
export type ItemField = "name" | "material" | "size";

/** delivery_orders 允許做歷史建議的自由文字欄位(白名單,避免任意欄位注入)。 */
export type FreeTextColumn =
  | "carrier" // 承運車行
  | "vehicle_no" // 車號
  | "customer_name"
  | "address"
  | "phone"
  | "remark";

/** 客戶建議項:含帶入用的關聯欄位。 */
export interface CustomerSuggestion {
  customerName: string;
  address: string;
  phone: string;
  taxId: string;
}

/** ilike 用的安全 like pattern:去掉 % 與 _ 避免使用者輸入變成萬用字元。 */
function likePattern(term: string): string {
  return `%${term.replace(/[%_]/g, "")}%`;
}

/**
 * 客戶名稱建議。以 customer_name 模糊比對,常用(use_count)在前。
 * 回傳含 address/phone/tax_id,呼叫端選取後可自動帶入相關欄位。
 * 未設定 Supabase 或查詢出錯 → 回傳 []。
 */
export async function suggestCustomers(
  q: string,
  limit = DEFAULT_LIMIT,
): Promise<CustomerSuggestion[]> {
  const term = q.trim();
  if (!term || !isSupabaseConfigured) return [];

  try {
    const { data, error } = await getSupabase()
      .from("customers")
      .select("customer_name, address, phone, tax_id")
      .ilike("customer_name", likePattern(term))
      .order("use_count", { ascending: false })
      .order("last_used_at", { ascending: false, nullsFirst: false })
      .order("customer_name", { ascending: true })
      .limit(limit);

    if (error) return [];
    return (data ?? []).map(mapCustomer);
  } catch {
    return [];
  }
}

/** DB row → CustomerSuggestion(null 轉空字串,方便直接塞進 input)。 */
export function mapCustomer(
  row: Pick<CustomerRow, "customer_name" | "address" | "phone" | "tax_id">,
): CustomerSuggestion {
  return {
    customerName: row.customer_name ?? "",
    address: row.address ?? "",
    phone: row.phone ?? "",
    taxId: row.tax_id ?? "",
  };
}

/**
 * items 某一欄(品名/材質/尺寸)的 distinct 建議。
 * 各欄「獨立」:一個品名可對到多種材質/尺寸,故不綁死彼此。
 * 回傳去重、排序後的字串陣列。未設定 Supabase 或出錯 → 回傳 []。
 */
export async function suggestItems(
  field: ItemField,
  q: string,
  limit = DEFAULT_LIMIT,
): Promise<string[]> {
  const term = q.trim();
  if (!term || !isSupabaseConfigured) return [];

  try {
    const { data, error } = await getSupabase()
      .from("items")
      .select(field)
      .ilike(field, likePattern(term))
      .order("use_count", { ascending: false })
      // 多抓一些以便去重後仍有足夠筆數
      .limit(limit * 6);

    if (error) return [];
    return dedupeColumn(data as Array<Record<string, unknown>>, field, limit);
  } catch {
    return [];
  }
}

/** standard 版品名建議項:含可帶入的單位/單價。 */
export interface ItemNameSuggestion {
  name: string;
  unit: string;
  price: number | null;
}

/**
 * standard 版品名建議:回傳品名 + 單位 + 單價,供選取後自動帶入單位/單價。
 * 以品名去重(取每個品名第一筆 = 最常用/最新)。
 * 未設定 Supabase 或出錯 → 回傳 []。
 */
export async function suggestItemsWithDetails(
  q: string,
  limit = DEFAULT_LIMIT,
): Promise<ItemNameSuggestion[]> {
  const term = q.trim();
  if (!term || !isSupabaseConfigured) return [];

  try {
    const { data, error } = await getSupabase()
      .from("items")
      .select("name, unit, price")
      .ilike("name", likePattern(term))
      .order("use_count", { ascending: false })
      .order("last_used_at", { ascending: false, nullsFirst: false })
      .limit(limit * 6);

    if (error) return [];
    const seen = new Set<string>();
    const out: ItemNameSuggestion[] = [];
    for (const row of (data ?? []) as Array<{
      name: string | null;
      unit: string | null;
      price: number | null;
    }>) {
      const name = (row.name ?? "").trim();
      if (!name) continue;
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ name, unit: row.unit ?? "", price: row.price ?? null });
      if (out.length >= limit) break;
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * delivery_orders 自由文字欄位的歷史 distinct 建議(承運車行、車號…)。
 * column 限白名單,避免任意欄位。未設定 Supabase 或出錯 → 回傳 []。
 */
export async function suggestField(
  column: FreeTextColumn,
  q: string,
  limit = DEFAULT_LIMIT,
): Promise<string[]> {
  const term = q.trim();
  if (!term || !isSupabaseConfigured) return [];

  try {
    const { data, error } = await getSupabase()
      .from("delivery_orders")
      .select(column)
      .ilike(column, likePattern(term))
      .order("updated_at", { ascending: false })
      .limit(limit * 12);

    if (error) return [];
    return dedupeColumn(data as Array<Record<string, unknown>>, column, limit);
  } catch {
    return [];
  }
}

/**
 * 把 select 單欄回傳的 rows 去重成字串陣列(保留原順序 = 相關性/新近度),
 * 忽略空值,最多取 limit 筆。
 */
function dedupeColumn(
  rows: Array<Record<string, unknown>>,
  key: string,
  limit: number,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of rows ?? []) {
    const raw = row?.[key];
    if (raw === null || raw === undefined) continue;
    const value = String(raw).trim();
    if (!value) continue;
    const lower = value.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    out.push(value);
    if (out.length >= limit) break;
  }
  return out;
}
