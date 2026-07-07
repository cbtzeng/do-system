// 共用密碼閘門(Issue #C)。
//
// 設計目標:單一公司內部工具,一組共用密碼,無帳號。輕量但合理安全:
//   - 不把原始密碼放進 cookie。cookie 內容 = HMAC-SHA256(固定訊息, key=SITE_PASSWORD)。
//   - 登入時以「常數時間比較」比對送來的密碼與 SITE_PASSWORD。
//   - 驗證時重算同一個 HMAC,與 cookie 值做常數時間比較 → 只有知道密碼的人能產出有效 cookie。
//
// 這支模組同時被 proxy(閘門)與 app/api/login 路由使用。
// Next 16 的 proxy 預設跑在 Node.js runtime,因此可以直接用 node:crypto。

import { createHmac, timingSafeEqual } from "node:crypto";

/** 存放授權憑證的 cookie 名稱。 */
export const AUTH_COOKIE = "site_auth";

/** cookie 值 = HMAC 的固定訊息;不含任何密碼資訊。 */
const AUTH_MESSAGE = "do-system:site-auth:v1";

/** 讀取設定的共用密碼(未設定時回傳 undefined)。 */
export function getSitePassword(): string | undefined {
  const pw = process.env.SITE_PASSWORD;
  return pw && pw.length > 0 ? pw : undefined;
}

/**
 * 站台是否已啟用密碼保護。
 * 未設定 SITE_PASSWORD 時回傳 false → 開發/建置階段放行(見 docs/deploy.md,正式環境務必設定)。
 */
export function isGateEnabled(): boolean {
  return getSitePassword() !== undefined;
}

/** 以 SITE_PASSWORD 為 key,對固定訊息做 HMAC,產出要放進 cookie 的授權 token。 */
export function makeAuthToken(password: string): string {
  return createHmac("sha256", password).update(AUTH_MESSAGE).digest("hex");
}

/** 長度不定也安全的常數時間字串比較。 */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  // 先比長度以避免 timingSafeEqual 對長度不同丟例外;
  // 為了不因長度差異洩漏資訊,仍對等長 buffer 做比較。
  if (ab.length !== bb.length) {
    // 與自身比較,結果恆為 false,但時間與正常路徑相近。
    timingSafeEqual(ab, ab);
    return false;
  }
  return timingSafeEqual(ab, bb);
}

/** 比對使用者輸入的密碼是否正確(常數時間)。 */
export function verifyPassword(input: string): boolean {
  const expected = getSitePassword();
  if (expected === undefined) return false;
  return safeEqual(input, expected);
}

/** 驗證 cookie 內的授權 token 是否有效。 */
export function verifyAuthToken(token: string | undefined): boolean {
  const password = getSitePassword();
  if (password === undefined) return false;
  if (!token) return false;
  return safeEqual(token, makeAuthToken(password));
}
