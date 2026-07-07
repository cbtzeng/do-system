// 共用密碼閘門(Issue #C)。
//
// Next.js 16 起,舊的 `middleware.ts` 已更名為 `proxy.ts`(功能相同,預設 Node.js runtime)。
// 這道閘門保護所有頁面:沒有有效 `site_auth` cookie 就導向 /login。
//
// 放行條件:
//   - /login 頁面本身與 /api/login 路由(否則無法登入)。
//   - 靜態資源(_next、favicon 等)已由 matcher 排除。
//   - 若 SITE_PASSWORD 未設定(開發/建置)→ 整站放行,避免擋住 `npm run build`。
//     正式環境務必設定 SITE_PASSWORD(見 docs/deploy.md)。

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { AUTH_COOKIE, isGateEnabled, verifyAuthToken } from "./lib/auth";

// 把目前路徑轉成 request header,讓 layout(server component)能判斷是否為 /login
// 而決定要不要顯示頂部導覽列。
function withPathname(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set("x-pathname", request.nextUrl.pathname);
  return NextResponse.next({ request: { headers } });
}

export function proxy(request: NextRequest) {
  // 密碼未設定 → 不啟用閘門(dev/build 放行),但仍轉發 pathname 供 layout 使用。
  if (!isGateEnabled()) {
    return withPathname(request);
  }

  const { pathname } = request.nextUrl;

  // /login 與登入 API 永遠放行,否則無法通過閘門。
  if (pathname === "/login" || pathname.startsWith("/api/login")) {
    return withPathname(request);
  }

  const token = request.cookies.get(AUTH_COOKIE)?.value;
  if (verifyAuthToken(token)) {
    return withPathname(request);
  }

  // 未授權 → 導向 /login,並帶上原目的地以便登入後跳回。
  const loginUrl = new URL("/login", request.url);
  const next = pathname + request.nextUrl.search;
  if (next && next !== "/") {
    loginUrl.searchParams.set("next", next);
  }
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // 比對所有路徑,但排除 Next 內部靜態資源與常見 metadata 檔。
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};
