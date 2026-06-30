"use client";

import type { DoForm } from "../lib/contract";
import { lineSubtotal, grandTotal, formatMoney } from "./doForm";
import styles from "./DoPreview.module.css";

interface DoPreviewProps {
  form: DoForm;
}

/** 三聯單預覽框:以 CSS 模擬列印出的送貨單(單聯即可)。 */
export default function DoPreview({ form }: DoPreviewProps) {
  const total = grandTotal(form);

  return (
    <div className={styles.preview}>
      <div className={styles.title}>送 貨 單</div>
      <div className={styles.subtitle}>DELIVERY ORDER（預覽）</div>

      <table className={styles.table}>
        <thead>
          <tr>
            <th>品名</th>
            <th>尺寸</th>
            <th>數量</th>
            <th>單價</th>
            <th>小計</th>
          </tr>
        </thead>
        <tbody>
          {form.lines.map((line, i) => (
            <tr key={i}>
              <td className={line.name ? undefined : styles.empty}>
                {line.name || "—"}
              </td>
              <td className={line.size ? undefined : styles.empty}>
                {line.size || "—"}
              </td>
              <td className={styles.num}>{line.qty}</td>
              <td className={styles.num}>{formatMoney(line.price)}</td>
              <td className={styles.num}>{formatMoney(lineSubtotal(line))}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className={styles.total}>
            <td colSpan={4} className={styles.num}>
              總計
            </td>
            <td className={styles.num}>{formatMoney(total)}</td>
          </tr>
        </tfoot>
      </table>

      <div className={styles.foot}>
        <span>客戶簽收：________________</span>
        <span>日期：__________</span>
      </div>
    </div>
  );
}
