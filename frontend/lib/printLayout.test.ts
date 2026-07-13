import { describe, expect, it } from "vitest";
import {
  DEFAULT_PRINTABLE_WINDOW,
  DEFAULT_PRINT_SETTINGS,
  MAX_MARGIN_MM,
  MAX_SCALE_PERCENT,
  MIN_SCALE_PERCENT,
  PAPER_HEIGHT_MM,
  PAPER_WIDTH_MM,
  ROTATE_SHIFT_MM,
  SUGGEST_SLACK_MM,
  checkPrintableFit,
  clampMarginMm,
  clampScalePercent,
  contentEdgesMm,
  feedAxis,
  isDoForm,
  offsetToMm,
  offsetTransform,
  pageOffsetMm,
  pageRule,
  pageSizeMm,
  parsePrintPreviewPayload,
  parsePrintSettings,
  sheetTransform,
  suggestFit,
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
  it("沒存過 / 壞 JSON → 預設(不旋轉、100%、上 10 / 下 3mm)", () => {
    expect(parsePrintSettings(null)).toEqual(DEFAULT_PRINT_SETTINGS);
    expect(parsePrintSettings("")).toEqual(DEFAULT_PRINT_SETTINGS);
    expect(parsePrintSettings("{not json")).toEqual(DEFAULT_PRINT_SETTINGS);
    expect(parsePrintSettings('"x"')).toEqual(DEFAULT_PRINT_SETTINGS);
  });

  it("讀回上次的設定", () => {
    const raw = JSON.stringify({
      rotate: true,
      scalePercent: 90,
      printableTopMm: 12,
      printableBottomMm: 4.5,
    });
    expect(parsePrintSettings(raw)).toEqual({
      rotate: true,
      scalePercent: 90,
      printableTopMm: 12,
      printableBottomMm: 4.5,
    });
  });

  it("缺欄位 / 型別錯 → 該欄回退預設", () => {
    expect(parsePrintSettings("{}")).toEqual(DEFAULT_PRINT_SETTINGS);
    expect(parsePrintSettings(JSON.stringify({ rotate: "yes" }))).toEqual({
      ...DEFAULT_PRINT_SETTINGS,
      rotate: false,
      scalePercent: 100,
    });
    expect(
      parsePrintSettings(JSON.stringify({ rotate: true, scalePercent: 5000 })),
    ).toEqual({
      ...DEFAULT_PRINT_SETTINGS,
      rotate: true,
      scalePercent: MAX_SCALE_PERCENT,
    });
  });

  it("#K 舊存檔(只有 rotate / scalePercent)→ 補上實測預設邊界,不洗掉既有設定", () => {
    const legacy = JSON.stringify({ rotate: true, scalePercent: 85 });
    expect(parsePrintSettings(legacy)).toEqual({
      rotate: true,
      scalePercent: 85,
      printableTopMm: 10,
      printableBottomMm: 3,
    });
  });

  it("邊界超出範圍 → 夾到 0–60mm", () => {
    const raw = JSON.stringify({ printableTopMm: -5, printableBottomMm: 999 });
    const s = parsePrintSettings(raw);
    expect(s.printableTopMm).toBe(0);
    expect(s.printableBottomMm).toBe(MAX_MARGIN_MM);
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

/* ------------------------------------------------ 內容落點(#33 讀數) */
//
// 讀數必須模擬 DOM 真正的行為,不是 UI 的名目值:
//   - .shift(微調)是 .paper(縮放)的子層 → 位移被 scale 乘進去(s·offset)。
//   - 旋轉 90° 時 rotate 把 (x, y) 映成 (−y, x) → X/Y 軸互換,且 Y 變號。
// 這兩點就是這個功能的全部價值(取代試印),測試把它們釘死。

describe("pageOffsetMm(有效位移)", () => {
  it("100% 不旋轉:有效位移 = 名目位移", () => {
    const o = pageOffsetMm(100, 60, 180, false);
    expect(o.dxMm).toBeCloseTo(25.4, 6);
    expect(o.dyMm).toBeCloseTo(25.4, 6);
  });

  it("縮放會乘進位移:90% + Y=40 → 名目 5.644mm,紙上只走 5.08mm", () => {
    const nominal = offsetToMm(0, 40).yMm;
    expect(nominal).toBeCloseTo(5.644, 3);
    const o = pageOffsetMm(90, 0, 40, false);
    expect(o.dyMm).toBeCloseTo(0.9 * nominal, 6);
    expect(o.dyMm).toBeCloseTo(5.08, 3);
  });

  it("旋轉 90°:X 推走紙方向、Y 變成左右移且變號(rotate 把 (x,y) 映成 (−y,x))", () => {
    const o = pageOffsetMm(100, 60, 180, true);
    // X=60(名目 25.4mm)→ 頁面**垂直**位移 +25.4mm。
    expect(o.dyMm).toBeCloseTo(25.4, 6);
    // Y=180(名目 25.4mm)→ 頁面**水平**位移 −25.4mm(往左)。
    expect(o.dxMm).toBeCloseTo(-25.4, 6);
  });

  it("旋轉時縮放一樣會乘進去", () => {
    const o = pageOffsetMm(80, 60, 180, true);
    expect(o.dyMm).toBeCloseTo(0.8 * 25.4, 6);
    expect(o.dxMm).toBeCloseTo(-0.8 * 25.4, 6);
  });

  it("feedAxis:不旋轉 → Y;旋轉 → X", () => {
    expect(feedAxis(false)).toBe("y");
    expect(feedAxis(true)).toBe("x");
  });
});

describe("contentEdgesMm", () => {
  it("100% 不微調 → 內容 = 整張頁面", () => {
    const e = contentEdgesMm({ scale: 100, offsetX: 0, offsetY: 0, rotate: false });
    expect(e).toEqual({
      pageWidthMm: 215.9,
      pageHeightMm: 139.7,
      topMm: 0,
      bottomMm: 139.7,
      heightMm: 139.7,
      leftMm: 0,
      rightMm: 215.9,
      widthMm: 215.9,
    });
  });

  // 現場實測的三組(H = 139.7mm)。上緣 = (H − H·s)/2 + s·yMm。
  it("縮放 90% + Y=0 → 上緣 ≈ 6.99mm、下緣 ≈ 132.71mm", () => {
    const e = contentEdgesMm({ scale: 90, offsetX: 0, offsetY: 0, rotate: false });
    expect(e.heightMm).toBeCloseTo(125.73, 3);
    expect(e.topMm).toBeCloseTo(6.985, 3);
    expect(e.bottomMm).toBeCloseTo(132.715, 3);
  });

  it("縮放 90% + Y=40 → 上緣 ≈ 12.07mm、下緣 ≈ 137.80mm(位移被 0.9 乘過)", () => {
    const e = contentEdgesMm({ scale: 90, offsetX: 0, offsetY: 40, rotate: false });
    // 6.985 + 0.9 × 5.644 = 12.065(名目模型會錯給 12.63)。
    expect(e.topMm).toBeCloseTo(12.065, 3);
    expect(e.bottomMm).toBeCloseTo(137.795, 3);
  });

  it("縮放 85% + Y=18 → 上緣 ≈ 12.64mm、下緣 ≈ 131.38mm", () => {
    const e = contentEdgesMm({ scale: 85, offsetX: 0, offsetY: 18, rotate: false });
    expect(e.heightMm).toBeCloseTo(118.745, 3);
    // 10.4775 + 0.85 × 2.54 = 12.6365 → 螢幕顯示 12.64(名目模型會錯給 13.02)。
    expect(e.topMm).toBeCloseTo(12.6365, 2);
    expect(e.bottomMm).toBeCloseTo(131.3815, 2);
  });

  it("下緣 = 上緣 + 內容高度(恆等式)", () => {
    for (const scale of [80, 85, 90, 100, 110, 120]) {
      for (const offsetY of [-30, 0, 18, 40]) {
        const e = contentEdgesMm({ scale, offsetX: 0, offsetY, rotate: false });
        // 各欄位各自取到小數第 3 位 → 恆等式最多差 1 個 ulp(0.001mm)。
        expect(e.bottomMm).toBeCloseTo(e.topMm + e.heightMm, 2);
        expect(e.heightMm).toBeCloseTo((139.7 * scale) / 100, 3);
      }
    }
  });

  it("100% 時有效位移 = 名目位移(s = 1,兩個模型在此重合)", () => {
    const e = contentEdgesMm({ scale: 100, offsetX: 0, offsetY: 40, rotate: false });
    expect(e.topMm).toBeCloseTo(offsetToMm(0, 40).yMm, 3);
  });

  it("水平同理:左緣用頁寬與 s·X", () => {
    // 90% → 左右各留 (215.9 − 194.31)/2 = 10.795mm;X=60(名目 25.4mm)→ 紙上 22.86mm。
    const e = contentEdgesMm({ scale: 90, offsetX: 60, offsetY: 0, rotate: false });
    expect(e.widthMm).toBeCloseTo(194.31, 3);
    expect(e.leftMm).toBeCloseTo(10.795 + 0.9 * 25.4, 3);
    expect(e.rightMm).toBeCloseTo(e.leftMm + e.widthMm, 3);
  });

  it("Y 負值 = 往上移(一樣乘 s)", () => {
    const zero = contentEdgesMm({ scale: 90, offsetX: 0, offsetY: 0, rotate: false });
    const up = contentEdgesMm({ scale: 90, offsetX: 0, offsetY: -18, rotate: false });
    expect(up.topMm).toBeCloseTo(zero.topMm - 0.9 * 2.54, 3);
  });

  it("旋轉 90°:走紙方向換成長邊(215.9mm),且改由 X 微調推動", () => {
    const base = contentEdgesMm({ scale: 90, offsetX: 0, offsetY: 0, rotate: true });
    expect(base.pageHeightMm).toBe(215.9);
    expect(base.pageWidthMm).toBe(139.7);
    expect(base.heightMm).toBeCloseTo(194.31, 3);
    expect(base.topMm).toBeCloseTo(10.795, 3);

    // X=60(名目 1 吋)→ 上緣往下 0.9 × 25.4 = 22.86mm。
    const withX = contentEdgesMm({ scale: 90, offsetX: 60, offsetY: 0, rotate: true });
    expect(withX.topMm).toBeCloseTo(10.795 + 22.86, 3);
  });

  it("旋轉 90°:Y 微調完全不動走紙方向(只左右移,而且往左)", () => {
    const base = contentEdgesMm({ scale: 90, offsetX: 0, offsetY: 0, rotate: true });
    const withY = contentEdgesMm({ scale: 90, offsetX: 0, offsetY: 180, rotate: true });
    // 上下緣不動 —— 這正是名目模型會騙人的地方。
    expect(withY.topMm).toBeCloseTo(base.topMm, 6);
    expect(withY.bottomMm).toBeCloseTo(base.bottomMm, 6);
    // 左緣往左 0.9 × 25.4 = 22.86mm。
    expect(withY.leftMm).toBeCloseTo(base.leftMm - 22.86, 3);
  });

  it("縮放超出 80–120% 先被夾住(與輸入框同一套規則)", () => {
    const e = contentEdgesMm({ scale: 500, offsetX: 0, offsetY: 0, rotate: false });
    expect(e.heightMm).toBeCloseTo(139.7 * 1.2, 3);
    expect(e.topMm).toBeCloseTo(-13.97, 3);
  });
});

describe("clampMarginMm", () => {
  it("預設邊界 = 現場實測的上 10 / 下 3mm", () => {
    expect(DEFAULT_PRINTABLE_WINDOW).toEqual({ topMm: 10, bottomMm: 3 });
  });

  it("夾在 0–60mm", () => {
    expect(clampMarginMm(-3, 10)).toBe(0);
    expect(clampMarginMm(999, 10)).toBe(MAX_MARGIN_MM);
    expect(clampMarginMm(12.5, 10)).toBe(12.5);
  });

  it("接受字串;空白 / NaN / null → fallback(輸入框清空時不要炸)", () => {
    expect(clampMarginMm("7.5", 10)).toBe(7.5);
    expect(clampMarginMm("", 10)).toBe(10);
    expect(clampMarginMm("abc", 3)).toBe(3);
    expect(clampMarginMm(NaN, 3)).toBe(3);
    expect(clampMarginMm(null, 3)).toBe(3);
    expect(clampMarginMm(undefined, 3)).toBe(3);
  });
});

describe("checkPrintableFit(上 10 / 下 3mm)", () => {
  const w = DEFAULT_PRINTABLE_WINDOW;
  const edges = (scale: number, offsetY: number) =>
    contentEdgesMm({ scale, offsetX: 0, offsetY, rotate: false });

  it("可列印範圍 = 10 – 136.7mm(高 126.7mm)", () => {
    const fit = checkPrintableFit(edges(100, 0), w);
    expect(fit.printableTopMm).toBe(10);
    expect(fit.printableBottomMm).toBeCloseTo(136.7, 3);
    expect(fit.printableHeightMm).toBeCloseTo(126.7, 3);
  });

  it("100%:一整節就是頁高 → 上下都被裁(現場遇到的狀況)", () => {
    const fit = checkPrintableFit(edges(100, 0), w);
    expect(fit.ok).toBe(false);
    expect(fit.topClipMm).toBeCloseTo(10, 3);
    expect(fit.bottomClipMm).toBeCloseTo(3, 3);
  });

  it("90% + Y=0:上緣 6.985 < 10 → 上面被裁 3.015mm", () => {
    const fit = checkPrintableFit(edges(90, 0), w);
    expect(fit.ok).toBe(false);
    expect(fit.topClipMm).toBeCloseTo(3.015, 3);
    expect(fit.bottomClipMm).toBe(0);
  });

  it("90% + Y=40:下緣 137.795 > 136.7 → 下面被裁(90% 顧此失彼,塞不進去)", () => {
    const fit = checkPrintableFit(edges(90, 40), w);
    expect(fit.ok).toBe(false);
    expect(fit.topClipMm).toBe(0);
    expect(fit.bottomClipMm).toBeCloseTo(1.095, 3);
  });

  it("85% + Y=18:兩邊都在範圍內 → OK", () => {
    const fit = checkPrintableFit(edges(85, 18), w);
    expect(fit.ok).toBe(true);
    expect(fit.topClipMm).toBe(0);
    expect(fit.bottomClipMm).toBe(0);
  });

  it("剛好貼齊邊界不算被裁(浮點容差)", () => {
    const fit = checkPrintableFit(edges(100, 0), { topMm: 0, bottomMm: 0 });
    expect(fit.ok).toBe(true);
  });
});

describe("suggestFit", () => {
  it("上 10 / 下 3mm → 建議 87% + Y=29,內容落在 12.64 – 134.18mm(可列印範圍內)", () => {
    const s = suggestFit(DEFAULT_PRINTABLE_WINDOW, false);
    expect(s.scalePercent).toBe(87);
    expect(s.axis).toBe("y");
    // 反解時除以 s:需要 3.5mm 位移 → 3.5 / 0.87 = 4.023mm → 29 個 1/180 吋。
    // (忘了除以 s 會給出 25,內容只走 3.02mm,上緣少了近 0.5mm。)
    expect(s.offsetY).toBe(29);
    expect(s.fits).toBe(true);
    expect(s.fit.ok).toBe(true);
    expect(s.edges.heightMm).toBeCloseTo(121.539, 3);
    expect(s.edges.topMm).toBeCloseTo(12.641, 2);
    expect(s.edges.bottomMm).toBeCloseTo(134.18, 2);
  });

  it("建議值一定塞得進可列印範圍,且留有餘裕", () => {
    const s = suggestFit(DEFAULT_PRINTABLE_WINDOW, false);
    expect(s.edges.topMm).toBeGreaterThanOrEqual(s.fit.printableTopMm);
    expect(s.edges.bottomMm).toBeLessThanOrEqual(s.fit.printableBottomMm);
    expect(s.edges.heightMm).toBeLessThanOrEqual(
      s.fit.printableHeightMm - SUGGEST_SLACK_MM,
    );
  });

  it("內容置中於可列印範圍(上下餘裕大致相等)", () => {
    const s = suggestFit(DEFAULT_PRINTABLE_WINDOW, false);
    const gapTop = s.edges.topMm - s.fit.printableTopMm;
    const gapBottom = s.fit.printableBottomMm - s.edges.bottomMm;
    // 只差在微調被四捨五入成整數步進。
    expect(Math.abs(gapTop - gapBottom)).toBeLessThan(0.3);
  });

  it("回傳整數微調(輸入框只吃整數步進)", () => {
    const s = suggestFit(DEFAULT_PRINTABLE_WINDOW, false);
    expect(Number.isInteger(s.offsetX)).toBe(true);
    expect(Number.isInteger(s.offsetY)).toBe(true);
    expect(Number.isInteger(s.scalePercent)).toBe(true);
  });

  it("建議值套回 contentEdgesMm 會得到同一組落點(讀數 = 建議 = 紙上)", () => {
    for (const rotate of [false, true]) {
      const s = suggestFit(DEFAULT_PRINTABLE_WINDOW, rotate);
      expect(
        contentEdgesMm({
          scale: s.scalePercent,
          offsetX: s.offsetX,
          offsetY: s.offsetY,
          rotate,
        }),
      ).toEqual(s.edges);
    }
  });

  it("不動另一軸:保留使用者已經對好的左右位移", () => {
    const s = suggestFit(DEFAULT_PRINTABLE_WINDOW, false, { offsetX: 7 });
    expect(s.offsetX).toBe(7); // 原封不動帶回
    expect(s.offsetY).toBe(29);
    // 左緣照 s·X 位移。
    expect(s.edges.leftMm).toBeCloseTo(
      (215.9 - 215.9 * 0.87) / 2 + 0.87 * (7 / 60) * 25.4,
      3,
    );
  });

  it("邊界很小 → 可以用到接近 100%(不會為了縮而縮)", () => {
    const s = suggestFit({ topMm: 0, bottomMm: 0 }, false);
    expect(s.scalePercent).toBe(97); // (139.7 − 4mm 餘裕) / 139.7 → 97%
    expect(s.offsetY).toBe(0); // 已經置中,不必推
    expect(s.fits).toBe(true);
  });

  it("邊界大到連 80% 都塞不下 → fits = false(不假裝有解)", () => {
    const s = suggestFit({ topMm: 30, bottomMm: 30 }, false);
    expect(s.scalePercent).toBe(MIN_SCALE_PERCENT);
    expect(s.fits).toBe(false);
    expect(s.fit.ok).toBe(false);
  });

  it("旋轉 90°:改以 215.9mm 頁高計算,且解的是 **X**(走紙方向)", () => {
    const s = suggestFit(DEFAULT_PRINTABLE_WINDOW, true);
    expect(s.edges.pageHeightMm).toBe(215.9);
    expect(s.scalePercent).toBe(92);
    expect(s.axis).toBe("x");
    expect(s.offsetX).toBe(9); // 3.5 / 0.92 = 3.804mm → 9 個 1/60 吋
    expect(s.offsetY).toBe(0);
    expect(s.fits).toBe(true);
    expect(s.fit.ok).toBe(true);
  });

  it("旋轉時保留使用者的 Y(左右位移)", () => {
    const s = suggestFit(DEFAULT_PRINTABLE_WINDOW, true, { offsetY: -12 });
    expect(s.offsetY).toBe(-12);
    expect(s.fits).toBe(true);
  });
});
