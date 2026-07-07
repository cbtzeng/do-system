// 登入頁(Issue #C)。純表單 POST 到 /api/login,不需 JS 即可運作。

import styles from "./login.module.css";

export const metadata = {
  title: "登入 · 送貨單列印工具",
};

type SearchParams = Promise<{ error?: string; next?: string }>;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { error, next } = await searchParams;
  // 把 next 併進 action query,登入成功後跳回原目的地。
  const action = next
    ? `/api/login?next=${encodeURIComponent(next)}`
    : "/api/login";

  return (
    <main className={styles.wrap}>
      <form className={styles.card} method="post" action={action}>
        <div className={styles.brand}>
          <span className={styles.badge} aria-hidden />
          <span className={styles.brandName}>送貨單列印工具</span>
        </div>
        <p className={styles.hint}>請輸入共用密碼以進入系統</p>

        <label className={styles.label} htmlFor="password">
          共用密碼
        </label>
        <input
          id="password"
          name="password"
          type="password"
          className={styles.input}
          autoComplete="current-password"
          autoFocus
          required
        />

        {error ? (
          <p className={styles.error} role="alert">
            密碼錯誤,請再試一次。
          </p>
        ) : null}

        <button className={styles.button} type="submit">
          進入
        </button>
      </form>
    </main>
  );
}
