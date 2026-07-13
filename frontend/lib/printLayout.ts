// 瀏覽器直印(#K)共用工具 — 純函式 + 開單頁↔新分頁的 localStorage 交握。
//
// 兩條列印路徑並存,互不影響:
//   1) agent 路徑:預覽 → PNG → POST localhost:9100/print-image → raw ESC/P(需 Generic/Text Only 佇列)
//   2) 瀏覽器路徑(本檔):/print-preview 以實體尺寸渲染 → window.print()(需原廠 EPSON LQ-310 驅動)
//
// 本檔只服務第 2 條路徑,不碰 printClient / escp。

import type { DoForm } from "./contract";

/* ---------------------------------------------------------------- 紙張 */

/** 中一刀(8.5 × 5.5 吋,橫式)寬度,單位 mm。 */
export const PAPER_WIDTH_MM = 215.9;

/** 中一刀(8.5 × 5.5 吋,橫式)高度,單位 mm。 */
export const PAPER_HEIGHT_MM = 139.7;

/* -------------------------------------------------- 列印方向 / 縮放 */
//
// 現場問題(#32):LQ-310 驅動裡沒有「中一刀」自訂表單時,Chrome 會退回預設的
// 直式紙張,並把我們宣告的橫式頁面**自動轉 90°**塞進去 —— 轉完之後內容沿走紙
// 方向長 215.9mm,超過一節 139.7mm 的表單長度,於是**跨兩節**。
//
// 真正的解法是在驅動端建立自訂表單(見頁面上的設定指引),但驅動不聽話時要有
// 補償手段:「旋轉 90°」開關會把宣告的頁面尺寸換成**直式**(139.7 × 215.9mm),
// 同時把紙張內容轉 90° —— 兩個一起做,轉出來的內容才會正著落在直式紙上。

/** 列印頁面尺寸(mm)。 */
export interface PageSizeMm {
  widthMm: number;
  heightMm: number;
}

/**
 * 依「旋轉 90°」開關回傳 @page 的頁面尺寸。
 * - 關(預設):橫式 215.9 × 139.7mm —— 與 #K 上線時的行為完全相同。
 * - 開:直式 139.7 × 215.9mm —— 配合被驅動強制轉向的情況。
 */
export function pageSizeMm(rotate: boolean): PageSizeMm {
  return rotate
    ? { widthMm: PAPER_HEIGHT_MM, heightMm: PAPER_WIDTH_MM }
    : { widthMm: PAPER_WIDTH_MM, heightMm: PAPER_HEIGHT_MM };
}

/** 產生要動態注入 <style> 的 @page 規則(邊界一律 0)。 */
export function pageRule(rotate: boolean): string {
  const { widthMm, heightMm } = pageSizeMm(rotate);
  return `@page { size: ${widthMm}mm ${heightMm}mm; margin: 0; }`;
}

/** 縮放下限(%)。 */
export const MIN_SCALE_PERCENT = 80;

/** 縮放上限(%)。 */
export const MAX_SCALE_PERCENT = 120;

/** 縮放預設值(%):1:1,不縮放。 */
export const DEFAULT_SCALE_PERCENT = 100;

/**
 * 把任意輸入夾到 80–120% 的整數;空白 / 非數值回預設 100。
 * 注意:空字串與 null 不能直接丟給 Number()(會變成 0 → 被夾成 80%),
 * 使用者把輸入框清空時應該回到 100% 而不是突然縮到最小。
 */
export function clampScalePercent(value: unknown): number {
  if (typeof value !== "number" && typeof value !== "string") {
    return DEFAULT_SCALE_PERCENT;
  }
  if (typeof value === "string" && value.trim() === "") {
    return DEFAULT_SCALE_PERCENT;
  }
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_SCALE_PERCENT;
  return Math.min(MAX_SCALE_PERCENT, Math.max(MIN_SCALE_PERCENT, Math.round(n)));
}

