import type {
  DoForm,
  DoHeader,
  MetalDoForm,
  MetalLine,
  StandardDoForm,
  StandardLine,
} from "../lib/contract";

/* ---------------------------------------------------------------- standard 版金額 */

/** 單列金額 = 數量 × 單價。 */
export function lineSubtotal(line: StandardLine): number {
  return line.qty * line.price;
}

/** 金額合計 = 所有列金額之和。 */
export function grandTotal(form: StandardDoForm): number {
  return form.lines.reduce((sum, line) => sum + lineSubtotal(line), 0);
}

/** 總計 = 金額合計 + 稅額。 */
export function documentTotal(form: StandardDoForm): number {
  return grandTotal(form) + (form.taxAmount || 0);
}

/** 顯示用金額格式(千分位,最多兩位小數)。 */
export function formatMoney(value: number): string {
  return value.toLocaleString("zh-TW", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

/* ---------------------------------------------------------------- 日期 */

/**
 * 今日的民國年日期字串,格式「NNN 年 M 月 D 日」。
 * 民國年 = 西元年 − 1911。瀏覽器環境可正常使用 new Date()。
 */
export function todayRocDate(d: Date = new Date()): string {
  const roc = d.getFullYear() - 1911;
  return `${roc} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日`;
}

/* ---------------------------------------------------------------- 抬頭 / 空列 */

/** 空白抬頭(兩版共用)。 */
export function emptyHeader(): DoHeader {
  return {
    customerName: "",
    address: "",
    phone: "",
    orderNo: "",
    date: todayRocDate(),
    remark: "",
    carrier: "",
    vehicleNo: "",
    taxId: "",
    invoiceNo: "",
  };
}

/** 空白 metal 品項列(單價內部用、預設 0,不列印在出貨單)。 */
export function emptyMetalLine(): MetalLine {
  return { name: "", material: "", size: "", sheets: 0, weight: 0, price: 0 };
}

/** 空白 standard 品項列。 */
export function emptyStandardLine(): StandardLine {
  return { name: "", unit: "", qty: 0, price: 0 };
}

/* ---------------------------------------------------------------- 空白表單 */

/** 空白 metal 表單:一列空白品項、日期為今日民國年。 */
export function emptyMetalForm(): MetalDoForm {
  return {
    template: "metal",
    header: emptyHeader(),
    lines: [emptyMetalLine()],
    offsetX: 0,
    offsetY: 0,
  };
}

/** 空白 standard 表單:一列空白品項、稅額與 offset 皆為 0。 */
export function emptyStandardForm(): StandardDoForm {
  return {
    template: "standard",
    header: emptyHeader(),
    lines: [emptyStandardLine()],
    taxAmount: 0,
    offsetX: 0,
    offsetY: 0,
  };
}

/** 預設空白表單:metal 版(峻晟金屬)。 */
export function emptyDoForm(): DoForm {
  return emptyMetalForm();
}

/**
 * 切換版型,盡量保留抬頭與 offset。
 * lines 因欄位不同無法對應,故重設為單一空白列。
 */
export function switchTemplate(form: DoForm, template: DoForm["template"]): DoForm {
  if (form.template === template) return form;
  if (template === "metal") {
    return {
      template: "metal",
      header: form.header,
      lines: [emptyMetalLine()],
      offsetX: form.offsetX,
      offsetY: form.offsetY,
    };
  }
  return {
    template: "standard",
    header: form.header,
    lines: [emptyStandardLine()],
    taxAmount: 0,
    offsetX: form.offsetX,
    offsetY: form.offsetY,
  };
}
