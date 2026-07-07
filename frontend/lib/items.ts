// items 主檔的 Supabase 存取 helper。
//
// 全部在前端(browser)直連 Supabase(RLS 開放 anon 讀寫,整站由共用密碼閘門保護)。
// 未設定 env 時,getSupabase() 會在呼叫查詢時丟出清楚的錯;UI 應以 isSupabaseConfigured 先擋。

import { getSupabase } from "./supabase";
import type { ItemRow } from "./db-types";

// ---- Excel 匯入:欄位對應 ----

/** 匯入時可辨識的欄位標題(容忍多種寫法)。key = 目標欄位。 */
const HEADER_ALIASES: Record<keyof ItemInput, string[]> = {
  name: ["品名", "名稱", "品項", "產品", "產品名稱", "name", "item", "product"],
  material: ["材質", "材料", "材", "material"],
  size: ["尺寸", "規格", "大小", "size", "spec", "dimension"],
  unit: ["單位", "unit"],
  price: ["單價", "價格", "價錢", "金額", "price", "unitprice", "amount"],
};

/** 標題正規化:去空白、全形轉半形、小寫,方便比對。 */
function canonHeader(h: unknown): string {
  return String(h ?? "")
    .replace(/[\s　()（）:：*﹡]/g, "")
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (c) =>
      String.fromCharCode(c.charCodeAt(0) - 0xfee0),
    )
    .toLowerCase();
}

/**
 * 依表頭列決定每個欄位對應的欄索引。回傳 { name?: idx, ... }。
 * headerRow 為第一列(標題)的儲存格陣列。
 */
export function mapHeaderColumns(
  headerRow: unknown[],
): Partial<Record<keyof ItemInput, number>> {
  const canon = headerRow.map(canonHeader);
  const result: Partial<Record<keyof ItemInput, number>> = {};
  (Object.keys(HEADER_ALIASES) as (keyof ItemInput)[]).forEach((field) => {
    const aliases = HEADER_ALIASES[field].map(canonHeader);
    const idx = canon.findIndex((c) => c !== "" && aliases.includes(c));
    if (idx >= 0) result[field] = idx;
  });
  return result;
}

/**
 * 把 SheetJS 產出的 rows(array-of-arrays)轉成 ItemInput[]。
 * - 第一列視為表頭;以 mapHeaderColumns 決定欄位。
 * - 若表頭無法對應到「品名」,則退回「第一欄=品名、第二欄=材質…」的固定順序。
 * - 過濾掉完全空白的列。
 */
export function parseSheetRows(rows: unknown[][]): ItemInput[] {
  if (!rows || rows.length === 0) return [];
  const [header, ...body] = rows;
  let cols = mapHeaderColumns(header ?? []);
  let dataRows = body;

  if (cols.name === undefined) {
    // 找不到品名表頭 → 假設沒有表頭列,採固定欄序,且把 header 列也當資料。
    cols = { name: 0, material: 1, size: 2, unit: 3, price: 4 };
    dataRows = rows;
  }

  const out: ItemInput[] = [];
  for (const row of dataRows) {
    if (!row || row.every((c) => c === null || c === undefined || String(c).trim() === "")) {
      continue;
    }
    const pick = (field: keyof ItemInput) => {
      const idx = cols[field];
      return idx === undefined ? null : (row[idx] ?? null);
    };
    const item = normalizeItemInput({
      name: pick("name") as string | null,
      material: pick("material") as string | null,
      size: pick("size") as string | null,
      unit: pick("unit") as string | null,
      price: pick("price") as string | number | null,
    });
    if (item.name !== null) out.push(item);
  }
  return out;
}

/** 正規化後、可直接寫入 DB 的欄位(不含 id / 時間戳 / use_count)。 */
export interface ItemInput {
  name: string | null;
  material: string | null;
  size: string | null;
  unit: string | null;
  price: number | null;
}

/** 使用者/匯入的原始輸入:price 可為字串(含逗號、貨幣符號等)。 */
export interface RawItemInput {
  name?: string | null;
  material?: string | null;
  size?: string | null;
  unit?: string | null;
  price?: string | number | null;
}