/**
 * 旋轉 90° 時,紙張要補的平移量(mm)。
 *
 * 紙張(.paper)的 **layout box** 一律貼在頁面框左上角(top/left: 0),大小固定
 * 215.9 × 139.7mm;旋轉是純視覺的 transform,不動 layout。這點很重要:
 * layout box 若溢出頁面框的**下緣**,Chrome 會多印一頁 —— 用 top/left: 50%
 * 或 margin: auto 來置中都會踩到(前者把 layout box 往下推、後者在容器比元素窄時
 * 會被 over-constrained 規則解成靠左上)。
 *
 * 紙張中心原本在 (W/2, H/2);轉 90° 後要讓它落在直式頁面框的中心 (H/2, W/2),
 * 故平移 ((H-W)/2, (W-H)/2) = (-38.1mm, +38.1mm)。轉完的外框(139.7 × 215.9)
 * 正好等於直式頁面框 → 置中、貼齊、不裁切,layout box 也仍在頁面框高度內。
 */
export const ROTATE_SHIFT_MM = round3((PAPER_HEIGHT_MM - PAPER_WIDTH_MM) / 2);

/**
 * 紙張(.paper)的 CSS transform:旋轉 + 縮放,皆以紙張中心為原點
 * (transform-origin: center),所以縮放後仍然置中(四邊等距留白)。
 *
 * transform function 由右往左套用到座標上:先 scale、再 rotate、最後 translate。
 * 旋轉關 + 100%(預設)→ "none",紙張完全不套 transform,與 #K 原本行為相同。
 */
export function sheetTransform(rotate: boolean, scalePercent: number): string {
  const scale = clampScalePercent(scalePercent) / 100;
  const parts: string[] = [];
  if (rotate) {
    parts.push(`translate(${ROTATE_SHIFT_MM}mm, ${-ROTATE_SHIFT_MM}mm)`);
    parts.push("rotate(90deg)");
  }
  if (scale !== 1) parts.push(`scale(${round3(scale)})`);
  return parts.length ? parts.join(" ") : "none";
}

/* ------------------------------------------------------------ 微調換算 */

/** 1 吋 = 25.4 mm。 */
const MM_PER_INCH = 25.4;

/** offsetX 的單位:1/60 吋(ESC $)。 */
export const X_UNITS_PER_INCH = 60;

/** offsetY 的單位:1/180 吋(ESC 3)。 */
export const Y_UNITS_PER_INCH = 180;

/** 微調換算後的實體位移(mm)。 */
export interface OffsetMm {
  xMm: number;
  yMm: number;
}

function toMm(value: number, unitsPerInch: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return (value / unitsPerInch) * MM_PER_INCH;
}

/**
 * 把 DoForm 的 X/Y 微調換算成實體位移(mm)。
 * X:1/60 吋 → mm;Y:1/180 吋 → mm。非數值(NaN/Infinity)一律視為 0。
 */
export function offsetToMm(offsetX: number, offsetY: number): OffsetMm {
  return {
    xMm: toMm(offsetX, X_UNITS_PER_INCH),
    yMm: toMm(offsetY, Y_UNITS_PER_INCH),
  };
}

/**
 * 產生 CSS transform 字串,把整張單依微調量平移(單位 mm,取到小數第 3 位)。
 * 用 mm 而非 px,列印時才是真實紙上位移。
 */
