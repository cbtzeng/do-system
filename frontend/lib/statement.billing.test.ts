import { describe, it, expect, vi, beforeEach } from "vitest";

// 針對會碰 Supabase 的兩個函式(savePrices 跳過已收款、updateBillingStatus 批次更新)
// 以 mock 取代 supabase 模組,驗證送出的 payload / 篩選條件。

/** 記錄每次 update 的內容,供斷言。 */
type UpdateCall = { table: string; values: Record<string, unknown>; ids?: string[] };
const updateCalls: UpdateCall[] = [];
/** 供 savePrices 讀回現有 lines:orderId → lines。 */
let linesById: Record<string, unknown[]> = {};

function makeFrom(table: string) {
  const state: { updateValues?: Record<string, unknown>; selectId?: string } = {};
  const q: Record<string, unknown> = {};

  q.select = vi.fn(() => q);
  q.update = vi.fn((values: Record<string, unknown>) => {
    state.updateValues = values;
    return q;
  });
  // savePrices: select(...).eq("id", id).single()
  // updateBillingStatus: update(...).in("id", ids) → thenable
  q.eq = vi.fn((_col: string, val: string) => {
    if (state.updateValues) {
      updateCalls.push({ table, values: state.updateValues, ids: [val] });
      return Promise.resolve({ error: null });
    }
    state.selectId = val;
    return q;
  });
  q.in = vi.fn((_col: string, vals: string[]) => {
    updateCalls.push({ table, values: state.updateValues ?? {}, ids: vals });
    return Promise.resolve({ error: null });
  });
  q.single = vi.fn(() =>
    Promise.resolve({
      data: { lines: linesById[state.selectId ?? ""] ?? [] },
      error: null,
    }),
  );
  return q;
}

vi.mock("./supabase", () => ({
  get isSupabaseConfigured() {
    return true;
  },
  getSupabase: () => ({ from: (table: string) => makeFrom(table) }),
}));

import { savePrices, updateBillingStatus, type StatementRow } from "./statement";

function row(over: Partial<StatementRow>): StatementRow {
  return {
    sourceOrderId: "o1",
    sourceLineIndex: 0,
    billingStatus: "unbilled",
    customerName: "客戶A",
    isoDate: "2026-07-05",
    name: "",
    material: "",
    size: "",
    sheets: 0,
    weight: 0,
    price: 0,
    ...over,
  };
}

beforeEach(() => {
  updateCalls.length = 0;
  linesById = {};
});

describe("savePrices — 跳過已收款(paid)的單", () => {
  it("已收款的單不寫回單價,只更新其他單", async () => {
    linesById = {
      A: [{ name: "a0", weight: 1 }],
      B: [{ name: "b0", weight: 1 }],
    };
    const rows = [
      row({ sourceOrderId: "A", sourceLineIndex: 0, billingStatus: "billed", price: 30 }),
      row({ sourceOrderId: "B", sourceLineIndex: 0, billingStatus: "paid", price: 999 }),
    ];
    const updated = await savePrices(rows);

    // 只更新 A(B 已收款被跳過)
    expect(updated).toBe(1);
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].ids).toEqual(["A"]);
    const nextLines = updateCalls[0].values.lines as { price?: number }[];
    expect(nextLines[0].price).toBe(30);
    // B 完全沒被 update
    expect(updateCalls.some((c) => c.ids?.includes("B"))).toBe(false);
  });

  it("整批都已收款 → 不打任何 update,回傳 0", async () => {
    const rows = [
      row({ sourceOrderId: "A", billingStatus: "paid", price: 10 }),
      row({ sourceOrderId: "B", billingStatus: "paid", price: 20 }),
    ];
    expect(await savePrices(rows)).toBe(0);
    expect(updateCalls).toHaveLength(0);
  });
});

describe("updateBillingStatus", () => {
  it("以 in(id, ids) 批次更新 billing_status(去重)", async () => {
    await updateBillingStatus(["A", "B", "A"], "paid");
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].table).toBe("delivery_orders");
    expect(updateCalls[0].values).toEqual({ billing_status: "paid" });
    expect(updateCalls[0].ids).toEqual(["A", "B"]);
  });

  it("空 id 陣列 → 不打 DB", async () => {
    await updateBillingStatus([], "billed");
    expect(updateCalls).toHaveLength(0);
  });
});
