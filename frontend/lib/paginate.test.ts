import { describe, expect, it } from "vitest";
import { fitPagesToLines, pageLabel, paginate, singlePage } from "./paginate";

describe("paginate", () => {
  it("沒有品項 → 一頁空白單,補到 minRows", () => {
    expect(paginate({ rowHeights: [], capacity: 100, padHeight: 10 }, 8)).toEqual([
      { start: 0, end: 0, pad: 8 },
    ]);
  });

  it("放得下 → 單頁,補白補到 minRows", () => {
    expect(
      paginate({ rowHeights: [10, 10, 10], capacity: 100, padHeight: 10 }, 8),
    ).toEqual([{ start: 0, end: 3, pad: 5 }]);
  });

  it("補白不超過剩餘空間(換行把列撐高時不會補到溢出)", () => {
    // 3 列各 25(換行),剩 25 → 只能補 2 列空白(而不是 5 列)。
    expect(
      paginate({ rowHeights: [25, 25, 25], capacity: 100, padHeight: 10 }, 8),
    ).toEqual([{ start: 0, end: 3, pad: 2 }]);
  });

  it("超出 → 分頁,非最後一頁不補白", () => {
    const rowHeights = Array.from({ length: 11 }, () => 10);
    expect(paginate({ rowHeights, capacity: 80, padHeight: 10 }, 8)).toEqual([
      { start: 0, end: 8, pad: 0 },
      { start: 8, end: 11, pad: 5 },
    ]);
  });

  it("剛好塞滿 → 不多出空白頁", () => {
    const rowHeights = Array.from({ length: 8 }, () => 10);
    expect(paginate({ rowHeights, capacity: 80, padHeight: 10 }, 8)).toEqual([
      { start: 0, end: 8, pad: 0 },
    ]);
  });

  it("高的列(換行)提早換頁", () => {
    expect(
      paginate({ rowHeights: [10, 30, 30, 30, 10], capacity: 80, padHeight: 10 }, 8),
    ).toEqual([
      { start: 0, end: 3, pad: 0 },
      { start: 3, end: 5, pad: 4 },
    ]);
  });

  it("單列高過整頁 → 自己一頁,不會無限迴圈", () => {
    expect(
      paginate({ rowHeights: [10, 200, 10], capacity: 80, padHeight: 10 }, 8),
    ).toEqual([
      { start: 0, end: 1, pad: 0 },
      { start: 1, end: 2, pad: 0 },
      { start: 2, end: 3, pad: 7 },
    ]);
  });

  it("每一頁的列高總和都不超過可用高度", () => {
    const rowHeights = [12, 31, 12, 12, 47, 12, 31, 12, 12, 12, 31, 12, 12, 12, 12, 31];
    const capacity = 100;
    const pages = paginate({ rowHeights, capacity, padHeight: 12 }, 8);
    for (const p of pages) {
      const used = rowHeights.slice(p.start, p.end).reduce((a, b) => a + b, 0);
      expect(used + p.pad * 12).toBeLessThanOrEqual(capacity);
    }
    // 頁與頁之間連續、涵蓋全部品項。
    expect(pages[0].start).toBe(0);
    expect(pages[pages.length - 1].end).toBe(rowHeights.length);
    for (let i = 1; i < pages.length; i++) {
      expect(pages[i].start).toBe(pages[i - 1].end);
    }
  });
});

describe("singlePage", () => {
  it("未量測時 = 單頁 + 補到 minRows", () => {
    expect(singlePage(3, 8)).toEqual([{ start: 0, end: 3, pad: 5 }]);
    expect(singlePage(10, 8)).toEqual([{ start: 0, end: 10, pad: 0 }]);
  });
});

describe("fitPagesToLines", () => {
  const pages = [
    { start: 0, end: 8, pad: 0 },
    { start: 8, end: 11, pad: 5 },
  ];

  it("新增品項 → 最後一頁收到最後一列", () => {
    expect(fitPagesToLines(pages, 12)).toEqual([
      { start: 0, end: 8, pad: 0 },
      { start: 8, end: 12, pad: 5 },
    ]);
  });

  it("刪掉品項 → 丟掉多出的頁", () => {
    expect(fitPagesToLines(pages, 5)).toEqual([{ start: 0, end: 5, pad: 0 }]);
  });

  it("全部刪光 → 仍有一頁", () => {
    expect(fitPagesToLines(pages, 0)).toEqual([{ start: 0, end: 0, pad: 0 }]);
  });
});

describe("pageLabel", () => {
  it("第 i/n 頁", () => {
    expect(pageLabel(0, 3)).toBe("第 1/3 頁");
    expect(pageLabel(2, 3)).toBe("第 3/3 頁");
  });
});
