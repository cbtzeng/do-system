"use client";

// 對帳單頁(Issue #27 / #44):選客戶(或全部)+ 期間 → 查 metal 出貨單 → 攤平成對帳明細。
//   - 單價逐列可編修,金額 = round(重量 × 單價)即時重算;小計 / 營業稅(5%)/ 合計。
//   - 每筆出貨單有入帳狀態(未入帳/已請款/已收款);單筆逐列改或多筆勾選批次改,即時寫回。
//   - 已收款(paid)的單:單價鎖定唯讀,「儲存單價」時跳過。
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
  updateBillingStatus,
  distinctOrderIds,
  BILLING_STATUSES,
  BILLING_STATUS_LABELS,
  BILLING_STATUS_TONES,
  type StatementRow,
  type BillingStatus,
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

/** 對帳列的唯一鍵(勾選用)。 */
function rowKey(r: StatementRow): string {
  return `${r.sourceOrderId}-${r.sourceLineIndex}`;
}

/** 入帳狀態 chip。 */
function StatusChip({ status }: { status: BillingStatus }) {
  return (
    <span className={`${styles.chip} ${styles[`chip_${BILLING_STATUS_TONES[status]}`]}`}>
      {BILLING_STATUS_LABELS[status]}
    </span>
  );
}

export default function StatementPage() {
  const configured = isSupabaseConfigured;

  const [customer, setCustomer] = useState<string>(ALL_CUSTOMERS);
  const [customers, setCustomers] = useState<string[]>([]);
  const [month, setMonth] = useState<string>(currentMonth());

  const [rows, setRows] = useState<StatementRow[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);
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
    setSelected(new Set());
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

  function updatePrice(key: string, raw: string) {
    if (!rows) return;
    const n = Number(raw);
    const price = Number.isFinite(n) && n >= 0 ? n : 0;
    setRows(rows.map((r) => (rowKey(r) === key ? { ...r, price } : r)));
    setNotice(null);
  }

  function toggleRow(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleAll() {
    if (!rows) return;
    setSelected((prev) =>
      prev.size === rows.length ? new Set() : new Set(rows.map(rowKey)),
    );
  }

  /** 改指定出貨單(整筆)的入帳狀態:樂觀更新 + 寫回;失敗還原並提示。 */
  async function applyStatus(orderIds: string[], status: BillingStatus) {
    if (!rows || orderIds.length === 0) return;
    const ids = new Set(orderIds);
    const prev = rows;
    setError(null);
    setNotice(null);
    setStatusBusy(true);
    setRows(
      rows.map((r) =>
        ids.has(r.sourceOrderId) ? { ...r, billingStatus: status } : r,
      ),
    );
    try {
      await updateBillingStatus(orderIds, status);
      setNotice(
        `已更新 ${orderIds.length} 張出貨單為「${BILLING_STATUS_LABELS[status]}」。`,
      );
    } catch (e) {
      setRows(prev); // 還原
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setStatusBusy(false);
    }
  }

  /** 批次:把選取列所屬單的 distinct id 一起改狀態。 */
  async function applyStatusToSelected(status: BillingStatus) {
    if (!rows) return;
    const chosen = rows.filter((r) => selected.has(rowKey(r)));
    const orderIds = distinctOrderIds(chosen);
    if (orderIds.length === 0) return;
    await applyStatus(orderIds, status);
    setSelected(new Set());
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
      const skipped = distinctOrderIds(
        rows.filter((r) => r.billingStatus === "paid"),
      ).length;
      setNotice(
        skipped > 0
          ? `已儲存單價,更新 ${n} 張出貨單(略過 ${skipped} 張已收款)。`
          : `已儲存單價,更新 ${n} 張出貨單。`,
      );
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

  const selectedCount = selected.size;
  const allChecked = rows != null && rows.length > 0 && selected.size === rows.length;

  return (
    <main className={styles.page}>
      <h1 className={styles.heading}>對帳單</h1>
      <p className={styles.subhead}>
        選客戶與月份,逐列帶出出貨單品項與單價;金額 = 重量 × 單價,可編修單價並標記入帳狀態,再儲存或匯出峻晟版對帳單 Excel。
      </p>

      {!configured && (
        <div className={styles.notice}>
          尚未設定 Supabase(環境變數
          <code> NEXT_PUBLIC_SUPABASE_URL</code> /
          <code> NEXT_PUBLIC_SUPABASE_ANON_KEY</code>
          )。設定後即可查詢、標記狀態與匯出。
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
                setSelected(new Set());
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
                setSelected(new Set());
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

          {selectedCount > 0 && (
            <div className={styles.bulkBar}>
              <span className={styles.bulkLabel}>
                已選取 {selectedCount} 列,將選取的改為:
              </span>
              {BILLING_STATUSES.map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`${styles.btn} ${styles.btnChip} ${styles[`chip_${BILLING_STATUS_TONES[s]}`]}`}
                  onClick={() => applyStatusToSelected(s)}
                  disabled={!configured || statusBusy}
                >
                  {BILLING_STATUS_LABELS[s]}
                </button>
              ))}
              <button
                type="button"
                className={styles.bulkClear}
                onClick={() => setSelected(new Set())}
              >
                清除選取
              </button>
            </div>
          )}

          {rows.length === 0 ? (
            <div className={styles.empty}>此期間內沒有符合條件的出貨單。</div>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th className={styles.checkCol}>
                      <input
                        type="checkbox"
                        aria-label="全選"
                        checked={allChecked}
                        onChange={toggleAll}
                      />
                    </th>
                    <th>日期</th>
                    <th>品號</th>
                    <th>材質</th>
                    <th>規格</th>
                    <th className={styles.num}>片數</th>
                    <th className={styles.num}>重量</th>
                    <th className={styles.num}>單價</th>
                    <th className={styles.num}>金額</th>
                    <th>狀態</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const key = rowKey(r);
                    const paid = r.billingStatus === "paid";
                    return (
                      <tr key={key}>
                        <td className={styles.checkCol}>
                          <input
                            type="checkbox"
                            aria-label="選取此列"
                            checked={selected.has(key)}
                            onChange={() => toggleRow(key)}
                          />
                        </td>
                        <td>{formatMonthDay(r.isoDate)}</td>
                        <td>{r.name}</td>
                        <td>{r.material}</td>
                        <td>{r.size}</td>
                        <td className={styles.num}>{r.sheets || ""}</td>
                        <td className={styles.num}>{r.weight || ""}</td>
                        <td className={styles.num}>
                          <input
                            className={`${styles.input} ${styles.priceInput} ${paid ? styles.priceLocked : ""}`}
                            type="number"
                            min={0}
                            step="any"
                            value={r.price}
                            aria-label="單價"
                            disabled={paid}
                            readOnly={paid}
                            title={paid ? "已收款,單價鎖定" : undefined}
                            onChange={(e) => updatePrice(key, e.target.value)}
                          />
                        </td>
                        <td className={styles.num}>
                          {fmt(computeAmount(r.weight, r.price))}
                        </td>
                        <td>
                          <select
                            className={styles.statusSelect}
                            value={r.billingStatus}
                            aria-label="入帳狀態"
                            disabled={!configured || statusBusy}
                            onChange={(e) =>
                              applyStatus(
                                [r.sourceOrderId],
                                e.target.value as BillingStatus,
                              )
                            }
                          >
                            {BILLING_STATUSES.map((s) => (
                              <option key={s} value={s}>
                                {BILLING_STATUS_LABELS[s]}
                              </option>
                            ))}
                          </select>
                          <StatusChip status={r.billingStatus} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={7} />
                    <td className={styles.footLabel}>小計</td>
                    <td className={styles.num}>{fmt(totals.subtotal)}</td>
                    <td />
                  </tr>
                  <tr>
                    <td colSpan={7} />
                    <td className={styles.footLabel}>營業稅(5%)</td>
                    <td className={styles.num}>{fmt(totals.tax)}</td>
                    <td />
                  </tr>
                  <tr className={styles.grandRow}>
                    <td colSpan={7} />
                    <td className={styles.footLabel}>合計</td>
                    <td className={styles.num}>{fmt(totals.total)}</td>
                    <td />
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
