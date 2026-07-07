// orders.ts — 送貨單存檔 / 列印紀錄 / 主檔累積(Issue #D)。
//
// 職責:
//   - mapFormToRow: 純函式,把 DoForm 轉成 delivery_orders 的 insert/update row。
//   - saveOrder:    upsert 到 delivery_orders(無 id → insert;有 id → update),回傳 row id。
//   - recordPrint:  寫入 print_logs,並累加 delivery_orders.print_count / 更新時間戳。
//   - upsertMasters: 累積 customers / items 主檔(供日後 autocomplete #G)。
//
// 設計原則:mapFormToRow 不碰網路,方便單元測試;其餘函式才實際打 Supabase。

import type { DoForm } from "./contract";
import type {
  DeliveryOrderLine,
  MetalLine,
  StandardLine,
} from "./db-types";
import { getSupabase } from "./supabase";

/**
 * delivery_orders 的 insert / update 欄位(id 選填:update 時帶入)。
 * 不含 DB 自動維護的欄位(created_at / updated_at / status / print_count / 時間戳)。
 */
export interface DeliveryOrderInsert {
  id?: string;
  template: string;
  order_no: string | null;
  customer_name: string | null;
  address: string | null;
  phone: string | null;
  order_date: string | null;
  remark: string | null;
  carrier: string | null;
  vehicle_no: string | null;
  lines: DeliveryOrderLine[];
  offset_x: number;
  offset_y: number;
  // 以下僅 standard 版填值,metal 版為 null。
  subtotal: number | null;
  tax_amount: number | null;
  total: number | null;
  tax_id: string | null;
  invoice_no: string | null;
}

/** 去頭尾空白;空字串轉 null(避免主檔塞入空值)。 */
function orNull(value: string | undefined | null): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * 把畫面上的民國年自由文字(例「115 年 6 月 22 日」)轉成 ISO 日期(YYYY-MM-DD)。
 * 解析不出來就回 null(order_date 欄位允許 null)。
 */
