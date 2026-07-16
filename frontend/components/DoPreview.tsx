"use client";

import { forwardRef } from "react";
import type { DoForm, MetalDoForm, StandardDoForm } from "../lib/contract";
import { lineSubtotal, grandTotal, documentTotal, formatMoney } from "./doForm";
import styles from "./DoPreview.module.css";

interface DoPreviewProps {
  form: DoForm;
}

/** 列印時想保留的最少列數(讓空白單也有完整版面)。 */
const MIN_ROWS = 8;

/** 峻晟固定公司資訊(硬編模板)。 */
const COMPANY = {
  title: "峻晟金屬股份有限公司",
  doc: "【出貨單】",
  companyPhone: "03-4750468",
  factoryPhone: "03-4601117~9",
  companyFax: "03-4750469",
  factoryFax: "03-4601128",
};

/**
 * 出貨單預覽。以 CSS 仿真實版型,A5 橫式(A4 切半)、cqw 等比縮放,永遠完整顯示。
 * root 以 ref 曝露供 html-to-image 擷取成 PNG 送圖形列印。
 */
const DoPreview = forwardRef<HTMLDivElement, DoPreviewProps>(function DoPreview(
  { form },
  ref,
) {
  // X/Y 微調:對位用。以 CSS transform 平移整張單 → 一併被 html-to-image 擷取,
  // 讓「所見即所印」。X:1/60 吋、Y:1/180 吋,換算成 px(@96dpi)供預覽平移。
  const dx = (form.offsetX / 60) * 96;
  const dy = (form.offsetY / 180) * 96;

  return (
    <div className={styles.previewport}>
      <div
        className={styles.sheet}
        ref={ref}
        style={{ transform: `translate(${dx}px, ${dy}px)` }}
      >
        {form.template === "metal" ? (
          <MetalSheet form={form} />
        ) : (
          <StandardSheet form={form} />
        )}
      </div>
    </div>
  );
});

export default DoPreview;

/* -------------------------------------------------------------- metal 版 */

function MetalSheet({ form }: { form: MetalDoForm }) {
  const { header, lines } = form;
  const padCount = Math.max(0, MIN_ROWS - lines.length);

  return (
    <div className={styles.metal}>
      <div className={styles.mBody}>
      {/* 抬頭:左客戶 / 中標題 / 右公司資訊 */}
      <div className={styles.mTop}>
        <div className={styles.mCust}>
          <div className={styles.mCustRow}>
            <span className={styles.mLabel}>客戶名稱：</span>
            <span className={styles.mVal}>{header.customerName}</span>
          </div>
          <div className={styles.mCustRow}>
            <span className={styles.mLabel}>地址：</span>
            <span className={styles.mVal}>{header.address}</span>
          </div>
          <div className={styles.mCustRow}>
            <span className={styles.mLabel}>電話：</span>
            <span className={styles.mVal}>{header.phone}</span>
          </div>
        </div>

        <div className={styles.mTitleBlock}>
          <div className={styles.mTitle}>{COMPANY.title}</div>
          <div className={styles.mDoc}>{COMPANY.doc}</div>
        </div>

        <div className={styles.mCompany}>
          <div>公司電話：{COMPANY.companyPhone}</div>
          <div>公司傳真：{COMPANY.companyFax}</div>
          <div>
            貨單號碼：
            <span className={styles.mOrderNo}>{header.orderNo}</span>
          </div>
          <div className={styles.mDate}>{header.date}</div>
        </div>
      </div>

      {/* 品項表:品名｜材質｜尺寸｜片數｜重量 + 備註欄 */}
      <table className={styles.mTable}>
        <thead>
          <tr>
            <th className={styles.mcName}>品&thinsp;名</th>
            <th className={styles.mcMat}>材&thinsp;質</th>
            <th className={styles.mcSize}>尺&thinsp;寸</th>
            <th className={styles.mcNum}>片&thinsp;數</th>
            <th className={styles.mcNum}>重&thinsp;量</th>
            <th className={styles.mcRemark}>備&thinsp;註</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, i) => (
            <tr key={i}>
              <td>{line.name}</td>
              <td>{line.material}</td>
              <td>{line.size}</td>
              <td className={styles.center}>{line.sheets || ""}</td>
              <td className={styles.center}>{line.weight || ""}</td>
              {i === 0 ? (
                <td rowSpan={lines.length + padCount} className={styles.mRemarkCell}>
                  {header.remark}
                </td>
              ) : null}
            </tr>
          ))}
          {Array.from({ length: padCount }).map((_, i) => (
            <tr key={`pad-${i}`} className={styles.mPadRow}>
              <td></td>
              <td></td>
              <td></td>
              <td></td>
              <td></td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* 底部:承運車行 / 車號 + 司機簽章 / 客戶簽收 */}
      <div className={styles.mBottom}>
        <div className={styles.mCarrier}>
          <div className={styles.mCarrierRow}>
            <span className={styles.mLabel}>承運車行：</span>
            <span className={styles.mVal}>{header.carrier}</span>
          </div>
          <div className={styles.mCarrierRow}>
            <span className={styles.mLabel}>車號：</span>
            <span className={styles.mVal}>{header.vehicleNo}</span>
          </div>
        </div>
        <div className={styles.mSigns}>
          <span className={styles.mSign}>
            司機簽章：<span className={styles.mSignLine} />
          </span>
          <span className={styles.mSign}>
            客戶簽收：<span className={styles.mSignLine} />
          </span>
        </div>

        {/* 三聯標示:同一列右側,上下排 */}
        <div className={styles.mCopies}>
          <span>① 存根聯（白）</span>
          <span>② 會計聯（黃）</span>
          <span>③ 客戶聯（紅）</span>
        </div>
      </div>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------- standard 版 */

/** standard 抬頭左側欄位順序(公版 K)。 */
const STD_HEAD_ROWS: { label: string; key: keyof StandardDoForm["header"] }[] = [
  { label: "客戶名稱", key: "customerName" },
  { label: "送貨地址", key: "address" },
  { label: "聯絡電話", key: "phone" },
  { label: "統一編號", key: "taxId" },
  { label: "發票號碼", key: "invoiceNo" },
];

/** standard 最少列數(公版 K)。 */
const STD_MIN_ROWS = 6;

function StandardSheet({ form }: { form: StandardDoForm }) {
  const { header, lines } = form;
  const subtotal = grandTotal(form);
  const total = documentTotal(form);
  const padCount = Math.max(0, STD_MIN_ROWS - lines.length);

  return (
    <>
      <div className={styles.main}>
        {/* 抬頭 */}
        <div className={styles.top}>
          <div className={styles.custInfo}>
            {STD_HEAD_ROWS.map((r) => (
              <div key={r.key} className={styles.custRow}>
                <span className={styles.custLabel}>{r.label}：</span>
                <span className={styles.custValue}>{header[r.key]}</span>
              </div>
            ))}
          </div>

          <div className={styles.titleBlock}>
            <div className={styles.company}>峻晟金屬股份有限公司</div>
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
    </>
  );
}