export function offsetTransform(offsetX: number, offsetY: number): string {
  const { xMm, yMm } = offsetToMm(offsetX, offsetY);
  return `translate(${round3(xMm)}mm, ${round3(yMm)}mm)`;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/* ------------------------------------------------ 內容落點(#33 讀數) */
//
// 現場實測(EPSON LQ-310):印表機在表單的**上下**各有一段不可列印的硬體邊界
// (實測約上 10mm / 下 3mm)。中一刀一節正好等於頁高 139.7mm,所以 100%(甚至
// 90%)時內容一定會超出可列印範圍 —— 不是上框線不見、就是下框線不見。
//
// 以前只能一直試印猜參數。這組純函式把「內容會落在紙上哪裡」算出來,直接顯示在
// 螢幕上,對位就不必燒紙。
//
// 座標系:一律以**頁面**(@page 宣告的那張紙)左上角為原點,單位 mm。
//   - 縮放以紙張中心為原點 → 內容上緣 = (H − H·s)/2,再加上「有效位移」。
//   - 旋轉 90° 時走紙方向換成長邊 → H = 215.9mm(見 pageSizeMm)。
//
// ⚠️ 讀數必須模擬 **DOM 真正的行為**,不能照 UI 的名目值算 —— 差一點就白燒一張紙。
// 見下方 pageOffsetMm 的推導。

/** 內容在頁面上的落點(mm,自頁面左上角起算)。 */
export interface ContentEdges {
  /** 頁面寬(mm),依旋轉開關。 */
  pageWidthMm: number;
  /** 頁面高(mm),依旋轉開關 —— 即走紙方向的長度。 */
  pageHeightMm: number;
  /** 內容上緣。 */
  topMm: number;
  /** 內容下緣。 */
  bottomMm: number;
  /** 內容高度 = 頁高 × 縮放。 */
  heightMm: number;
  /** 內容左緣。 */
  leftMm: number;
  /** 內容右緣。 */
  rightMm: number;
  /** 內容寬度 = 頁寬 × 縮放。 */
  widthMm: number;
}

/** contentEdgesMm 的輸入。scale 是**百分比**(80–120),與 UI 的縮放輸入框同單位。 */
export interface ContentEdgesInput {
  /** 縮放百分比(80–120;超出範圍會被夾住)。 */
  scale: number;
  /** X 微調(1/60 吋)。 */
  offsetX: number;
  /** Y 微調(1/180 吋)。 */
  offsetY: number;
  /** 旋轉 90°。 */
  rotate: boolean;
}

/** 微調在**頁面**上造成的有效位移(mm)。 */
export interface PageOffsetMm {
  /** 頁面水平位移(+ = 往右)。 */
  dxMm: number;
  /** 頁面垂直位移(+ = 往下)—— 即**走紙方向**。 */
  dyMm: number;
}

/**
 * 把 X/Y 微調換算成**頁面上真正的位移**(mm)。這裡有兩個反直覺的地方,都是
 * 從實際的 CSS 疊法推出來的(見 page.module.css / sheetTransform),不是名目值:
 *
 * 【1】縮放會乘進位移 —— 位移是 s·offset,不是 offset。
 *   DOM 是 .paper(transform: … scale(s))> .shift(transform: translate(x, y))。
 *   CSS transform 會沿著父子鏈相乘:子層的 translate 是在**父層的座標系**裡表達的,
 *   所以會被父層的 scale 一起縮。90% 時打 Y=40(名目 5.64mm),紙上只走 5.08mm。
 *
 * 【2】旋轉 90° 時 X/Y 軸互換(且 Y 還會變號)。
 *   .paper 的 transform 是 translate(-38.1mm, 38.1mm) rotate(90deg) scale(s),
 *   而 CSS 的 rotate(90deg) 在 y 軸朝下的座標系裡矩陣是 [0 -1; 1 0],
 *   也就是把向量 (u, v) 映成 (−v, u)。子層的 translate(x, y) 先被 scale 縮成
 *   s·(x, y),再被這個旋轉映成 **s·(−y, x)**。於是:
 *       頁面垂直(走紙方向)位移 = +s·xMm   ← 旋轉時是 **X** 微調在推走紙方向!
 *       頁面水平位移           = −s·yMm   ← Y 微調變成左右移,而且方向相反。
 *
 * 不要「順手簡化」成 offset 或把軸換回來 —— 那會讓讀數與紙上不一致,
 * 這個功能就白做了(它存在的意義就是取代試印)。
 */
export function pageOffsetMm(
  scale: number,
  offsetX: number,
  offsetY: number,
  rotate: boolean,
): PageOffsetMm {
  const s = clampScalePercent(scale) / 100;
  const { xMm, yMm } = offsetToMm(offsetX, offsetY);
  return rotate
    ? { dxMm: -s * yMm, dyMm: s * xMm }
    : { dxMm: s * xMm, dyMm: s * yMm };
}

/**
 * 走紙方向(頁面垂直)是由哪一個微調在推?
 * 不旋轉 → Y;旋轉 90° → X(見 pageOffsetMm 的推導)。
 * 「自動建議」要解的就是這一軸。
 */
export function feedAxis(rotate: boolean): "x" | "y" {
  return rotate ? "x" : "y";
}

/**
 * 算出目前設定下,內容會落在頁面的哪個範圍(mm,自頁面左上角起算)。
 *
 *   內容高度 = H × s
 *   上緣     = (H − H·s) / 2 + dy     ← 縮放以中心為原點,故上下各留 (H − H·s)/2
 *   下緣     = 上緣 + H × s
 *
 * 水平同理,把 H 換成頁寬 W、dy 換成 dx。
 * dx / dy 是**有效位移**(已含縮放與旋轉的軸互換),見 pageOffsetMm。
 */
export function contentEdgesMm({
  scale,
  offsetX,
  offsetY,
  rotate,
}: ContentEdgesInput): ContentEdges {
  const { widthMm: pageWidthMm, heightMm: pageHeightMm } = pageSizeMm(rotate);
  const s = clampScalePercent(scale) / 100;
  const { dxMm, dyMm } = pageOffsetMm(scale, offsetX, offsetY, rotate);

  const heightMm = pageHeightMm * s;
  const widthMm = pageWidthMm * s;
  const topMm = (pageHeightMm - heightMm) / 2 + dyMm;
  const leftMm = (pageWidthMm - widthMm) / 2 + dxMm;

  return {
    pageWidthMm,
    pageHeightMm,
    topMm: round3(topMm),
    bottomMm: round3(topMm + heightMm),
    heightMm: round3(heightMm),
    leftMm: round3(leftMm),
    rightMm: round3(leftMm + widthMm),
    widthMm: round3(widthMm),
  };
}

/* --------------------------------------- 可列印範圍(印表機硬體邊界) */

/** 印表機在走紙方向上、印不到的上下邊界(mm)。 */
export interface PrintableWindow {
  /** 上邊界:頁面頂端算下來這段印不到。 */
  topMm: number;
  /** 下邊界:頁面底端算上去這段印不到。 */
  bottomMm: number;
}

/** LQ-310 現場實測值:上 10mm / 下 3mm(可在頁面上改)。 */
export const DEFAULT_PRINTABLE_WINDOW: PrintableWindow = {
  topMm: 10,
  bottomMm: 3,
};

/** 邊界輸入的合理上限(mm)—— 再大就不合理了,且會讓可列印高度變成負數。 */
export const MAX_MARGIN_MM = 60;

/** 把邊界輸入夾到 0–60mm;空白 / 非數值回 fallback(不要讓輸入框清空時炸掉)。 */
export function clampMarginMm(value: unknown, fallback: number): number {
  if (typeof value !== "number" && typeof value !== "string") return fallback;
  if (typeof value === "string" && value.trim() === "") return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return round3(Math.min(MAX_MARGIN_MM, Math.max(0, n)));
}

/** 內容 vs 可列印範圍的檢查結果。 */
export interface FitCheck {
  /** 可列印範圍的上緣(= 上邊界)。 */
  printableTopMm: number;
  /** 可列印範圍的下緣(= 頁高 − 下邊界)。 */
  printableBottomMm: number;
  /** 可列印高度。 */
  printableHeightMm: number;
  /** 上緣被裁掉多少 mm(0 = 沒被裁)。 */
  topClipMm: number;
  /** 下緣被裁掉多少 mm(0 = 沒被裁)。 */
  bottomClipMm: number;
  /** 兩邊都沒被裁。 */
  ok: boolean;
}

/** 浮點容差:12.7000000001 > 12.7 這種比較不該報警。 */
const EPSILON_MM = 0.005;

/**
 * 內容有沒有落在可列印範圍裡?
 * 上緣 < 上邊界 → 上面被裁;下緣 > (頁高 − 下邊界) → 下面被裁。
 */
export function checkPrintableFit(
  edges: ContentEdges,
  window: PrintableWindow,
): FitCheck {
  const printableTopMm = round3(window.topMm);
  const printableBottomMm = round3(edges.pageHeightMm - window.bottomMm);
  const topClip = printableTopMm - edges.topMm;
  const bottomClip = edges.bottomMm - printableBottomMm;
  const topClipMm = topClip > EPSILON_MM ? round3(topClip) : 0;
  const bottomClipMm = bottomClip > EPSILON_MM ? round3(bottomClip) : 0;
  return {
    printableTopMm,
    printableBottomMm,
    printableHeightMm: round3(printableBottomMm - printableTopMm),
    topClipMm,
    bottomClipMm,
    ok: topClipMm === 0 && bottomClipMm === 0,
  };
}

/* ------------------------------------------------------------ 自動建議 */

/** 建議設定時,可列印範圍上下各要保留的餘裕(mm)。 */
export const SUGGEST_SLACK_MM = 4;

/** 自動建議的結果。 */
export interface FitSuggestion {
  /** 建議縮放(%,整數)。 */
  scalePercent: number;
  /** 建議 X 微調(1/60 吋,整數)。 */
  offsetX: number;
  /** 建議 Y 微調(1/180 吋,整數)。 */
  offsetY: number;
  /** 這次是調哪一軸把內容推進可列印範圍的(旋轉時是 X,見 feedAxis)。 */
  axis: "x" | "y";
  /** 套用之後的落點(已用四捨五入後的整數微調重算 —— 螢幕顯示什麼,套用就是什麼)。 */
  edges: ContentEdges;
  /** 套用之後的檢查結果。 */
  fit: FitCheck;
  /**
   * 連縮到下限(80%)都塞不進可列印範圍 → false。
   * 這種情況通常是邊界輸錯,或這台印表機真的印不了整張中一刀。
   */
  fits: boolean;
}

/** 目前的微調值(自動建議只動走紙方向那一軸,另一軸原封不動帶回)。 */
export interface CurrentOffsets {
  offsetX?: number;
  offsetY?: number;
}

/**
 * 給定可列印範圍,算一組「塞得進去」的縮放 + 走紙方向微調:
 *   1) 取 ≤ 100% 的最大縮放,使 內容高度 ≤ 可列印高度 − 4mm 餘裕(整數 %,無條件捨去)。
 *   2) 把內容置中於可列印範圍 → 反解走紙方向的微調,再四捨五入成整數步進。
 *
 * 反解時要**除以 s**:上緣 = (H − H·s)/2 + s·offsetMm(位移會被縮放乘進去,
 * 見 pageOffsetMm),所以 offsetMm = (目標上緣 − 基準上緣) / s。忘了除,建議值
 * 會系統性地不夠(90% 時差約 10%),那就又要試印了。
 *
 * 只動走紙方向那一軸(不旋轉 → Y;旋轉 90° → X):另一軸是左右位置,沒有硬體
 * 邊界問題,亂動反而會把使用者已經對好的左右位移弄掉。
 */
export function suggestFit(
  window: PrintableWindow,
  rotate: boolean,
  current: CurrentOffsets = {},
): FitSuggestion {
  const { heightMm: pageHeightMm } = pageSizeMm(rotate);
  const printableTopMm = window.topMm;
  const printableBottomMm = pageHeightMm - window.bottomMm;
  const printableHeightMm = printableBottomMm - printableTopMm;

  // 1) 最大可用高度 → 最大縮放(整數 %,不超過 100%,不低於 80%)。
  const usableMm = printableHeightMm - SUGGEST_SLACK_MM;
  const rawPercent = Math.floor((usableMm / pageHeightMm) * 100);
  const scalePercent = clampScalePercent(Math.min(DEFAULT_SCALE_PERCENT, rawPercent));

  // 2) 內容置中於可列印範圍 → 反解走紙方向的微調(記得除以 s)。
  const s = scalePercent / 100;
  const contentHeightMm = pageHeightMm * s;
  const baseTopMm = (pageHeightMm - contentHeightMm) / 2;
  const targetTopMm = printableTopMm + (printableHeightMm - contentHeightMm) / 2;
  const neededMm = (targetTopMm - baseTopMm) / s;

  // 旋轉時走紙方向是 X(1/60 吋);不旋轉時是 Y(1/180 吋)。
  const axis = feedAxis(rotate);
  const units = axis === "x" ? X_UNITS_PER_INCH : Y_UNITS_PER_INCH;
  const steps = Math.round((neededMm / MM_PER_INCH) * units);

  const offsetX = axis === "x" ? steps : (current.offsetX ?? 0);
  const offsetY = axis === "y" ? steps : (current.offsetY ?? 0);

  const edges = contentEdgesMm({ scale: scalePercent, offsetX, offsetY, rotate });
  const fit = checkPrintableFit(edges, window);
  return { scalePercent, offsetX, offsetY, axis, edges, fit, fits: fit.ok };
}

/* -------------------------------------------------- localStorage 交握 */

/** 開單頁把目前 DoForm 丟進 localStorage,新分頁再讀出來(支援尚未存檔的單)。 */
export const PRINT_PREVIEW_KEY = "do-print-preview";

/** 存進 localStorage 的內容。 */
export interface PrintPreviewPayload {
  form: DoForm;
  /** 寫入時間(ISO 字串),僅供除錯 / 顯示。 */
  savedAt: string;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

/** 最小驗證:確認讀回來的東西長得像 DoForm(舊資料/手動竄改都可能壞掉)。 */
export function isDoForm(value: unknown): value is DoForm {
  if (!isRecord(value)) return false;
  const { template, header, lines, offsetX, offsetY } = value;
  if (template !== "metal" && template !== "standard") return false;
  if (!isRecord(header)) return false;
  if (!Array.isArray(lines)) return false;
  if (typeof offsetX !== "number" || typeof offsetY !== "number") return false;
  return true;
}

/** 解析 localStorage 內容;格式不對回 null(呼叫端顯示友善提示)。 */
export function parsePrintPreviewPayload(raw: string | null): DoForm | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;
  const form = parsed.form;
  return isDoForm(form) ? form : null;
}

/** 開單頁:寫入目前表單,供新分頁讀取。 */
export function savePrintPreviewForm(form: DoForm): void {
  const payload: PrintPreviewPayload = {
    form,
    savedAt: new Date().toISOString(),
  };
  window.localStorage.setItem(PRINT_PREVIEW_KEY, JSON.stringify(payload));
}

/** 新分頁:讀回表單;沒有 / 壞掉回 null。 */
export function loadPrintPreviewForm(): DoForm | null {
  try {
    return parsePrintPreviewPayload(window.localStorage.getItem(PRINT_PREVIEW_KEY));
  } catch {
    // localStorage 被停用(隱私模式等)。
    return null;
  }
}

/* ----------------------------------------- 列印設定(旋轉/縮放)記憶 */

/** 旋轉 / 縮放設定的 localStorage key(與表單本身分開存,換單不會被洗掉)。 */
export const PRINT_SETTINGS_KEY = "do-print-settings";

/** 使用者在本頁選的列印設定。 */
export interface PrintSettings {
  /** 旋轉 90°(補償驅動強制轉向)。 */
  rotate: boolean;
  /** 縮放百分比(80–120)。 */
  scalePercent: number;
  /** 印表機印不到的上邊界(mm)—— 每台機器不同,故可改。 */
  printableTopMm: number;
  /** 印表機印不到的下邊界(mm)。 */
  printableBottomMm: number;
}

/**
 * 預設:不旋轉、不縮放 —— 等同 #K 上線時的行為;
 * 可列印邊界則帶 LQ-310 的現場實測值(上 10 / 下 3mm)。
 */
export const DEFAULT_PRINT_SETTINGS: PrintSettings = {
  rotate: false,
  scalePercent: DEFAULT_SCALE_PERCENT,
  printableTopMm: DEFAULT_PRINTABLE_WINDOW.topMm,
  printableBottomMm: DEFAULT_PRINTABLE_WINDOW.bottomMm,
};

/** 解析 localStorage 內容;缺欄位 / 壞掉的部分回退到預設值。 */
export function parsePrintSettings(raw: string | null): PrintSettings {
  if (!raw) return { ...DEFAULT_PRINT_SETTINGS };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ...DEFAULT_PRINT_SETTINGS };
  }
  if (!isRecord(parsed)) return { ...DEFAULT_PRINT_SETTINGS };
  return {
    rotate: parsed.rotate === true,
    scalePercent: clampScalePercent(parsed.scalePercent),
    // 舊版存檔沒有這兩個欄位 → 回退到實測預設值(不會把舊使用者洗掉)。
    printableTopMm: clampMarginMm(
      parsed.printableTopMm,
      DEFAULT_PRINT_SETTINGS.printableTopMm,
    ),
    printableBottomMm: clampMarginMm(
      parsed.printableBottomMm,
      DEFAULT_PRINT_SETTINGS.printableBottomMm,
    ),
  };
}

/** 讀回上次的列印設定(localStorage 被停用時回預設)。 */
export function loadPrintSettings(): PrintSettings {
  try {
    return parsePrintSettings(window.localStorage.getItem(PRINT_SETTINGS_KEY));
  } catch {
    return { ...DEFAULT_PRINT_SETTINGS };
  }
}

/** 記住這次的列印設定,下次開本頁不必重設。 */
export function savePrintSettings(settings: PrintSettings): void {
  try {
    window.localStorage.setItem(PRINT_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // localStorage 被停用:設定就不記憶,不影響列印。
  }
}
