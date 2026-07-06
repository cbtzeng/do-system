// 介面契約 (shared interface contract) — 前端、ESC/P 產生器、print agent 共用。
// 資料模型以「公版 K 款 三聯出貨單」為標準 (見 docs/ 範例圖)。

/** 出貨單抬頭(客戶與單據資訊) */
export interface DoHeader {
  customerName: string; // 客戶名稱
  deliveryAddress: string; // 送貨地址
  phone: string; // 聯絡電話
  taxId: string; // 統一編號
  invoiceNo: string; // 發票號碼
  orderNo: string; // NO. 單號
  date: string; // 年 / 月 / 日(自由文字,例:2026 / 07 / 01)
  remark: string; // 備註
}

/** 品項單列 */
export interface DoLine {
  name: string; // 品名 / 規格
  unit: string; // 單位
  qty: number; // 數量
  price: number; // 單價
}

/** 整份出貨單表單 */
export interface DoForm {
  header: DoHeader;
  lines: DoLine[];
  taxAmount: number; // 稅額(可手填;總計 = 金額合計 + 稅額)
  /** 水平微調,單位 1/60 吋 (ESC $) */
  offsetX: number;
  /** 垂直微調,單位 1/180 吋 (ESC 3) */
  offsetY: number;
}

/** POST http://localhost:9100/print 的 request body */
export interface PrintRequest {
  printer: string;
  /** ESC/P2 bytes 的 base64 */
  data: string;
}

/** /print 的回應 */
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
