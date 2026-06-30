// 介面契約 (shared interface contract) — 3 個 worktree 共用,請勿改動簽名,只能在各自 issue 中實作。
// Print agent HTTP API 與 ESC/P 產生器的型別定義。Issue #1/#2/#3 都依賴此檔。

/** 送貨單單列 */
export interface DoLine {
  name: string;
  size: string;
  qty: number;
  price: number;
}

/** 送貨單表單(含位置微調) */
export interface DoForm {
  lines: DoLine[];
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
