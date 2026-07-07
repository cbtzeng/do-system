// 登入路由(Issue #C)。比對共用密碼,成功則設定 HttpOnly 授權 cookie。
//
// 接受 form POST(application/x-www-form-urlencoded)與 JSON,方便無 JS 的 <form> 直接送。

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  AUTH_COOKIE,
  isGateEnabled,
  makeAuthToken,
  getSitePassword,
  verifyPassword,
} from "../../../lib/auth";

// 30 天(秒)。內部工具,給個合理的長效期。
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

function isSafeNext(next: string | null): next is string {
  // 只允許站內相對路徑,擋掉 open redirect。
  return !!next && next.startsWith("/") && !next.startsWith("//");
}

async function readPassword(request: NextRequest): Promise<string> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = await request.json().catch(() => ({}));
    return typeof body?.password === "string" ? body.password : "";
  }
  const form = await request.formData().catch(() => null);
  const value = form?.get("password");
  return typeof value === "string" ? value : "";
}

export async function POST(request: NextRequest) {
  // 閘門未啟用(未設 SITE_PASSWORD):直接視為已授權,設一個以「空 key」不會通過驗證的 token 也無意義,
  // 因此僅導回首頁 / next。正式環境務必設定 SITE_PASSWORD。
  if (!isGateEnabled()) {
    const nextParam = request.nextUrl.searchParams.get("next");
    const dest = isSafeNext(nextParam) ? nextParam : "/";
    return NextResponse.redirect(new URL(dest, request.url), { status: 303 });
  }

  const password = await readPassword(request);

  if (!verifyPassword(password)) {
    // 密碼錯誤 → 導回 /login 並標記錯誤。
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("error", "1");
    const nextParam = request.nextUrl.searchParams.get("next");
    if (isSafeNext(nextParam)) loginUrl.searchParams.set("next", nextParam);
    return NextResponse.redirect(loginUrl, { status: 303 });
  }

  // 密碼正確 → 設定授權 cookie 並導向目的地。
  const nextParam = request.nextUrl.searchParams.get("next");
  const dest = isSafeNext(nextParam) ? nextParam : "/";
  const response = NextResponse.redirect(new URL(dest, request.url), {
    status: 303,
  });
  response.cookies.set({
    name: AUTH_COOKIE,
    // token = HMAC(固定訊息, key=SITE_PASSWORD);不含原始密碼。
    value: makeAuthToken(getSitePassword() as string),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });
  return response;
}
