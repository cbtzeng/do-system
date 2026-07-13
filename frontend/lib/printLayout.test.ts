import { describe, expect, it } from "vitest";
import {
  PAPER_HEIGHT_MM,
  PAPER_WIDTH_MM,
  isDoForm,
  offsetToMm,
  offsetTransform,
  parsePrintPreviewPayload,
} from "./printLayout";
import type { MetalDoForm } from "./contract";

function metalForm(offsetX = 0, offsetY = 0): MetalDoForm {
  return {
    template: "metal",
    header: {
      customerName: "測試客戶",
      address: "",
      phone: "",
      orderNo: "A-001",
      date: "115 年 6 月 22 日",
      remark: "",
      carrier: "",
      vehicleNo: "",
      taxId: "",
      invoiceNo: "",
    },
    lines: [{ name: "白鐵板", material: "SUS304", size: "4x8", sheets: 2, weight: 30 }],
    offsetX,
    offsetY,
  };
}

describe("紙張尺寸", () => {
  it("中一刀 = 8.5 × 5.5 吋(橫式)", () => {
    expect(PAPER_WIDTH_MM).toBeCloseTo(8.5 * 25.4, 5);
    expect(PAPER_HEIGHT_MM).toBeCloseTo(5.5 * 25.4, 5);
  });
});

describe("offsetToMm", () => {
  it("0 微調 → 0 位移", () => {
    expect(offsetToMm(0, 0)).toEqual({ xMm: 0, yMm: 0 });
  });

  it("X 以 1/60 吋為單位:60 → 1 吋 = 25.4mm", () => {
    expect(offsetToMm(60, 0).xMm).toBeCloseTo(25.4, 6);
  });

  it("Y 以 1/180 吋為單位:180 → 1 吋 = 25.4mm", () => {
    expect(offsetToMm(0, 180).yMm).toBeCloseTo(25.4, 6);
  });

  it("同樣的數值,X 的位移是 Y 的 3 倍(60 vs 180 分之一吋)", () => {
    const { xMm, yMm } = offsetToMm(12, 12);
    expect(xMm).toBeCloseTo(yMm * 3, 6);
  });

  it("單步微調:X 1 = 1/60 吋、Y 1 = 1/180 吋", () => {
    expect(offsetToMm(1, 1).xMm).toBeCloseTo(25.4 / 60, 6);
    expect(offsetToMm(1, 1).yMm).toBeCloseTo(25.4 / 180, 6);
  });

  it("負數 = 往左 / 往上", () => {
    const { xMm, yMm } = offsetToMm(-30, -90);
    expect(xMm).toBeCloseTo(-12.7, 6);
    expect(yMm).toBeCloseTo(-12.7, 6);
  });

  it("NaN / Infinity 視為 0(輸入框清空時)", () => {
    expect(offsetToMm(NaN, Infinity)).toEqual({ xMm: 0, yMm: 0 });
  });
});

describe("offsetTransform", () => {
  it("產生 mm 單位的 CSS translate", () => {
    expect(offsetTransform(60, 180)).toBe("translate(25.4mm, 25.4mm)");
  });

  it("四捨五入到小數第 3 位", () => {
    expect(offsetTransform(1, 1)).toBe("translate(0.423mm, 0.141mm)");
  });

  it("0 微調 → 不位移", () => {
    expect(offsetTransform(0, 0)).toBe("translate(0mm, 0mm)");
  });
});

describe("isDoForm", () => {
  it("接受 metal 表單", () => {
    expect(isDoForm(metalForm())).toBe(true);
  });

  it("拒絕 null / 字串 / 缺欄位 / 未知版型", () => {
    expect(isDoForm(null)).toBe(false);
    expect(isDoForm("x")).toBe(false);
    expect(isDoForm({ template: "metal" })).toBe(false);
    expect(isDoForm({ ...metalForm(), template: "other" })).toBe(false);
    expect(isDoForm({ ...metalForm(), offsetX: "3" })).toBe(false);
  });
});

describe("parsePrintPreviewPayload", () => {
  it("讀回 payload 中的表單", () => {
    const raw = JSON.stringify({ form: metalForm(3, -6), savedAt: "2026-07-12T00:00:00Z" });
    const form = parsePrintPreviewPayload(raw);
    expect(form?.offsetX).toBe(3);
    expect(form?.offsetY).toBe(-6);
    expect(form?.header.orderNo).toBe("A-001");
  });

  it("null / 空字串 / 壞 JSON / 非表單 → null", () => {
    expect(parsePrintPreviewPayload(null)).toBeNull();
    expect(parsePrintPreviewPayload("")).toBeNull();
    expect(parsePrintPreviewPayload("{not json")).toBeNull();
    expect(parsePrintPreviewPayload(JSON.stringify({ form: { template: "x" } }))).toBeNull();
  });
});
