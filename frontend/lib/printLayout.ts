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
}

/** 預設:不旋轉、不縮放 —— 等同 #K 上線時的行為。 */
export const DEFAULT_PRINT_SETTINGS: PrintSettings = {
  rotate: false,
  scalePercent: DEFAULT_SCALE_PERCENT,
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
