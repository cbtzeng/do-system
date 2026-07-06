"use client";

import type { DoForm, DoHeader, DoLine } from "../lib/contract";
import { lineSubtotal, grandTotal, documentTotal, formatMoney } from "./doForm";
import styles from "./DoFormEditor.module.css";

interface DoFormEditorProps {
  form: DoForm;
  onChange: (form: DoForm) => void;
}

/** 抬頭欄位定義(以公版 K 款出貨單為標準)。 */
const HEADER_FIELDS: { key: keyof DoHeader; label: string; placeholder?: string }[] = [
  { key: "customerName", label: "客戶名稱" },
  { key: "deliveryAddress", label: "送貨地址" },
  { key: "phone", label: "聯絡電話" },
  { key: "taxId", label: "統一編號" },
  { key: "invoiceNo", label: "發票號碼" },
  { key: "orderNo", label: "NO. 單號", placeholder: "000001" },
  { key: "date", label: "日期", placeholder: "2026 / 07 / 01" },
];

/** 出貨單編輯表單:抬頭 + 多列品項 CRUD + 備註 + 稅額。 */
export default function DoFormEditor({ form, onChange }: DoFormEditorProps) {
  const { lines, header } = form;

  function updateHeader(patch: Partial<DoHeader>) {
    onChange({ ...form, header: { ...header, ...patch } });
  }

  function updateLine(index: number, patch: Partial<DoLine>) {
    const next = lines.map((line, i) =>
      i === index ? { ...line, ...patch } : line
    );
    onChange({ ...form, lines: next });
  }

  function addLine() {
    const next: DoLine = { name: "", unit: "", qty: 0, price: 0 };
    onChange({ ...form, lines: [...lines, next] });
  }

  function deleteLine(index: number) {
    onChange({ ...form, lines: lines.filter((_, i) => i !== index) });
  }

  // 將輸入字串轉為非負數字;空白或非法值視為 0。
  function parseNumber(raw: string): number {
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }

  const subtotal = grandTotal(form);
  const total = documentTotal(form);

  return (
    <div className={styles.editor}>
      {/* 抬頭 */}
      <div className={styles.headerGrid}>
        {HEADER_FIELDS.map((f) => (
          <label key={f.key} className={styles.field}>
            <span className={styles.fieldLabel}>{f.label}</span>
            <input
              className={styles.input}
              type="text"
              value={header[f.key]}
              placeholder={f.placeholder}
              onChange={(e) => updateHeader({ [f.key]: e.target.value })}
            />
          </label>
        ))}
      </div>

      {/* 品項 */}
      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.colSeq}>序號</th>
            <th className={styles.colName}>品名 / 規格</th>
            <th className={styles.colUnit}>單位</th>
            <th className={styles.colNum}>數量</th>
            <th className={styles.colNum}>單價</th>
            <th className={styles.colSub}>金額</th>
            <th className={styles.colAct}></th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, i) => (
            <tr key={i}>
              <td className={styles.seq}>{i + 1}</td>
              <td>
                <input
                  className={styles.input}
                  type="text"
                  value={line.name}
                  placeholder="品名 / 規格"
                  onChange={(e) => updateLine(i, { name: e.target.value })}
                />
              </td>
              <td>
                <input
                  className={styles.input}
                  type="text"
                  value={line.unit}
                  placeholder="個"
                  onChange={(e) => updateLine(i, { unit: e.target.value })}
                />
              </td>
              <td>
                <input
                  className={`${styles.input} ${styles.numInput}`}
                  type="number"
                  min={0}
                  step={1}
                  value={line.qty}
                  onChange={(e) =>
                    updateLine(i, { qty: parseNumber(e.target.value) })
                  }
                />
              </td>
              <td>
                <input
                  className={`${styles.input} ${styles.numInput}`}
                  type="number"
                  min={0}
                  step="any"
                  value={line.price}
                  onChange={(e) =>
                    updateLine(i, { price: parseNumber(e.target.value) })
                  }
                />
              </td>
              <td className={styles.subtotal}>
                {formatMoney(lineSubtotal(line))}
              </td>
              <td>
                <button
                  type="button"
                  className={styles.delBtn}
                  onClick={() => deleteLine(i)}
                  disabled={lines.length <= 1}
                  title={lines.length <= 1 ? "至少保留一列" : "刪除此列"}
                >
                  刪除
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <button type="button" className={styles.addBtn} onClick={addLine}>
        + 新增一列
      </button>

      {/* 備註 + 金額 */}
      <div className={styles.footGrid}>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>備註</span>
          <textarea
            className={styles.textarea}
            rows={3}
            value={header.remark}
            placeholder="備註"
            onChange={(e) => updateHeader({ remark: e.target.value })}
          />
        </label>

        <div className={styles.totals}>
          <div className={styles.totalRow}>
            <span>金額合計</span>
            <span className={styles.subtotal}>{formatMoney(subtotal)}</span>
          </div>
          <div className={styles.totalRow}>
            <span>稅額</span>
            <input
              className={`${styles.input} ${styles.numInput} ${styles.taxInput}`}
              type="number"
              min={0}
              step="any"
              value={form.taxAmount}
              onChange={(e) =>
                onChange({ ...form, taxAmount: parseNumber(e.target.value) })
              }
            />
          </div>
          <div className={`${styles.totalRow} ${styles.grandRow}`}>
            <span>總計</span>
            <span className={styles.subtotal}>{formatMoney(total)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
