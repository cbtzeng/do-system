import { describe, it, expect, vi, beforeEach } from "vitest";

// 以 mock 取代 supabase 模組:可控制 isSupabaseConfigured 與查詢回傳。
let configured = true;
const rowsRef: { data: unknown[]; error: unknown } = { data: [], error: null };

// 建一個可鏈式呼叫(order/ilike/limit…)且最終 await 得到 { data, error } 的假 query。
function makeQuery() {
  const q: Record<string, unknown> = {};
  const chain = () => q;
  for (const m of ["select", "ilike", "order", "limit", "eq"]) {
    q[m] = vi.fn(chain);
  }
  // thenable → await 時 resolve 成 rowsRef
  (q as { then: unknown }).then = (resolve: (v: unknown) => unknown) =>
    resolve({ data: rowsRef.data, error: rowsRef.error });
  return q;
}

vi.mock("./supabase", () => ({
  get isSupabaseConfigured() {
    return configured;
  },
  getSupabase: () => ({ from: vi.fn(makeQuery) }),
}));

import {
  suggestItems,
  suggestField,
  suggestCustomers,
  suggestItemsWithDetails,
  mapCustomer,
} from "./suggestions";

beforeEach(() => {
  configured = true;
  rowsRef.data = [];
  rowsRef.error = null;
});

describe("mapCustomer", () => {
  it("maps nulls to empty strings", () => {
    expect(
      mapCustomer({
        customer_name: "台積",
        address: null,
        phone: null,
        tax_id: null,
      }),
    ).toEqual({ customerName: "台積", address: "", phone: "", taxId: "" });
  });
});

describe("suggestItems", () => {
  it("returns [] when q is blank without querying", async () => {
    expect(await suggestItems("material", "  ")).toEqual([]);
  });

  it("returns [] when Supabase not configured", async () => {
    configured = false;
    rowsRef.data = [{ material: "SPHC" }];
    expect(await suggestItems("material", "SP")).toEqual([]);
  });

  it("dedupes column values case-insensitively and respects limit", async () => {
    rowsRef.data = [
      { material: "SPHC" },
      { material: "sphc" }, // dup (case)
      { material: "SPCC" },
      { material: null }, // skipped
      { material: "  " }, // blank skipped
      { material: "SGCC" },
    ];
    const out = await suggestItems("material", "S", 2);
    expect(out).toEqual(["SPHC", "SPCC"]);
  });

  it("returns [] on query error", async () => {
    rowsRef.error = { message: "boom" };
    rowsRef.data = [{ material: "SPHC" }];
    expect(await suggestItems("material", "S")).toEqual([]);
  });
});

describe("suggestField", () => {
  it("dedupes free-text history values", async () => {
    rowsRef.data = [
      { carrier: "大順車行" },
      { carrier: "大順車行" },
      { carrier: "順發" },
    ];
    expect(await suggestField("carrier", "順")).toEqual(["大順車行", "順發"]);
  });
});

describe("suggestCustomers", () => {
  it("maps rows to suggestions with related fields", async () => {
    rowsRef.data = [
      { customer_name: "甲公司", address: "台北", phone: "02", tax_id: "123" },
    ];
    const out = await suggestCustomers("甲");
    expect(out).toEqual([
      { customerName: "甲公司", address: "台北", phone: "02", taxId: "123" },
    ]);
  });
});

describe("suggestItemsWithDetails", () => {
  it("dedupes by name and carries unit/price", async () => {
    rowsRef.data = [
      { name: "螺絲", unit: "個", price: 2.5 },
      { name: "螺絲", unit: "包", price: 9 }, // dup name → dropped
      { name: "墊片", unit: null, price: null },
    ];
    const out = await suggestItemsWithDetails("x");
    expect(out).toEqual([
      { name: "螺絲", unit: "個", price: 2.5 },
      { name: "墊片", unit: "", price: null },
    ]);
  });
});
