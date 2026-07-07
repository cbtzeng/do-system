// 頂部導覽列(Issue #C)。app 名稱 + 導覽連結 + 登出。
//
// 連結指向其他 issue 建置的頁面(/history、/items),未完成前會 404,屬預期。
// 登出以 <form> POST 到 /api/logout 清 cookie(不需 client JS)。

import Link from "next/link";
import styles from "./AppNav.module.css";

export default function AppNav() {
  return (
    <header className={styles.bar}>
      <div className={styles.inner}>
        <Link href="/" className={styles.brand}>
          <span className={styles.badge} aria-hidden />
          <span className={styles.brandName}>送貨單列印工具</span>
        </Link>

        <nav className={styles.nav} aria-label="主導覽">
          <Link href="/" className={styles.link}>
            開單
          </Link>
          <Link href="/history" className={styles.link}>
            歷史清單
          </Link>
          <Link href="/items" className={styles.link}>
            品項主檔
          </Link>
          <Link href="/statement" className={styles.link}>
            對帳單
          </Link>
          <Link href="/export" className={styles.link}>
            匯出
          </Link>
        </nav>

        <form className={styles.logoutForm} method="post" action="/api/logout">
          <button type="submit" className={styles.logout}>
            登出
          </button>
        </form>
      </div>
    </header>
  );
}