/** 清掉字串欄位頭尾空白;空字串視為 null。 */
function normStr(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

/** 把任意值轉成數字;無法解析回 null。 */
function normPrice(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  // 容忍 "1,200"、"$1,200"、全形空白等
  const cleaned = String(v).replace(/[^0-9.\-]/g, "");
  if (cleaned === "" || cleaned === "-" || cleaned === ".") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** 正規化一筆輸入,確保 material/size/unit/price 有一致的 null 語意。 */
export function normalizeItemInput(input: RawItemInput): ItemInput {
  return {
    name: normStr(input.name),
    material: normStr(input.material),
    size: normStr(input.size),
    unit: normStr(input.unit),
    price: normPrice(input.price),
  };
}

/**
 * 查詢 items。可選 search(對 name/material/size 做模糊比對)。
 * 排序:常用(use_count)在前,其次最近使用、名稱。
 */
export async function listItems(search?: string): Promise<ItemRow[]> {
  let query = getSupabase()
    .from("items")
    .select("*")
    .order("use_count", { ascending: false })
    .order("last_used_at", { ascending: false, nullsFirst: false })
    .order("name", { ascending: true });

  const term = search?.trim();
  if (term) {
    // 對 name / material / size 各自做 ilike;用 or() 串接。
    const like = `%${term.replace(/[%_]/g, "")}%`;
    query = query.or(
      `name.ilike.${like},material.ilike.${like},size.ilike.${like}`,
    );
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as ItemRow[];
}

/** 新增一筆 item,回傳建立後的 row。 */
export async function insertItem(input: RawItemInput): Promise<ItemRow> {
  const payload = normalizeItemInput(input);
  const { data, error } = await getSupabase()
    .from("items")
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data as ItemRow;
}

/** 更新一筆 item(以 id),回傳更新後的 row。 */
export async function updateItem(
  id: string,
  input: RawItemInput,
): Promise<ItemRow> {
  const payload = normalizeItemInput(input);
  const { data, error } = await getSupabase()
    .from("items")
    .update(payload)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as ItemRow;
}

/** 刪除一筆 item(以 id)。 */
export async function deleteItem(id: string): Promise<void> {
  const { error } = await getSupabase().from("items").delete().eq("id", id);
  if (error) throw error;
}

/**
 * 大量 upsert(供 Excel 匯入)。
 * items 表沒有天然唯一鍵,所以此處以「先查現有、name+material+size+unit 相同者更新,否則新增」的策略,
 * 在前端組出 insert / update 兩批送出,避免匯入時重複塞入同一品項。
 * 回傳 { inserted, updated } 計數。
 */
export async function bulkUpsertItems(
  inputs: RawItemInput[],
): Promise<{ inserted: number; updated: number }> {
  const rows = inputs
    .map(normalizeItemInput)
    // 至少要有品名才算一筆有效資料
    .filter((r) => r.name !== null);

  if (rows.length === 0) return { inserted: 0, updated: 0 };

  const supabase = getSupabase();

  // 取現有 items 以便比對(單一公司主檔量不大,一次抓回即可)。
  const { data: existingData, error: existingErr } = await supabase
    .from("items")
    .select("id,name,material,size,unit");
  if (existingErr) throw existingErr;

  const keyOf = (r: {
    name: string | null;
    material: string | null;
    size: string | null;
    unit: string | null;
  }) => [r.name, r.material, r.size, r.unit].map((v) => v ?? "").join("");

  const existingByKey = new Map<string, string>();
  for (const e of (existingData ?? []) as ItemRow[]) {
    existingByKey.set(keyOf(e), e.id);
  }

  const toInsert: ItemInput[] = [];
  const toUpdate: { id: string; payload: ItemInput }[] = [];
  // 匯入檔內自身也可能重複:同一 key 只處理一次。
  const seen = new Set<string>();

  for (const r of rows) {
    const key = keyOf(r);
    if (seen.has(key)) continue;
    seen.add(key);
    const existingId = existingByKey.get(key);
    if (existingId) {
      toUpdate.push({ id: existingId, payload: r });
    } else {
      toInsert.push(r);
    }
  }

  let inserted = 0;
  let updated = 0;

  if (toInsert.length > 0) {
    const { error } = await supabase.from("items").insert(toInsert);
    if (error) throw error;
    inserted = toInsert.length;
  }

  // 更新主要是為了帶入新的單價;逐筆更新(量不大)。
  for (const u of toUpdate) {
    const { error } = await supabase
      .from("items")
      .update({ price: u.payload.price, unit: u.payload.unit })
      .eq("id", u.id);
    if (error) throw error;
    updated += 1;
  }

  return { inserted, updated };
}