export function rocDateToIso(text: string | undefined | null): string | null {
  if (!text) return null;
  // 抓出前三段數字:民國年 / 月 / 日。
  const nums = text.match(/\d+/g);
  if (!nums || nums.length < 3) return null;
  const rocYear = Number(nums[0]);
  const month = Number(nums[1]);
  const day = Number(nums[2]);
  if (!rocYear || !month || !day) return null;
  const year = rocYear + 1911;
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

/** standard 版:單列金額 = 數量 × 單價。 */
function standardLineAmount(line: StandardLine): number {
  return (line.qty || 0) * (line.price || 0);
}

/**
 * DoForm → delivery_orders 的 row(純函式,不碰網路)。
 * @param id 若提供,代表更新既有單(update by id)。
 */
export function mapFormToRow(form: DoForm, id?: string): DeliveryOrderInsert {
  const h = form.header;
  const base: DeliveryOrderInsert = {
    ...(id ? { id } : {}),
    template: form.template,
    order_no: orNull(h.orderNo),
    customer_name: orNull(h.customerName),
    address: orNull(h.address),
    phone: orNull(h.phone),
    order_date: rocDateToIso(h.date),
    remark: orNull(h.remark),
    carrier: orNull(h.carrier),
    vehicle_no: orNull(h.vehicleNo),
    lines: form.lines as DeliveryOrderLine[],
    offset_x: form.offsetX,
    offset_y: form.offsetY,
    subtotal: null,
    tax_amount: null,
    total: null,
    tax_id: null,
    invoice_no: null,
  };

  if (form.template === "standard") {
    const subtotal = form.lines.reduce(
      (sum, line) => sum + standardLineAmount(line),
      0,
    );
    const taxAmount = form.taxAmount || 0;
    base.subtotal = subtotal;
    base.tax_amount = taxAmount;
    base.total = subtotal + taxAmount;
    base.tax_id = orNull(h.taxId);
    base.invoice_no = orNull(h.invoiceNo);
  }

  return base;
}

/**
 * upsert 送貨單到 delivery_orders。
 *   - 無 id:insert 新單,回傳新產生的 id。
 *   - 有 id:update 既有單(updated_at 由 DB trigger 處理),回傳同一 id。
 */
export async function saveOrder(form: DoForm, id?: string): Promise<string> {
  const supabase = getSupabase();
  const row = mapFormToRow(form, id);

  if (id) {
    const { data, error } = await supabase
      .from("delivery_orders")
      .update(row)
      .eq("id", id)
      .select("id")
      .single();
    if (error) throw error;
    return (data as { id: string }).id;
  }

  const { data, error } = await supabase
    .from("delivery_orders")
    .insert(row)
    .select("id")
    .single();
  if (error) throw error;
  return (data as { id: string }).id;
}

/**
 * 記錄一次列印:寫 print_logs,並累加該單的 print_count / 更新時間戳。
 * @param ok    列印是否成功。
 * @param jobId agent 回傳的 job id(選填)。
 */
export async function recordPrint(
  orderId: string,
  ok: boolean,
  jobId?: string,
): Promise<void> {
  const supabase = getSupabase();

  const { error: logError } = await supabase.from("print_logs").insert({
    order_id: orderId,
    ok,
    job_id: jobId ?? null,
  });
  if (logError) throw logError;

  // 讀回現值以便累加 print_count 並補上 first_printed_at。
  const { data: current, error: readError } = await supabase
    .from("delivery_orders")
    .select("print_count, first_printed_at")
    .eq("id", orderId)
    .single();
  if (readError) throw readError;

  const now = new Date().toISOString();
  const prev = current as {
    print_count: number | null;
    first_printed_at: string | null;
  };

  const { error: updateError } = await supabase
    .from("delivery_orders")
    .update({
      print_count: (prev.print_count ?? 0) + 1,
      last_printed_at: now,
      first_printed_at: prev.first_printed_at ?? now,
    })
    .eq("id", orderId);
  if (updateError) throw updateError;
}

/**
 * 累積主檔(供日後 autocomplete #G):
 *   - customers:以 customer_name 為鍵 upsert 住址/電話/統編,use_count++、last_used_at。
 *   - items:每列品項以 name(+ material/size)為鍵 upsert,use_count++、last_used_at。
 * 失敗不影響列印;呼叫端可自行 catch。
 */
export async function upsertMasters(form: DoForm): Promise<void> {
  const supabase = getSupabase();
  const now = new Date().toISOString();

  // ---- customers ----
  const customerName = orNull(form.header.customerName);
  if (customerName) {
    const { data: existing } = await supabase
      .from("customers")
      .select("id, use_count")
      .eq("customer_name", customerName)
      .maybeSingle();

    const taxId =
      form.template === "standard" ? orNull(form.header.taxId) : null;
    const patch = {
      customer_name: customerName,
      address: orNull(form.header.address),
      phone: orNull(form.header.phone),
      tax_id: taxId,
      last_used_at: now,
    };

    if (existing) {
      const cur = existing as { id: string; use_count: number | null };
      await supabase
        .from("customers")
        .update({ ...patch, use_count: (cur.use_count ?? 0) + 1 })
        .eq("id", cur.id);
    } else {
      await supabase.from("customers").insert({ ...patch, use_count: 1 });
    }
  }

  // ---- items(逐列)----
  for (const line of form.lines) {
    const name = orNull(line.name);
    if (!name) continue;

    const isMetal = form.template === "metal";
    const material = isMetal ? orNull((line as MetalLine).material) : null;
    const size = isMetal ? orNull((line as MetalLine).size) : null;
    const unit = !isMetal ? orNull((line as StandardLine).unit) : null;
    const price = !isMetal ? (line as StandardLine).price || null : null;

    // 以 name(+material+size)辨識同一品項;缺欄以 is 判 null。
    let query = supabase
      .from("items")
      .select("id, use_count")
      .eq("name", name);
    query = material == null ? query.is("material", null) : query.eq("material", material);
    query = size == null ? query.is("size", null) : query.eq("size", size);
    const { data: existing } = await query.maybeSingle();

    const patch = {
      name,
      material,
      size,
      unit,
      price,
      last_used_at: now,
    };

    if (existing) {
      const cur = existing as { id: string; use_count: number | null };
      await supabase
        .from("items")
        .update({ ...patch, use_count: (cur.use_count ?? 0) + 1 })
        .eq("id", cur.id);
    } else {
      await supabase.from("items").insert({ ...patch, use_count: 1 });
    }
  }
}
