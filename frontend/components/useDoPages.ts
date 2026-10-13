"use client";

// 出貨單分頁量測。
//
// 呼叫端在畫面外放一份量測用的 <DoPreview measure />(寬度 = 實際列印寬度 215.9mm,
// cqw 字級與列印時完全相同),把容器 ref 交給本 hook。本 hook 在每次表單變動 /
// 字型載入完成後量:
//   - area:表格區(抬頭與底部之間)的下緣
//   - row :每一列品項的頂端 → 相鄰相減 = 該列實際高度(含換行)
//   - pad :兩列量尺空白列 → 空白列高度
//   - after:standard 版跟在表格下的備註/金額框高度
// 再交給 lib/paginate 算出每頁的品項範圍。
//
// 用 useLayoutEffect:表單變動後在瀏覽器繪製前就重算完,不會閃一下舊分頁。

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { DoForm } from "../lib/contract";
import {
  fitPagesToLines,
  paginate,
  singlePage,
  type DoPage,
  type PageMetrics,
} from "../lib/paginate";
import { minRowsFor } from "./DoPreview";

/**
 * 安全餘裕(px)。量測與實際列印同一排版引擎、同一寬度(實測螢幕與列印量到的值完全相同),
 * 誤差只有次像素等級;留 2px 吸收捨入誤差即可。
 * 不能留太多:原本 8 列空白單只剩約 4.5px 餘裕,餘裕一大就會被擠成 7 列。
 */
const SAFETY_PX = 2;

const top = (el: Element) => el.getBoundingClientRect().top;

/** 從量測用 DoPreview 讀出分頁需要的尺寸;結構不對(尚未 render)回 null。 */
export function measureDoSheet(root: HTMLElement): PageMetrics | null {
  const area = root.querySelector<HTMLElement>('[data-pg="area"]');
  const pads = root.querySelectorAll('[data-pg="pad"]');
  if (!area || pads.length < 2) return null;
  const rows = Array.from(root.querySelectorAll('[data-pg="row"]'));
  const after = root.querySelector<HTMLElement>('[data-pg="after"]');

  const areaStyle = getComputedStyle(area);
  const areaBottom =
    area.getBoundingClientRect().bottom -
    parseFloat(areaStyle.paddingBottom) -
    parseFloat(areaStyle.borderBottomWidth);

  // 每列高度 = 下一列頂端 − 本列頂端(border-collapse 下,列與列共用一條框線)。
  const tops = [...rows, pads[0]].map(top);
  const rowHeights = rows.map((_, i) => tops[i + 1] - tops[i]);
  const padHeight = top(pads[1]) - top(pads[0]);
  const firstTop = tops[0];
  const afterHeight = after ? after.getBoundingClientRect().height : 0;

  // 最後一列的下框線(約 1px)不含在列高裡,一併扣掉。
  const capacity = areaBottom - firstTop - afterHeight - 1 - SAFETY_PX;

  return { rowHeights, capacity, padHeight };
}

function samePages(a: DoPage[] | null, b: DoPage[]): boolean {
  return (
    a != null &&
    a.length === b.length &&
    a.every((p, i) => p.start === b[i].start && p.end === b[i].end && p.pad === b[i].pad)
  );
}

/**
 * 回傳 { pages, measureRef }:measureRef 掛在量測用 DoPreview 的容器上。
 * 尚未量測(SSR / 首次 render)時退回單頁(與分頁前行為相同)。
 */
export function useDoPages(form: DoForm) {
  const measureRef = useRef<HTMLDivElement>(null);
  const minRows = minRowsFor(form.template);
  const [measured, setMeasured] = useState<DoPage[] | null>(null);
  // 字型(Geist Mono / 中文字型)載入完成會改變字寬 → 換行 → 列高,需重量。
  const [fontTick, setFontTick] = useState(0);

  useEffect(() => {
    const fonts = document.fonts;
    if (!fonts) return;
    let alive = true;
    const bump = () => {
      if (alive) setFontTick((t) => t + 1);
    };
    fonts.ready.then(bump);
    fonts.addEventListener("loadingdone", bump);
    return () => {
      alive = false;
      fonts.removeEventListener("loadingdone", bump);
    };
  }, []);

  useLayoutEffect(() => {
    const root = measureRef.current;
    if (!root) return;
    const metrics = measureDoSheet(root);
    if (!metrics) return;
    const next = paginate(metrics, minRows);
    setMeasured((prev) => (samePages(prev, next) ? prev : next));
  }, [form, minRows, fontTick]);

  const pages = measured
    ? fitPagesToLines(measured, form.lines.length)
    : singlePage(form.lines.length, minRows);

  return { pages, measureRef };
}
