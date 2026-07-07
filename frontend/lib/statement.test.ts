import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import {
  computeAmount,
  computeTotals,
  flattenToStatementRows,
  buildStatementWorkbook,
  buildStatementFileName,
  rocPeriodLabel,
  formatMonthDay,
  type StatementRow,
} from "./statement";
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

function row(over: Partial<StatementRow>): StatementRow {
  return {
    sourceOrderId: "o1",
    sourceLineIndex: 0,
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

describe("computeAmount", () => {
  it("金額 = round(重量 × 單價):260 × 25.0 = 6,500", () => {
    expect(computeAmount(260, 25.0)).toBe(6500);
  });

  it("四捨五入到整數", () => {
    expect(computeAmount(10.5, 3.33)).toBe(35); // 34.965 -> 35
  });

  it("非有限值視為 0", () => {
    expect(computeAmount(NaN, 25)).toBe(0);
    expect(computeAmount(260, NaN)).toBe(0);
  });
});

// 真實樣本(峻晟對帳單):5 列,小計 546,226 / 稅 27,311 / 合計 573,537。
const SAMPLE_ROWS: StatementRow[] = [
  row({ weight: 260, price: 25.0 }), // 6,500
  row({ weight: 5142, price: 25.5 }), // 131,121
  row({ weight: 4830, price: 25.5 }), // 123,165
  row({ weight: 5100, price: 25.5 }), // 130,050
  row({ weight: 15539, price: 10.0 }), // 155,390
];

describe("computeTotals", () => {
  it("符合真實樣本:小計 546,226 / 稅 27,311 / 合計 573,537", () => {
    const t = computeTotals(SAMPLE_ROWS);
    expect(t.subtotal).toBe(546226);
    expect(t.tax).toBe(27311);
    expect(t.total).toBe(573537);
  });

  it("空列 → 全 0", () => {
    expect(computeTotals([])).toEqual({ subtotal: 0, tax: 0, total: 0 });
  });
});

describe("flattenToStatementRows", () => {
  it("攤平 metal 單成一列一品項,帶單價與來源索引", () => {
    const orders = [
      baseOrder({
        id: "ORD1",
        customer_name: "峻晟金屬",
        order_date: "2026-07-05",
        lines: [
          {
            name: "SRS60401-M1",
            material: "SPHC PO",
            size: "1.2x1040x1220",
            sheets: 10,
            weight: 260,
            price: 25.0,
          } as never,
          {
            name: "B",
            material: "SS400",
            size: "2x3",
            sheets: 2,
            weight: 5142,
            price: 25.5,
          } as never,
        ],
      }),
    ];
    const rows = flattenToStatementRows(orders);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      sourceOrderId: "ORD1",
      sourceLineIndex: 0,
      customerName: "峻晟金屬",
      isoDate: "2026-07-05",
      name: "SRS60401-M1",
      material: "SPHC PO",
      size: "1.2x1040x1220",
      sheets: 10,
      weight: 260,
      price: 25.0,
    });
    expect(rows[1].sourceLineIndex).toBe(1);
    // 金額由 computeAmount 導出
    expect(computeAmount(rows[0].weight, rows[0].price)).toBe(6500);
  });

  it("缺 price 的舊資料 → price 預設 0", () => {
    const orders = [
      baseOrder({
        lines: [
          { name: "X", material: "", size: "", sheets: 1, weight: 100 } as never,
        ],
      }),
    ];
    const rows = flattenToStatementRows(orders);
    expect(rows[0].price).toBe(0);
  });

  it("忽略非 metal 版出貨單", () => {
    const orders = [
      baseOrder({ template: "standard", lines: [{ name: "A" } as never] }),
    ];
    expect(flattenToStatementRows(orders)).toHaveLength(0);
  });
});

describe("formatMonthDay", () => {
  it("YYYY-MM-DD → M月D日", () => {
    expect(formatMonthDay("2026-07-05")).toBe("7月5日");
    expect(formatMonthDay(null)).toBe("");
  });
});

describe("rocPeriodLabel", () => {
  it("西元 → 民國:2026-07 → 115年7月", () => {
    expect(rocPeriodLabel(2026, 7)).toBe("115年7月");
  });
});

describe("buildStatementFileName", () => {
  it("對帳單_<客戶>_<115年7月>.xlsx", () => {
    expect(buildStatementFileName("峻晟金屬", "115年7月")).toBe(
      "對帳單_峻晟金屬_115年7月.xlsx",
    );
  });
});

describe("buildStatementWorkbook", () => {
  it("單一客戶 → 一張工作表,含標題/表頭/合計", () => {
    const wb = buildStatementWorkbook("客戶A", "115年7月", SAMPLE_ROWS);
    expect(wb.SheetNames).toHaveLength(1);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const aoa = XLSX.utils.sheet_to_json<(string | number)[]>(ws, {
      header: 1,
    });
    expect(aoa[0][0]).toBe("峻晟金屬股份有限公司");
    expect(aoa[1][0]).toBe("對帳單");
    expect(aoa[3]).toEqual([
      "日期",
      "品號",
      "材質",
      "規格",
      "片數",
      "重量",
      "單價",
      "金額",
    ]);
    // 最後三列是小計 / 營業稅 / 合計
    const last3 = aoa.slice(-3);
    expect(last3[0][6]).toBe("小計");
    expect(last3[0][7]).toBe(546226);
    expect(last3[1][6]).toBe("營業稅");
    expect(last3[1][7]).toBe(27311);
    expect(last3[2][6]).toBe("合計");
    expect(last3[2][7]).toBe(573537);
  });

  it("全部客戶(customer=null)→ 每客戶一張工作表", () => {
    const rows = [
      row({ customerName: "甲公司", weight: 100, price: 10 }),
      row({ customerName: "乙公司", weight: 200, price: 10 }),
      row({ customerName: "甲公司", weight: 50, price: 10 }),
    ];
    const wb = buildStatementWorkbook(null, "115年7月", rows);
    expect(wb.SheetNames).toEqual(["甲公司", "乙公司"]);
  });

  it("全部客戶但無資料 → 仍建一張空表", () => {
    const wb = buildStatementWorkbook(null, "115年7月", []);
    expect(wb.SheetNames).toEqual(["對帳單"]);
  });
});
