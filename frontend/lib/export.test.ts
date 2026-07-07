import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { flattenOrder, buildWorkbook, buildFileName } from "./export";
import type { DeliveryOrderRow } from "./db-types";

function baseOrder(over: Partial<DeliveryOrderRow>): DeliveryOrderRow {
  return {
    id: "id",
    template: "metal",
    order_no: null,
    customer_name: null,
    address: null,
    phone: null,
    order_date: null,
    remark: null,
    carrier: null,
    vehicle_no: null,
    lines: [],
    subtotal: null,
    tax_amount: null,
    total: null,
    tax_id: null,
    invoice_no: null,
    offset_x: 0,
    offset_y: 0,
    status: "draft",
    print_count: 0,
    first_printed_at: null,
    last_printed_at: null,
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
    ...over,
  };
}

describe("flattenOrder", () => {
  it("flattens a metal order into one row per line with repeated header info", () => {
    const order = baseOrder({
      template: "metal",
      order_no: "A-001",
      order_date: "2026-06-22",
      customer_name: "峻晟金屬",
      lines: [
        { name: "鋼板", material: "SUS304", size: "4x8", sheets: 3, weight: 120.5 },
        { name: "鐵板", material: "SS400", size: "3x6", sheets: 2, weight: 80 },
      ],
    });
    const rows = flattenOrder(order);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      貨單號碼: "A-001",
      日期: "2026-06-22",
      客戶: "峻晟金屬",
      品名: "鋼板",
      材質: "SUS304",
      尺寸: "4x8",
      片數: 3,
      重量: 120.5,
    });
    // header info repeats on the second row
    expect(rows[1].貨單號碼).toBe("A-001");
    expect(rows[1].品名).toBe("鐵板");
    // no money columns on metal
    expect("金額" in rows[0]).toBe(false);
  });

  it("flattens a standard order with unit/qty/price and computed amount", () => {
    const order = baseOrder({
      template: "standard",
      order_no: "S-9",
      order_date: "2026-06-30",
      customer_name: "王小明",
      lines: [{ name: "螺絲", unit: "包", qty: 10, price: 25 }],
    });
    const rows = flattenOrder(order);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      貨單號碼: "S-9",
      日期: "2026-06-30",
      客戶: "王小明",
      品名: "螺絲",
      單位: "包",
      數量: 10,
      單價: 25,
      金額: 250,
    });
  });

  it("is blank-safe: missing fields become empty strings", () => {
    const order = baseOrder({
      template: "metal",
      lines: [{ name: "板", material: "", size: "", sheets: NaN, weight: null as unknown as number }],
    });
    const rows = flattenOrder(order);
    expect(rows[0].貨單號碼).toBe("");
    expect(rows[0].材質).toBe("");
    expect(rows[0].片數).toBe(""); // NaN -> ""
    expect(rows[0].重量).toBe(""); // null -> ""
  });

  it("keeps one placeholder row for an order with no lines", () => {
    const order = baseOrder({ template: "metal", order_no: "EMPTY", lines: [] });
    const rows = flattenOrder(order);
    expect(rows).toHaveLength(1);
    expect(rows[0].貨單號碼).toBe("EMPTY");
    expect(rows[0].品名).toBe("");
  });
});

describe("buildWorkbook", () => {
  it("separates metal and standard orders into two sheets", () => {
    const orders = [
      baseOrder({
        template: "metal",
        order_no: "M1",
        lines: [{ name: "板", material: "A", size: "1", sheets: 1, weight: 1 }],
      }),
      baseOrder({
        template: "standard",
        order_no: "S1",
        lines: [{ name: "件", unit: "個", qty: 2, price: 3 }],
      }),
    ];
    const wb = buildWorkbook(orders);
    expect(wb.SheetNames).toContain("峻晟(金屬)");
    expect(wb.SheetNames).toContain("標準(含金額)");

    const metal = XLSX.utils.sheet_to_json(wb.Sheets["峻晟(金屬)"]);
    expect(metal).toHaveLength(1);
    expect((metal[0] as Record<string, unknown>)["貨單號碼"]).toBe("M1");

    const std = XLSX.utils.sheet_to_json(wb.Sheets["標準(含金額)"]);
    expect((std[0] as Record<string, unknown>)["金額"]).toBe(6);
  });

  it("builds an empty metal sheet with headers when there are no orders", () => {
    const wb = buildWorkbook([]);
    expect(wb.SheetNames).toEqual(["峻晟(金屬)"]);
  });
});

describe("buildFileName", () => {
  it("includes the compact date range", () => {
    expect(buildFileName("2026-06-01", "2026-06-30")).toBe(
      "出貨單對帳_20260601-20260630.xlsx",
    );
  });
});
