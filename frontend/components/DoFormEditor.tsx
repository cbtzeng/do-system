"use client";

import type {
  DoForm,
  DoHeader,
  MetalDoForm,
  MetalLine,
  StandardDoForm,
  StandardLine,
} from "../lib/contract";
import {
  lineSubtotal,
  grandTotal,
  documentTotal,
  formatMoney,
  emptyMetalLine,
  emptyStandardLine,
  switchTemplate,
} from "./doForm";
import styles from "./DoFormEditor.module.css";

interface DoFormEditorProps {
  form: DoForm;
  onChange: (form: DoForm) => void;
}

// 將輸入字串轉為非負數字;空白或非法值視為 0。
function parseNumber(raw: string): number {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/** metal 版抬頭欄位。 */
const METAL_HEADER: { key: keyof DoHeader; label: string; placeholder?: string }[] = [
  { key: "customerName", label: "客戶名稱" },
  { key: "address", label: "住址" },
  { key: "phone", label: "電話" },
  { key: "orderNo", label: "貨單號碼", placeholder: "002601" },
  { key: "date", label: "日期", placeholder: "115 年 6 月 22 日" },
];

/** standard 版抬頭欄位。 */
const STANDARD_HEADER: { key: keyof DoHeader; label: string; placeholder?: string }[] = [
  { key: "customerName", label: "客戶名稱" },
  { key: "address", label: "送貨地址" },
  { key: "phone", label: "聯絡電話" },
  { key: "taxId", label: "統一編號" },
  { key: "invoiceNo", label: "發票號碼" },
  { key: "orderNo", label: "NO. 單號", placeholder: "000001" },
  { key: "date", label: "日期", placeholder: "115 年 6 月 22 日" },
];

/** 出貨單編輯表單:版型切換 + 抬頭 + 多列品項 CRUD。 */
export default function DoFormEditor({ form, onChange }: DoFormEditorProps) {
  function updateHeader(patch: Partial<DoHeader>) {
    onChange({ ...form, header: { ...form.header, ...patch } });
  }

  return (
    <div className={styles.editor}>
      {/* 版型切換 */}
      <div className={styles.templateSwitch} role="tablist" aria-label="版型">
        <button
          type="button"
          role="tab"
          aria-selected={form.template === "metal"}
          className={`${styles.tab} ${form.template === "metal" ? styles.tabActive : ""}`}
          onClick={() => onChange(switchTemplate(form, "metal"))}
        >
          峻晟金屬(無金額)
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={form.template === "standard"}
          className={`${styles.tab} ${form.template === "standard" ? styles.tabActive : ""}`}
          onClick={() => onChange(switchTemplate(form, "standard"))}
        >
          標準(含金額)
        </button>
      </div>

      {/* 抬頭 */}
      <div className={styles.headerGrid}>
        {(form.template === "metal" ? METAL_HEADER : STANDARD_HEADER).map((f) => (
          <label key={f.key} className={styles.field}>
            <span className={styles.fieldLabel}>{f.label}</span>
            <input
              className={styles.input}
              type="text"
              value={form.header[f.key]}
              placeholder={f.placeholder}
              onChange={(e) => updateHeader({ [f.key]: e.target.value })}
            />
          </label>
        ))}
      </div>

      {form.template === "metal" ? (
        <MetalEditor form={form} onChange={onChange} updateHeader={updateHeader} />
      ) : (
        <StandardEditor form={form} onChange={onChange} updateHeader={updateHeader} />
      )}
    </div>
  );
}

/* -------------------------------------------------------------- metal 版 */

function MetalEditor({
  form,
  onChange,
  updateHeader,
}: {
  form: MetalDoForm;
  onChange: (form: DoForm) => void;
  updateHeader: (patch: Partial<DoHeader>) => void;
}) {
  const { lines, header } = form;

  function updateLine(index: number, patch: Partial<MetalLine>) {
    const next = lines.map((line, i) => (i === index ? { ...line, ...patch } : line));
    onChange({ ...form, lines: next });
  }
  function addLine() {
    onChange({ ...form, lines: [...lines, emptyMetalLine()] });
  }
  function deleteLine(index: number) {
    onChange({ ...form, lines: lines.filter((_, i) => i !== index) });
  }

  return (
    <>
      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.colSeq}>序號</th>
            <th className={styles.colName}>品名</th>
            <th className={styles.colMid}>材質</th>
            <th className={styles.colMid}>尺寸</th>
            <th className={styles.colNum}>片數</th>
            <th className={styles.colNum}>重量</th>
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
                  placeholder="SRS60401-M1"
                  onChange={(e) => updateLine(i, { name: e.target.value })}
                />
              </td>
              <td>
                <input
                  className={styles.input}
                  type="text"
                  value={line.material}
                  placeholder="SPHC PO"
                  onChange={(e) => updateLine(i, { material: e.target.value })}
                />
              </td>
              <td>
                <input
                  className={styles.input}
                  type="text"
                  value={line.size}
                  placeholder="1.2x1040x1220"
                  onChange={(e) => updateLine(i, { size: e.target.value })}
                />
              </td>
              <td>
                <input
                  className={`${styles.input} ${styles.numInput}`}
                  type="number"
                  min={0}
                  step={1}
                  value={line.sheets}
                  onChange={(e) => updateLine(i, { sheets: parseNumber(e.target.value) })}
                />
              </td>
              <td>
                <input
                  className={`${styles.input} ${styles.numInput}`}
                  type="number"
                  min={0}
                  step="any"
                  value={line.weight}
                  onChange={(e) => updateLine(i, { weight: parseNumber(e.target.value) })}
                />
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

      {/* 備註 / 承運車行 / 車號 */}
      <div className={styles.metalFoot}>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>備註</span>
          <textarea
            className={styles.textarea}
            rows={2}
            value={header.remark}
            placeholder="備註"
            onChange={(e) => updateHeader({ remark: e.target.value })}
          />
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>承運車行</span>
          <input
            className={styles.input}
            type="text"
            value={header.carrier}
            placeholder="承運車行"
            onChange={(e) => updateHeader({ carrier: e.target.value })}
          />
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>車號</span>
          <input
            className={styles.input}
            type="text"
            value={header.vehicleNo}
            placeholder="車號"
            onChange={(e) => updateHeader({ vehicleNo: e.target.value })}
          />
        </label>
      </div>
    </>
  );
}

