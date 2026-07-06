"use client";

import type { DoForm } from "../lib/contract";
import { lineSubtotal, grandTotal, documentTotal, formatMoney } from "./doForm";
import styles from "./DoPreview.module.css";

interface DoPreviewProps {
  form: DoForm;
}

/** 列印時想保留的最少列數(讓空白單也有完整版面)。 */
const MIN_ROWS = 6;

/** 抬頭左側欄位順序(對齊公版 K 款)。 */
const HEAD_ROWS: { label: string; key: keyof DoForm["header"] }[] = [
  { label: "客戶名稱", key: "customerName" },
  { label: "送貨地址", key: "deliveryAddress" },
  { label: "聯絡電話", key: "phone" },
  { label: "統一編號", key: "taxId" },
  { label: "發票號碼", key: "invoiceNo" },
];

/** 三聯出貨單預覽:以 CSS 仿公版 K 款,A5 橫式(A4 切半)。 */
export default function DoPreview({ form }: DoPreviewProps) {
  const { header, lines } = form;
  const subtotal = grandTotal(form);
  const total = documentTotal(form);
  const padCount = Math.max(0, MIN_ROWS - lines.length);

  return (
    <div className={styles.previewport}>
      <div className={styles.sheet}>
      <div className={styles.main}>
        {/* 抬頭 */}
        <div className={styles.top}>
          <div className={styles.custInfo}>
            {HEAD_ROWS.map((r) => (
              <div key={r.key} className={styles.custRow}>
                <span className={styles.custLabel}>{r.label}：</span>
                <span className={styles.custValue}>{header[r.key]}</span>
              </div>
            ))}
          </div>

          <div className={styles.titleBlock}>
            <div className={styles.company}>峻晟金屬股份有限公司_出貨單批售</div>
            <div className={styles.docTitle}>出　貨　單</div>
          </div>

          <div className={styles.metaBlock}>
            <div className={styles.metaNo}>
              NO. <span className={styles.metaNoVal}>{header.orderNo || "　"}</span>
            </div>
            <div className={styles.metaDate}>
              {header.date ? header.date : "年　　月　　日"}
            </div>
          </div>
        </div>

        {/* 品項表 */}
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.cSeq}>序號</th>
              <th className={styles.cName}>品　名　／　規　格</th>
              <th className={styles.cUnit}>單位</th>
              <th className={styles.cNum}>數量</th>
              <th className={styles.cNum}>單價</th>
              <th className={styles.cAmt}>金額</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, i) => (
              <tr key={i}>
                <td className={styles.cSeq}>{i + 1}</td>
                <td>{line.name}</td>
                <td className={styles.center}>{line.unit}</td>
                <td className={styles.num}>{line.qty || ""}</td>
                <td className={styles.num}>
                  {line.price ? formatMoney(line.price) : ""}
                </td>
                <td className={styles.num}>
                  {lineSubtotal(line) ? formatMoney(lineSubtotal(line)) : ""}
                </td>
              </tr>
            ))}
            {Array.from({ length: padCount }).map((_, i) => (
              <tr key={`pad-${i}`} className={styles.padRow}>
                <td className={styles.cSeq}>{lines.length + i + 1}</td>
                <td></td>
                <td></td>
                <td></td>
                <td></td>
                <td></td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* 備註 + 金額 */}
        <div className={styles.bottom}>
          <div className={styles.remark}>
            <span className={styles.remarkLabel}>備註</span>
            <span className={styles.remarkValue}>{header.remark}</span>
          </div>
          <table className={styles.totals}>
            <tbody>
              <tr>
                <td className={styles.totLabel}>金額合計</td>
                <td className={styles.num}>{formatMoney(subtotal)}</td>
              </tr>
              <tr>
                <td className={styles.totLabel}>稅　　額</td>
                <td className={styles.num}>{formatMoney(form.taxAmount || 0)}</td>
              </tr>
              <tr>
                <td className={styles.totLabel}>總　　計</td>
                <td className={`${styles.num} ${styles.grand}`}>
                  {formatMoney(total)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* 簽核列 */}
        <div className={styles.signs}>
          {["主管", "查核", "覆核", "經辦", "客戶簽收"].map((s) => (
            <span key={s} className={styles.sign}>
              {s}：<span className={styles.signLine} />
            </span>
          ))}
        </div>
      </div>

      {/* 三聯標示(右側直書) */}
      <div className={styles.copies}>
        <span>第一聯：會計存</span>
        <span>第二聯：客戶存</span>
        <span>第三聯：請款聯</span>
      </div>
      </div>
    </div>
  );
}
