import { describe, expect, it } from "vitest";
import {
  DEFAULT_PRINT_SETTINGS,
  MAX_SCALE_PERCENT,
  MIN_SCALE_PERCENT,
  PAPER_HEIGHT_MM,
  PAPER_WIDTH_MM,
  ROTATE_SHIFT_MM,
  clampScalePercent,
  isDoForm,
  offsetToMm,
  offsetTransform,
  pageRule,
  pageSizeMm,
  parsePrintPreviewPayload,
  parsePrintSettings,
  sheetTransform,
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

describe("pageSizeMm / pageRule(旋轉 90°)", () => {
  it("不旋轉(預設)= 橫式 215.9 × 139.7mm", () => {
    expect(pageSizeMm(false)).toEqual({ widthMm: 215.9, heightMm: 139.7 });
  });

  it("旋轉 = 直式 139.7 × 215.9mm(長短邊對調)", () => {
    expect(pageSizeMm(true)).toEqual({ widthMm: 139.7, heightMm: 215.9 });
  });

  it("旋轉前後面積相同,只是長短邊互換", () => {
    const flat = pageSizeMm(false);
    const rot = pageSizeMm(true);
    expect(rot.widthMm).toBe(flat.heightMm);
    expect(rot.heightMm).toBe(flat.widthMm);
  });

  it("不旋轉時 @page 規則與 #K 上線版本逐字相同(不得回歸)", () => {
    expect(pageRule(false)).toBe("@page { size: 215.9mm 139.7mm; margin: 0; }");
  });

  it("旋轉時 @page 換成直式,邊界仍為 0", () => {
    expect(pageRule(true)).toBe("@page { size: 139.7mm 215.9mm; margin: 0; }");
  });
});

describe("clampScalePercent", () => {
  it("預設 100%", () => {
    expect(DEFAULT_PRINT_SETTINGS.scalePercent).toBe(100);
    expect(clampScalePercent(100)).toBe(100);
  });

  it("夾在 80–120% 之間", () => {
    expect(clampScalePercent(10)).toBe(MIN_SCALE_PERCENT);
    expect(clampScalePercent(999)).toBe(MAX_SCALE_PERCENT);
    expect(clampScalePercent(95)).toBe(95);
  });

  it("接受字串(input 的 e.target.value)", () => {
    expect(clampScalePercent("90")).toBe(90);
  });

  it("小數四捨五入成整數", () => {
    expect(clampScalePercent(95.4)).toBe(95);
    expect(clampScalePercent(95.6)).toBe(96);
  });

  it("空字串 / NaN / null → 100(輸入框清空時不要炸)", () => {
    expect(clampScalePercent("")).toBe(100);
    expect(clampScalePercent(NaN)).toBe(100);
    expect(clampScalePercent(null)).toBe(100);
    expect(clampScalePercent(undefined)).toBe(100);
    expect(clampScalePercent("abc")).toBe(100);
  });
});

describe("ROTATE_SHIFT_MM", () => {
  it("= (短邊 − 長邊) / 2 = −38.1mm:把轉 90° 後的紙張推回直式頁面正中央", () => {
    expect(ROTATE_SHIFT_MM).toBeCloseTo((PAPER_HEIGHT_MM - PAPER_WIDTH_MM) / 2, 6);
    expect(ROTATE_SHIFT_MM).toBeCloseTo(-38.1, 6);
  });

  it("平移後轉 90° 的紙張正好貼齊直式頁面(四角落在 0,0 – 139.7,215.9)", () => {
    // 紙張中心(未轉)= (W/2, H/2);平移 (shift, −shift) 後 = 直式頁面中心。
    const centreX = PAPER_WIDTH_MM / 2 + ROTATE_SHIFT_MM;
    const centreY = PAPER_HEIGHT_MM / 2 - ROTATE_SHIFT_MM;
    const page = pageSizeMm(true);
    expect(centreX).toBeCloseTo(page.widthMm / 2, 6);
    expect(centreY).toBeCloseTo(page.heightMm / 2, 6);
    // 轉 90° 後外框 = 139.7 × 215.9 → 以該中心展開正好等於頁面,不裁切。
    expect(centreX - PAPER_HEIGHT_MM / 2).toBeCloseTo(0, 6);
    expect(centreY - PAPER_WIDTH_MM / 2).toBeCloseTo(0, 6);
  });
});

describe("sheetTransform", () => {
  it("預設(不旋轉 + 100%)→ none,維持原本不套 transform 的行為", () => {
    expect(sheetTransform(false, 100)).toBe("none");
  });

  it("旋轉:先平移回頁面中心、再轉 90°", () => {
    expect(sheetTransform(true, 100)).toBe(
      "translate(-38.1mm, 38.1mm) rotate(90deg)",
    );
  });

  it("只縮放(不旋轉時 layout box 已與頁面重合,不必平移)", () => {
    expect(sheetTransform(false, 90)).toBe("scale(0.9)");
  });

  it("旋轉 + 縮放", () => {
    expect(sheetTransform(true, 95)).toBe(
      "translate(-38.1mm, 38.1mm) rotate(90deg) scale(0.95)",
    );
  });

  it("超出範圍的縮放先被夾住", () => {
    expect(sheetTransform(false, 500)).toBe("scale(1.2)");
    expect(sheetTransform(false, 0)).toBe("scale(0.8)");
  });
});

describe("parsePrintSettings", () => {
  it("沒存過 / 壞 JSON → 預設(不旋轉、100%)", () => {
    expect(parsePrintSettings(null)).toEqual(DEFAULT_PRINT_SETTINGS);
    expect(parsePrintSettings("")).toEqual(DEFAULT_PRINT_SETTINGS);
    expect(parsePrintSettings("{not json")).toEqual(DEFAULT_PRINT_SETTINGS);
    expect(parsePrintSettings('"x"')).toEqual(DEFAULT_PRINT_SETTINGS);
  });

  it("讀回上次的設定", () => {
    const raw = JSON.stringify({ rotate: true, scalePercent: 90 });
    expect(parsePrintSettings(raw)).toEqual({ rotate: true, scalePercent: 90 });
  });

  it("缺欄位 / 型別錯 → 該欄回退預設", () => {
    expect(parsePrintSettings("{}")).toEqual(DEFAULT_PRINT_SETTINGS);
    expect(parsePrintSettings(JSON.stringify({ rotate: "yes" }))).toEqual({
      rotate: false,
      scalePercent: 100,
    });
    expect(
      parsePrintSettings(JSON.stringify({ rotate: true, scalePercent: 5000 })),
    ).toEqual({ rotate: true, scalePercent: MAX_SCALE_PERCENT });
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
