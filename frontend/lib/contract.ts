// 介面契約 (shared interface contract) — 前端、ESC/P 產生器、print agent 共用。
// 支援兩種可切換版型:
//   - metal   峻晟金屬【出貨單】(預設,無金額)
//   - standard 公版 K 款三聯出貨單(含金額)

/** 版型 */
export type Template = "metal" | "standard";

/** 出貨單抬頭(兩種版型共用的欄位)。 */
export interface DoHeader {
  customerName: string; // 客戶名稱
  address: string; // 住址
  phone: string; // 電話
  orderNo: string; // 貨單號碼
  date: string; // 民國年日期(自由文字,例:115 年 6 月 22 日)
  remark: string; // 備註
  carrier: string; // 承運車行
  vehicleNo: string; // 車號
  // 以下僅 standard 版使用
  taxId: string; // 統一編號
  invoiceNo: string; // 發票號碼
}

/** metal 版品項單列(峻晟金屬:出貨單不印金額)。 */
export interface MetalLine {
  name: string; // 品名
  material: string; // 材質
  size: string; // 尺寸
  sheets: number; // 片數
  weight: number; // 重量
  /**
   * 單價(內部用)。存進 DB(lines jsonb),供【對帳單】計算金額 = 重量 × 單價,
   * 但**不列印在出貨單**上。選填;舊資料可能沒有此欄。
   */
  price?: number;
}

/** standard 版品項單列(公版 K:含金額)。 */
export interface StandardLine {
  name: string; // 品名 / 規格
  unit: string; // 單位
  qty: number; // 數量
  price: number; // 單價
}

/** metal 版整份表單(無金額 / 無合計)。 */
export interface MetalDoForm {
  template: "metal";
  header: DoHeader;
  lines: MetalLine[];
  /** 水平微調,單位 1/60 吋 (ESC $) */
  offsetX: number;
  /** 垂直微調,單位 1/180 吋 (ESC 3) */
  offsetY: number;
}

/** standard 版整份表單(含小計 / 稅額 / 總計)。 */
export interface StandardDoForm {
  template: "standard";
  header: DoHeader;
  lines: StandardLine[];
  taxAmount: number; // 稅額(可手填;總計 = 金額合計 + 稅額)
  /** 水平微調,單位 1/60 吋 (ESC $) */
  offsetX: number;
  /** 垂直微調,單位 1/180 吋 (ESC 3) */
  offsetY: number;
}

/** 整份出貨單表單(以 template 區分)。 */
export type DoForm = MetalDoForm | StandardDoForm;

/** POST http://localhost:9100/print 的 request body(文字 ESC/P 路徑)。 */
export interface PrintRequest {
  printer: string;
  /** ESC/P2 bytes 的 base64 */
  data: string;
}

/** POST http://localhost:9100/print-image 的 request body(圖形列印路徑)。 */
export interface PrintImageRequest {
  printer: string;
  /** PNG 的 base64(可含或不含 data: 前綴) */
  image: string;
  /** 目標列印寬度(點),預設 1400 */
  width_dots?: number;
}

/** /print 與 /print-image 的回應 */
export interface PrintResponse {
  ok: boolean;
  job_id?: string;
  error?: string;
}

/** GET http://localhost:9100/printers 的回應 */
export interface PrintersResponse {
  printers: string[];
}

/** Print agent 的位址 */
export const AGENT_BASE_URL = "http://localhost:9100";
