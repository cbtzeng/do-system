import { describe, expect, it } from "vitest";
import type { MetalDoForm, StandardDoForm } from "./contract";
import { mapFormToRow, rocDateToIso } from "./orders";

const metalForm: MetalDoForm = {
  template: "metal",
  header: {
    customerName: "  峻晟金屬  ",
    address: "台中市",
    phone: "04-1234567",
    orderNo: "A-001",
    date: "115 年 6 月 22 日",
    remark: "急件",
    carrier: "大順車行",
    vehicleNo: "ABC-123",
    taxId: "",
    invoiceNo: "",
  },
  lines: [
    { name: "鋼板", material: "SUS304", size: "4x8", sheets: 10, weight: 250 },
  ],
  offsetX: 3,
  offsetY: -2,
};

const standardForm: StandardDoForm = {
  template: "standard",
  header: {
    customerName: "王小明",
    address: "台北市",
    phone: "02-7654321",
    orderNo: "K-999",
    date: "114 年 12 月 1 日",
    remark: "",
    carrier: "",
    vehicleNo: "",
    taxId: "12345678",
    invoiceNo: "AB-11112222",
  },
  lines: [
    { name: "螺絲", unit: "包", qty: 3, price: 100 },
    { name: "墊片", unit: "盒", qty: 2, price: 50 },
  ],
  taxAmount: 20,
  offsetX: 0,
  offsetY: 0,
};

describe("rocDateToIso", () => {
  it("converts ROC free-text to ISO", () => {
    expect(rocDateToIso("115 年 6 月 22 日")).toBe("2026-06-22");
    expect(rocDateToIso("114 年 12 月 1 日")).toBe("2025-12-01");
  });

  it("returns null for unparseable input", () => {
    expect(rocDateToIso("")).toBeNull();
    expect(rocDateToIso("民國")).toBeNull();
    expect(rocDateToIso(null)).toBeNull();
  });
});

describe("mapFormToRow — metal", () => {
  const row = mapFormToRow(metalForm);

  it("maps header + trims whitespace, empty → null", () => {
    expect(row.template).toBe("metal");
    expect(row.order_no).toBe("A-001");
    expect(row.customer_name).toBe("峻晟金屬"); // trimmed
    expect(row.address).toBe("台中市");
    expect(row.phone).toBe("04-1234567");
    expect(row.order_date).toBe("2026-06-22");
    expect(row.remark).toBe("急件");
    expect(row.carrier).toBe("大順車行");
    expect(row.vehicle_no).toBe("ABC-123");
    expect(row.offset_x).toBe(3);
    expect(row.offset_y).toBe(-2);
  });

  it("keeps lines jsonb as-is", () => {
    expect(row.lines).toEqual(metalForm.lines);
  });

  it("leaves standard-only money/tax fields null", () => {
    expect(row.subtotal).toBeNull();
    expect(row.tax_amount).toBeNull();
    expect(row.total).toBeNull();
    expect(row.tax_id).toBeNull();
    expect(row.invoice_no).toBeNull();
  });

  it("omits id when not updating", () => {
    expect(row.id).toBeUndefined();
  });

  it("includes id when updating", () => {
    expect(mapFormToRow(metalForm, "abc-123").id).toBe("abc-123");
  });
});

describe("mapFormToRow — standard", () => {
  const row = mapFormToRow(standardForm);

  it("computes subtotal/tax/total", () => {
    // 3*100 + 2*50 = 400; tax 20; total 420
    expect(row.subtotal).toBe(400);
    expect(row.tax_amount).toBe(20);
    expect(row.total).toBe(420);
  });

  it("maps standard-only tax_id / invoice_no", () => {
    expect(row.tax_id).toBe("12345678");
    expect(row.invoice_no).toBe("AB-11112222");
  });

  it("maps empty free fields to null", () => {
    expect(row.remark).toBeNull();
    expect(row.carrier).toBeNull();
    expect(row.vehicle_no).toBeNull();
  });
});
