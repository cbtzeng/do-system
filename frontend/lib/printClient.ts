// Print agent HTTP client — 與 http://localhost:9100 的本機列印代理溝通。
import { toPng } from "html-to-image";
import {
  AGENT_BASE_URL,
  type PrintImageRequest,
  type PrintRequest,
  type PrintResponse,
  type PrintersResponse,
  type StandardDoForm,
} from "./contract";
import { buildEscp, toBase64 } from "./escp";

/**
 * (standard 版)建立 ESC/P2 文字 bytes、base64 編碼,並 POST 到 /print。
 * metal 版請改用 printImage 走圖形列印。
 */
export async function printForm(
  printer: string,
  form: StandardDoForm,
): Promise<PrintResponse> {
  const data = toBase64(buildEscp(form));
  const body: PrintRequest = { printer, data };

  const res = await fetch(`${AGENT_BASE_URL}/print`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    return { ok: false, error: `HTTP ${res.status} ${res.statusText}` };
  }
  return (await res.json()) as PrintResponse;
}

/** printImage 選項。 */
export interface PrintImageOptions {
  /** html-to-image 取樣倍率(越大越清晰),預設 3。 */
  pixelRatio?: number;
  /** 傳給 agent 的目標列印寬度(點)。 */
  widthDots?: number;
}

/**
 * WYSIWYG 圖形列印:把 DOM 節點 render 成 PNG(html-to-image),
 * base64 → POST /print-image。agent 端再轉 ESC/P 圖形送印。
 */
export async function printImage(
  printer: string,
  node: HTMLElement,
  opts: PrintImageOptions = {},
): Promise<PrintResponse> {
  const { pixelRatio = 3, widthDots } = opts;

  let dataUrl: string;
  try {
    dataUrl = await toPng(node, {
      pixelRatio,
      backgroundColor: "#ffffff",
      cacheBust: true,
    });
  } catch (err: unknown) {
    return {
      ok: false,
      error: `擷取預覽影像失敗: ${
        err instanceof Error ? err.message : String(err)
      }`,
    };
  }

  // 去掉 "data:image/png;base64," 前綴,只送純 base64。
  const image = dataUrl.replace(/^data:image\/\w+;base64,/, "");
  const body: PrintImageRequest = { printer, image };
  if (widthDots != null) body.width_dots = widthDots;

  const res = await fetch(`${AGENT_BASE_URL}/print-image`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    return { ok: false, error: `HTTP ${res.status} ${res.statusText}` };
  }
  return (await res.json()) as PrintResponse;
}

/**
 * GET /printers,回傳印表機名稱陣列。
 */
export async function getPrinters(): Promise<string[]> {
  const res = await fetch(`${AGENT_BASE_URL}/printers`);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }
  const json = (await res.json()) as PrintersResponse;
  return json.printers ?? [];
}
