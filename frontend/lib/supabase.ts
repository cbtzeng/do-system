// Supabase browser client (前端直連 Supabase, RLS)。
//
// 讀取 NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY。
// 這兩個是 public 值(anon key),站台真正的保護是共用密碼閘門(Issue #C)。
//
// 為了讓 `npm run build` 在沒有設定 env 時也能通過,client 採「延遲初始化」:
// - 若 env 缺失,建立時不會丟例外;只有實際呼叫查詢時才會報清楚的錯。

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** env 是否已設定齊全。UI 可用來提示「尚未設定 Supabase」。 */
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

let client: SupabaseClient | null = null;

/**
 * 取得(或延遲建立)Supabase 單例。
 * 未設定 env 時呼叫會丟出清楚的錯,而不是在 build/import 階段就崩潰。
 */
export function getSupabase(): SupabaseClient {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Supabase env 未設定:請在 .env.local(本機)或 Vercel 專案設定裡填入 " +
        "NEXT_PUBLIC_SUPABASE_URL 與 NEXT_PUBLIC_SUPABASE_ANON_KEY。參見 supabase/README.md。",
    );
  }
  if (!client) {
    client = createClient(supabaseUrl, supabaseAnonKey);
  }
  return client;
}

/**
 * 便利單例。透過 Proxy 轉發到 getSupabase(),
 * 使 `import { supabase }` 可直接用,但仍保留延遲初始化(缺 env 時不會在載入時崩潰)。
 */
export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    const real = getSupabase();
    const value = Reflect.get(real, prop, receiver);
    return typeof value === "function" ? value.bind(real) : value;
  },
});
