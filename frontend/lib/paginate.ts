// 出貨單分頁(純函式)。
//
// 問題:品項太多(超過預設列數)或單列字太多(換行把列撐高)時,表格會超出一張
// 中一刀的範圍 → 下面的列被裁掉、或壓到承運車行/簽章。
//
// 解法:先在畫面外以**實際列印寬度**(215.9mm)量出
//   - 每一列品項的實際高度(含換行)
//   - 一張單上表格列可用的高度(扣掉抬頭、表頭、底部)
//   - 一列空白列的高度
// 再交給本檔的 paginate() 依序裝箱,算出每一頁放哪幾列、最後一頁補幾列空白列。
// 量測在 DoPreview / PrintPreviewPanel 端做,本檔只做數學(可單元測試)。

/** 一頁要印的品項範圍 [start, end) + 該頁補的空白列數。 */
export interface DoPage {
  start: number;
  end: number;
  pad: number;
}

/** 量測結果(單位不拘,全部同一單位即可;實作上是 px)。 */
export interface PageMetrics {
  /** 每一列品項的高度(依 lines 順序)。 */
  rowHeights: number[];
  /** 一張單上表格列(tbody)可用的總高度(已扣安全餘裕)。 */
  capacity: number;
  /** 一列空白列的高度。 */
  padHeight: number;
}

/**
 * 依量測結果把品項分頁。
 *
 * - 依序裝箱:放得下就放,放不下就換頁。每頁至少放一列(單列高過整頁時也不會無限迴圈,
 *   只是那一列會被表格區裁切 —— 正常輸入不會發生)。
 * - 只有最後一頁補空白列:補到 minRows 列為止,但不超過剩餘空間能放的數量,
 *   所以補白永遠不會把表格撐出範圍。
 * - 沒有任何品項時仍回傳一頁(空白單)。
 */
export function paginate(metrics: PageMetrics, minRows: number): DoPage[] {
  const { rowHeights, capacity, padHeight } = metrics;
  const pages: DoPage[] = [];
  let start = 0;
  let used = 0;

  rowHeights.forEach((h, i) => {
    if (i > start && used + h > capacity) {
      pages.push({ start, end: i, pad: 0 });
      start = i;
      used = 0;
    }
    used += h;
  });

  const end = rowHeights.length;
  const remaining = capacity - used;
  const padFit = padHeight > 0 ? Math.max(0, Math.floor(remaining / padHeight)) : 0;
  const pad = Math.min(padFit, Math.max(0, minRows - (end - start)));
  pages.push({ start, end, pad });
  return pages;
}

/**
 * 尚未量測(SSR / 首次 render)時的預設:單頁、全部品項、補到 minRows。
 * 與加入分頁前的行為相同。
 */
export function singlePage(lineCount: number, minRows: number): DoPage[] {
  return [{ start: 0, end: lineCount, pad: Math.max(0, minRows - lineCount) }];
}

/**
 * 表單變動後、重新量測前的那一次 render:舊分頁的範圍可能對不上新的品項數。
 * 夾到合法範圍,並讓最後一頁一律收到最後一列(新增的品項不會消失)。
 */
export function fitPagesToLines(pages: DoPage[], lineCount: number): DoPage[] {
  const out: DoPage[] = [];
  for (const p of pages) {
    const start = Math.min(p.start, lineCount);
    if (out.length > 0 && start >= lineCount) break;
    out.push({ start, end: Math.min(p.end, lineCount), pad: p.pad });
  }
  if (out.length === 0) out.push({ start: 0, end: lineCount, pad: 0 });
  out[out.length - 1] = { ...out[out.length - 1], end: lineCount };
  return out;
}

/** 頁碼文字:第 1/3 頁。 */
export function pageLabel(index: number, total: number): string {
  return `第 ${index + 1}/${total} 頁`;
}
