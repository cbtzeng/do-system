"use client";

import type { DoForm, DoLine } from "../lib/contract";
import { lineSubtotal, formatMoney } from "./doForm";
import styles from "./DoFormEditor.module.css";

interface DoFormEditorProps {
  form: DoForm;
  onChange: (form: DoForm) => void;
}

/** 送貨單編輯表單:多列 CRUD + 即時小計/總計。 */
export default function DoFormEditor({ form, onChange }: DoFormEditorProps) {
  const { lines } = form;

  function updateLine(index: number, patch: Partial<DoLine>) {
    const next = lines.map((line, i) =>
      i === index ? { ...line, ...patch } : line
    );
    onChange({ ...form, lines: next });
  }

  function addLine() {
    const next: DoLine = { name: "", size: "", qty: 0, price: 0 };
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

  const grandTotal = lines.reduce((sum, line) => sum + lineSubtotal(line), 0);

  return (
    <div className={styles.editor}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.colName}>品名</th>
            <th className={styles.colSize}>尺寸</th>
            <th className={styles.colNum}>數量</th>
            <th className={styles.colNum}>單價</th>
            <th className={styles.colSub}>小計</th>
            <th className={styles.colAct}>操作</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, i) => (
            <tr key={i}>
              <td>
                <input
                  className={styles.input}
                  type="text"
                  value={line.name}
                  placeholder="品名"
                  onChange={(e) => updateLine(i, { name: e.target.value })}
                />
              </td>
              <td>
                <input
                  className={styles.input}
                  type="text"
                  value={line.size}
                  placeholder="尺寸"
                  onChange={(e) => updateLine(i, { size: e.target.value })}
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
                  title={
                    lines.length <= 1 ? "至少保留一列" : "刪除此列"
                  }
                >
                  刪除
                </button>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className={styles.totalRow}>
            <td colSpan={4} style={{ textAlign: "right" }}>
              總計
            </td>
            <td className={styles.subtotal}>{formatMoney(grandTotal)}</td>
            <td />
          </tr>
        </tfoot>
      </table>

      <button type="button" className={styles.addBtn} onClick={addLine}>
        + 新增一列
      </button>
    </div>
  );
}
