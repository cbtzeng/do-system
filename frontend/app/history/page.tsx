"use client";

// 歷史清單 + 查詢(Issue #E)。
//
// 清單 delivery_orders(單號 / 客戶 / 日期 / 版型 / 列印次數 / 最後列印時間),
// 提供 單號 / 客戶 / 日期區間 篩選,每列可「開啟」回編輯器(/?id=<id>)重開編修重印。
//
// 前端直連 Supabase;未設定 env 時只顯示友善提示(build 不需 env)。

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { isSupabaseConfigured } from "../../lib/supabase";
import { listOrders, type OrderFilters } from "../../lib/orders";
import type { DeliveryOrderRow } from "../../lib/db-types";
import styles from "./page.module.css";

/** 版型顯示名。 */
function templateLabel(t: string): string {
  if (t === "metal") return "峻晟金屬";
  if (t === "standard") return "標準(含金額)";
  return t;
}

/** ISO 日期 → 民國年顯示(清單用短格式 NNN/M/D)。 */
function rocShort(iso: string | null): string {
  if (!iso) return "—";
  const m = iso.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!m) return iso;
  return `${Number(m[1]) - 1911}/${Number(m[2])}/${Number(m[3])}`;
}

/** timestamptz → 本地日期時間(最後列印)。 */
function formatDateTime(ts: string | null): string {
  if (!ts) return "—";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleString("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function HistoryPage() {
  const configured = isSupabaseConfigured;

  const [orders, setOrders] = useState<DeliveryOrderRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 篩選欄位
  const [orderNo, setOrderNo] = useState("");
  const [customer, setCustomer] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const load = useCallback(
    async (filters: OrderFilters) => {
      if (!configured) return;
      setLoading(true);
      setError(null);
      try {
        const data = await listOrders(filters);
        setOrders(data);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    },
    [configured],
  );

  useEffect(() => {
    void load({});
  }, [load]);

  const onSearch = (e: React.FormEvent) => {
    e.preventDefault();
    void load({ orderNo, customer, from, to });
  };

  const onReset = () => {
    setOrderNo("");
    setCustomer("");
    setFrom("");
    setTo("");
    void load({});
  };

  return (
    <div className={styles.page}>
      <h1 className={styles.heading}>歷史清單</h1>
      <p className={styles.subhead}>
        依單號 / 客戶 / 日期區間查詢;點「開啟」載回編輯器可改後重印
      </p>

      {!configured && (
        <div className={styles.notice}>
          尚未設定 Supabase(NEXT_PUBLIC_SUPABASE_URL /
          NEXT_PUBLIC_SUPABASE_ANON_KEY)。設定後即可查詢歷史送貨單。
        </div>
      )}

      {error && <div className={`${styles.notice} ${styles.error}`}>{error}</div>}

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>查詢</h2>
        <form className={styles.filters} onSubmit={onSearch}>
          <div className={styles.field}>
            <label>單號</label>
            <input
              className={styles.input}
              value={orderNo}
              disabled={!configured}
              onChange={(e) => setOrderNo(e.target.value)}
              placeholder="貨單號碼"
            />
          </div>
          <div className={styles.field}>
            <label>客戶</label>
            <input
              className={styles.input}
              value={customer}
              disabled={!configured}
              onChange={(e) => setCustomer(e.target.value)}
              placeholder="客戶名稱"
            />
          </div>
          <div className={styles.field}>
            <label>日期(起)</label>
            <input
              className={styles.input}
              type="date"
              value={from}
              disabled={!configured}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div className={styles.field}>
            <label>日期(迄)</label>
            <input
              className={styles.input}
              type="date"
              value={to}
              disabled={!configured}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
          <button className={styles.btn} type="submit" disabled={!configured}>
            查詢
          </button>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnGhost}`}
            onClick={onReset}
            disabled={!configured}
          >
            清除
          </button>
        </form>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>送貨單</h2>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>單號</th>
                <th>客戶</th>
                <th>日期</th>
                <th>版型</th>
                <th className={styles.num}>列印次數</th>
                <th>最後列印</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td>{o.order_no ?? "—"}</td>
                  <td>{o.customer_name ?? "—"}</td>
                  <td>{rocShort(o.order_date)}</td>
                  <td>{templateLabel(o.template)}</td>
                  <td className={styles.num}>{o.print_count}</td>
                  <td>{formatDateTime(o.last_printed_at)}</td>
                  <td>
                    <Link className={styles.openBtn} href={`/?id=${o.id}`}>
                      開啟
                    </Link>
                  </td>
                </tr>
              ))}
              {orders.length === 0 && (
                <tr>
                  <td colSpan={7} className={styles.empty}>
                    {!configured
                      ? "設定 Supabase 後即可查詢歷史送貨單。"
                      : loading
                        ? "載入中…"
                        : "查無送貨單。"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
