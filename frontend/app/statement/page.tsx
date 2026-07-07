"use client";

// 對帳單頁(Issue #27):選客戶(或全部)+ 期間 → 查 metal 出貨單 → 攤平成對帳明細。
//   - 單價逐列可編修,金額 = round(重量 × 單價)即時重算;小計 / 營業稅(5%)/ 合計。
//   - 「儲存單價」寫回來源出貨單 lines jsonb。
//   - 「匯出 Excel」= 峻晟對帳單版面;全部客戶時每客戶一張工作表。
//
// 全部前端直連 Supabase;未設定 env 時顯示友善提示(build 不需 env)。

import { useEffect, useMemo, useState } from "react";
import { isSupabaseConfigured } from "../../lib/supabase";
import {
  fetchStatementOrders,
  fetchCustomerNames,
  flattenToStatementRows,
  computeAmount,
  computeTotals,
  formatMonthDay,
  buildStatementWorkbook,
  buildStatementFileName,
  rocPeriodLabel,
  savePrices,
  type StatementRow,
} from "../../lib/statement";
import styles from "./page.module.css";

/** 全部客戶的下拉 sentinel 值(空字串 = 全部)。 */
const ALL_CUSTOMERS = "";

/** 本月的 YYYY-MM。 */
function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** YYYY-MM → 該月第一天 / 最後一天(ISO)。 */
function monthRange(month: string): { from: string; to: string } {
  const m = month.match(/^(\d{4})-(\d{1,2})$/);
  if (!m) return { from: "", to: "" };
  const year = Number(m[1]);
  const mon = Number(m[2]);
  const from = `${year}-${String(mon).padStart(2, "0")}-01`;
  const last = new Date(year, mon, 0).getDate();
  const to = `${year}-${String(mon).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
  return { from, to };
}

/** 千分位顯示。 */
function fmt(n: number): string {
  return n.toLocaleString("zh-TW");
}

export default function StatementPage() {
  const configured = isSupabaseConfigured;

  const [customer, setCustomer] = useState<string>(ALL_CUSTOMERS);
  const [customers, setCustomers] = useState<string[]>([]);
  const [month, setMonth] = useState<string>(currentMonth());

  const [rows, setRows] = useState<StatementRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // 載入客戶下拉。
  useEffect(() => {
    if (!configured) return;
    fetchCustomerNames().then(setCustomers).catch(() => setCustomers([]));
  }, [configured]);

  const { from, to } = useMemo(() => monthRange(month), [month]);

  async function loadRows() {
    setError(null);
    setNotice(null);
    if (!from || !to) {
      setError("請選擇有效的月份。");
      return;
    }
    setLoading(true);
    try {
      const orders = await fetchStatementOrders({ customer, from, to });
      setRows(flattenToStatementRows(orders));
    } catch (e) {
      setRows(null);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  function updatePrice(index: number, raw: string) {
    if (!rows) return;
    const n = Number(raw);
    const price = Number.isFinite(n) && n >= 0 ? n : 0;
    setRows(rows.map((r, i) => (i === index ? { ...r, price } : r)));
    setNotice(null);
  }

  const totals = useMemo(
    () => (rows ? computeTotals(rows) : { subtotal: 0, tax: 0, total: 0 }),
    [rows],
  );

  const periodLabel = useMemo(() => {
    const m = month.match(/^(\d{4})-(\d{1,2})$/);
    if (!m) return month;
    return rocPeriodLabel(Number(m[1]), Number(m[2]));
  }, [month]);

  const customerLabel = customer === ALL_CUSTOMERS ? "全部客戶" : customer;

  async function handleSave() {
    if (!rows || rows.length === 0) return;
    setError(null);
    setNotice(null);
    setSaving(true);
    try {
      const n = await savePrices(rows);
      setNotice(`已儲存單價,更新 ${n} 張出貨單。`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleExport() {
    if (!rows) return;
    setError(null);
    try {
      const XLSX = await import("xlsx");
      const wb = buildStatementWorkbook(
        customer === ALL_CUSTOMERS ? null : customer,
        periodLabel,
        rows,
      );
      XLSX.writeFile(wb, buildStatementFileName(customerLabel, periodLabel));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <main className={styles.page}>
      <h1 className={styles.heading}>對帳單</h1>
      <p className={styles.subhead}>
        選客戶與月份,逐列帶出出貨單品項與單價;金額 = 重量 × 單價,可編修單價後儲存或匯出峻晟版對帳單 Excel。
      </p>

      {!configured && (
        <div className={styles.notice}>
          尚未設定 Supabase(環境變數
          <code> NEXT_PUBLIC_SUPABASE_URL</code> /
          <code> NEXT_PUBLIC_SUPABASE_ANON_KEY</code>
          )。設定後即可查詢與匯出。
        </div>
      )}

      <section className={styles.section}>
        <div className={styles.sectionTitle}>篩選</div>
        <div className={styles.row}>
          <div className={styles.field}>
            <label htmlFor="customer">客戶</label>
            <select
              id="customer"
              className={styles.input}
              value={customer}
              onChange={(e) => {
                setCustomer(e.target.value);
                setRows(null);
              }}
              disabled={!configured}
            >
              <option value={ALL_CUSTOMERS}>全部客戶</option>
              {customers.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className={styles.field}>
            <label htmlFor="month">月份</label>
            <input
              id="month"
              type="month"
              className={styles.input}
              value={month}
              onChange={(e) => {
                setMonth(e.target.value);
                setRows(null);
              }}
              disabled={!configured}
            />
          </div>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnGhost}`}
            onClick={loadRows}
            disabled={!configured || loading}
          >
            {loading ? "查詢中…" : "查詢"}
          </button>
          <button
            type="button"
            className={styles.btn}
            onClick={handleExport}
            disabled={!configured || !rows}
          >
            匯出 Excel
          </button>
        </div>

        {error && (
          <div className={`${styles.notice} ${styles.error}`}>{error}</div>
        )}
        {notice && <div className={styles.ok}>{notice}</div>}
      </section>

      {rows && (
        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <div className={styles.sectionTitle}>
              對帳明細 · {customerLabel} · {periodLabel}
            </div>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnGhost}`}
              onClick={handleSave}
              disabled={saving || rows.length === 0}
            >
              {saving ? "儲存中…" : "儲存單價"}
            </button>
          </div>

          {rows.length === 0 ? (
            <div className={styles.empty}>此期間內沒有符合條件的出貨單。</div>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>日期</th>
                    <th>品號</th>
                    <th>材質</th>
                    <th>規格</th>
                    <th className={styles.num}>片數</th>
                    <th className={styles.num}>重量</th>
                    <th className={styles.num}>單價</th>
                    <th className={styles.num}>金額</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={`${r.sourceOrderId}-${r.sourceLineIndex}`}>
                      <td>{formatMonthDay(r.isoDate)}</td>
                      <td>{r.name}</td>
                      <td>{r.material}</td>
                      <td>{r.size}</td>
                      <td className={styles.num}>{r.sheets || ""}</td>
                      <td className={styles.num}>{r.weight || ""}</td>
                      <td className={styles.num}>
                        <input
                          className={`${styles.input} ${styles.priceInput}`}
                          type="number"
                          min={0}
                          step="any"
                          value={r.price}
                          aria-label="單價"
                          onChange={(e) => updatePrice(i, e.target.value)}
                        />
                      </td>
                      <td className={styles.num}>
                        {fmt(computeAmount(r.weight, r.price))}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={6} />
                    <td className={styles.footLabel}>小計</td>
                    <td className={styles.num}>{fmt(totals.subtotal)}</td>
                  </tr>
                  <tr>
                    <td colSpan={6} />
                    <td className={styles.footLabel}>營業稅(5%)</td>
                    <td className={styles.num}>{fmt(totals.tax)}</td>
                  </tr>
                  <tr className={styles.grandRow}>
                    <td colSpan={6} />
                    <td className={styles.footLabel}>合計</td>
                    <td className={styles.num}>{fmt(totals.total)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </section>
      )}
    </main>
  );
}
