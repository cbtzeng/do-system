"use client";

// 區間匯出 Excel(對帳)頁:選日期區間 → 查詢預覽筆數 → 匯出 .xlsx。
//
// 全部前端直連 Supabase;未設定 env 時只顯示友善提示(build 不需 env)。

import { useState } from "react";
import { isSupabaseConfigured } from "../../lib/supabase";
import {
  fetchOrdersInRange,
  buildWorkbook,
  buildFileName,
  flattenOrder,
} from "../../lib/export";
import type { DeliveryOrderRow } from "../../lib/db-types";
import styles from "./page.module.css";

/** 取本月第一天 / 今天(YYYY-MM-DD),當作預設區間。 */
function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function defaultFrom(): string {
  const now = new Date();
  return isoDate(new Date(now.getFullYear(), now.getMonth(), 1));
}

export default function ExportPage() {
  const configured = isSupabaseConfigured;

  const [from, setFrom] = useState<string>(defaultFrom());
  const [to, setTo] = useState<string>(isoDate(new Date()));
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [preview, setPreview] = useState<DeliveryOrderRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const rangeInvalid = Boolean(from && to && from > to);

  async function loadPreview() {
    setError(null);
    if (rangeInvalid) {
      setError("起始日期不可晚於結束日期。");
      return;
    }
    setLoading(true);
    try {
      const orders = await fetchOrdersInRange(from, to);
      setPreview(orders);
    } catch (e) {
      setPreview(null);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function handleExport() {
    setError(null);
    if (rangeInvalid) {
      setError("起始日期不可晚於結束日期。");
      return;
    }
    setExporting(true);
    try {
      // 若已有預覽資料就直接用,避免重複查詢。
      const orders = preview ?? (await fetchOrdersInRange(from, to));
      setPreview(orders);
      const XLSX = await import("xlsx");
      const wb = buildWorkbook(orders);
      XLSX.writeFile(wb, buildFileName(from, to));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setExporting(false);
    }
  }

  const lineCount = preview
    ? preview.reduce(
        (n, o) => n + flattenOrder(o).length,
        0,
      )
    : 0;

  return (
    <main className={styles.page}>
      <h1 className={styles.heading}>區間匯出 Excel</h1>
      <p className={styles.subhead}>
        選日期區間,匯出 .xlsx 對帳表;每張出貨單的品項會攤平成一列一項,方便逐行核對紙本。
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
        <div className={styles.sectionTitle}>日期區間</div>
        <div className={styles.row}>
          <div className={styles.field}>
            <label htmlFor="from">起始日期</label>
            <input
              id="from"
              type="date"
              className={styles.input}
              value={from}
              max={to || undefined}
              onChange={(e) => {
                setFrom(e.target.value);
                setPreview(null);
              }}
              disabled={!configured}
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="to">結束日期</label>
            <input
              id="to"
              type="date"
              className={styles.input}
              value={to}
              min={from || undefined}
              onChange={(e) => {
                setTo(e.target.value);
                setPreview(null);
              }}
              disabled={!configured}
            />
          </div>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnGhost}`}
            onClick={loadPreview}
            disabled={!configured || loading || rangeInvalid}
          >
            {loading ? "查詢中…" : "查詢筆數"}
          </button>
          <button
            type="button"
            className={styles.btn}
            onClick={handleExport}
            disabled={!configured || exporting || rangeInvalid}
          >
            {exporting ? "匯出中…" : "匯出 Excel"}
          </button>
        </div>

        {rangeInvalid && (
          <div className={`${styles.notice} ${styles.error}`}>
            起始日期不可晚於結束日期。
          </div>
        )}
        {error && (
          <div className={`${styles.notice} ${styles.error}`}>{error}</div>
        )}
      </section>

      {preview && (
        <section className={styles.section}>
          <div className={styles.sectionTitle}>預覽</div>
          {preview.length === 0 ? (
            <div className={styles.empty}>此區間內沒有任何出貨單。</div>
          ) : (
            <>
              <p className={styles.muted}>
                共 <strong>{preview.length}</strong> 張出貨單、
                <strong>{lineCount}</strong> 列品項將被匯出。
              </p>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>貨單號碼</th>
                      <th>日期</th>
                      <th>客戶</th>
                      <th>版型</th>
                      <th className={styles.num}>品項數</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((o) => (
                      <tr key={o.id}>
                        <td>{o.order_no ?? ""}</td>
                        <td>{o.order_date ?? ""}</td>
                        <td>{o.customer_name ?? ""}</td>
                        <td>
                          {o.template === "standard" ? "標準" : "峻晟"}
                        </td>
                        <td className={styles.num}>
                          {Array.isArray(o.lines) ? o.lines.length : 0}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      )}
    </main>
  );
}
