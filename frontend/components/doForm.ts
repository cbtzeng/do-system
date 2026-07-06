import type { DoForm, DoHeader, DoLine } from "../lib/contract";

/** 單列金額 = 數量 × 單價。 */
export function lineSubtotal(line: DoLine): number {
  return line.qty * line.price;
}

/** 金額合計 = 所有列金額之和。 */
export function grandTotal(form: DoForm): number {
  return form.lines.reduce((sum, line) => sum + lineSubtotal(line), 0);
}

/** 總計 = 金額合計 + 稅額。 */
export function documentTotal(form: DoForm): number {
  return grandTotal(form) + (form.taxAmount || 0);
}

/** 顯示用金額格式(千分位,最多兩位小數)。 */
export function formatMoney(value: number): string {
  return value.toLocaleString("zh-TW", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

/** 空白抬頭。 */
export function emptyHeader(): DoHeader {
  return {
    customerName: "",
    deliveryAddress: "",
    phone: "",
    taxId: "",
    invoiceNo: "",
    orderNo: "",
    date: "",
    remark: "",
  };
}

/** 預設空白表單:抬頭空白、一列空白品項、稅額與 offset 皆為 0。 */
export function emptyDoForm(): DoForm {
  return {
    header: emptyHeader(),
    lines: [{ name: "", unit: "", qty: 0, price: 0 }],
    taxAmount: 0,
    offsetX: 0,
    offsetY: 0,
  };
}
