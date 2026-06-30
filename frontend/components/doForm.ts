import type { DoForm, DoLine } from "../lib/contract";

/** 單列小計 = 數量 × 單價。 */
export function lineSubtotal(line: DoLine): number {
  return line.qty * line.price;
}

/** 表單總計 = 所有列小計之和。 */
export function grandTotal(form: DoForm): number {
  return form.lines.reduce((sum, line) => sum + lineSubtotal(line), 0);
}

/** 顯示用金額格式(千分位,最多兩位小數)。 */
export function formatMoney(value: number): string {
  return value.toLocaleString("zh-TW", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

/** 預設空白表單:一列空白項目,offset 皆為 0(offset UI 由 Issue #2 提供)。 */
export function emptyDoForm(): DoForm {
  return {
    lines: [{ name: "", size: "", qty: 0, price: 0 }],
    offsetX: 0,
    offsetY: 0,
  };
}
