// Print agent HTTP client — 與 http://localhost:9100 的本機列印代理溝通。
import {
  AGENT_BASE_URL,
  type DoForm,
  type PrintRequest,
  type PrintResponse,
  type PrintersResponse,
} from "./contract";
import { buildEscp, toBase64 } from "./escp";

/**
 * 建立 ESC/P2 bytes、base64 編碼,並 POST 到 /print。
 */
export async function printForm(
  printer: string,
  form: DoForm,
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
