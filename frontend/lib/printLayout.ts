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
