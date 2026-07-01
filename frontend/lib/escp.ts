// ESC/P2 產生器 (LQ-310, EPSON 24-pin)
//
// 位元組佈局 (byte layout)
// -----------------------------------------------------------------------------
// 1. ESC @            0x1B 0x40          初始化印表機 (reset to power-on defaults)
// 2. ESC C n          0x1B 0x43 n        設定頁長為 n 行。連續報表紙(中一刀)
//                                        頁高 5.5" = 6 LPI × 5.5 = 33 行。
//                                        緊接在 ESC @ 後 (此時仍是預設 1/6" 行距)
//                                        下達,頁長即鎖定為 5.5"。少了這行,ESC @
//                                        會把頁長還原成印表機預設 (常為 11"/12"),
//                                        FF 就會過送、吃掉後面的空白三聯單。
// 3. ESC 3 n          0x1B 0x33 n        設定行距為 n/180 吋。
//                                        我們以 form.offsetY 當作每行起始前的
//                                        垂直微調行距 (預設值即可上下移動整張單)。
//                                        頁長已由 ESC C 鎖定,之後改行距不影響。
// 對每一列 (line):
//   4. ESC $ nL nH    0x1B 0x24 nL nH    絕對水平位置,單位 1/60 吋,
//                                        位置 = nL + nH*256。由 form.offsetX 驅動。
//   5. <name + subtotal 的 ASCII bytes>  例: "Widget    1200"
//   6. LF             0x0A               換行 (line feed)
// 結尾:
//   7. FF             0x0C               換頁 (form feed),送出整張單。
// -----------------------------------------------------------------------------
// 第一版僅支援 ASCII / 數字 (中文 code page 之後再處理)。

import type { DoForm } from "./contract";

const ESC = 0x1b;

/** 連續報表紙(中一刀)頁長:5.5" @ 6 LPI = 33 行。ESC C 用。 */
const PAGE_LENGTH_LINES = 33;

/** 將 ASCII 字串轉為 byte 陣列 (非 ASCII 字元以 '?' 取代)。 */
function asciiBytes(s: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    out.push(code <= 0x7f ? code : 0x3f /* '?' */);
  }
  return out;
}

/** 由 DoLine 組出 "name + subtotal" 的可列印字串。 */
function formatLine(name: string, qty: number, price: number): string {
  const subtotal = qty * price;
  // name 左對齊補滿 20 欄,subtotal 接在後面。純 ASCII 排版。
  const namePart = name.length >= 20 ? name.slice(0, 20) : name.padEnd(20, " ");
  return `${namePart}${subtotal}`;
}

/**
 * 由表單建立 ESC/P2 位元組。
 * @see 檔頭的 byte layout 註解。
 */
export function buildEscp(form: DoForm): Uint8Array {
  const bytes: number[] = [];

  // 1. ESC @ — 初始化
  bytes.push(ESC, 0x40);

  // 2. ESC C n — 頁長 33 行 (5.5")。趁 ESC @ 後仍是 1/6" 行距時鎖定,
  //    讓 FF 只跳一張連續三聯單,不會過送。
  bytes.push(ESC, 0x43, PAGE_LENGTH_LINES);

  // 3. ESC 3 n — 行距 n/180 吋,以 offsetY 驅動垂直位置 (clamp 0..255)
  const n = Math.max(0, Math.min(255, Math.round(form.offsetY)));
  bytes.push(ESC, 0x33, n);

  // 水平絕對位置 (1/60 吋),以 offsetX 驅動。範圍 0..65535。
  const x = Math.max(0, Math.min(65535, Math.round(form.offsetX)));
  const nL = x & 0xff;
  const nH = (x >> 8) & 0xff;

  for (const line of form.lines) {
    // 4. ESC $ nL nH — 絕對水平位置
    bytes.push(ESC, 0x24, nL, nH);
    // 5. 列內容
    bytes.push(...asciiBytes(formatLine(line.name, line.qty, line.price)));
    // 6. LF
    bytes.push(0x0a);
  }

  // 7. FF — 換頁
  bytes.push(0x0c);

  return Uint8Array.from(bytes);
}

/**
 * 將位元組轉為 base64。瀏覽器使用 btoa,Node 退回 Buffer。
 */
export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  if (typeof btoa === "function") {
    return btoa(binary);
  }
  // Node 環境的退路
  return Buffer.from(bytes).toString("base64");
}