/* ----------------------------------------------------------- standard 版 */

function StandardEditor({
  form,
  onChange,
  updateHeader,
}: {
  form: StandardDoForm;
  onChange: (form: DoForm) => void;
  updateHeader: (patch: Partial<DoHeader>) => void;
}) {
  const { lines, header } = form;

  function updateLine(index: number, patch: Partial<StandardLine>) {
    const next = lines.map((line, i) => (i === index ? { ...line, ...patch } : line));
    onChange({ ...form, lines: next });
  }
  function addLine() {
    onChange({ ...form, lines: [...lines, emptyStandardLine()] });
  }
  function deleteLine(index: number) {
    onChange({ ...form, lines: lines.filter((_, i) => i !== index) });
  }

  const subtotal = grandTotal(form);
  const total = documentTotal(form);

  return (
    <>
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
                  onChange={(e) => updateLine(i, { qty: parseNumber(e.target.value) })}
                />
              </td>
              <td>
                <input
                  className={`${styles.input} ${styles.numInput}`}
                  type="number"
                  min={0}
                  step="any"
                  value={line.price}
                  onChange={(e) => updateLine(i, { price: parseNumber(e.target.value) })}
                />
              </td>
              <td className={styles.subtotal}>{formatMoney(lineSubtotal(line))}</td>
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
    </>
  );
}
