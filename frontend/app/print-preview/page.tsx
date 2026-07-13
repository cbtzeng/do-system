"use client";

// 新分頁列印預覽(Issue #K)—— 瀏覽器直印,不需要本機 print agent。
//
// 這是**第二條**列印路徑,與既有的 agent 圖形列印(預覽 → PNG → localhost:9100)並存:
//   - 開單頁按「在新分頁開啟列印預覽」→ 把 DoForm 寫進 localStorage → window.open("/print-preview")
//   - 本頁讀回表單,以**中一刀實體尺寸**(215.9 × 139.7 mm)渲染,套用 X/Y 微調,
//     按「列印」呼叫 window.print(),由使用者在系統對話框選 EPSON LQ-310(需原廠驅動)。
//
// 不改動 DoPreview:傳進去的 form 把 offset 歸零(避免與本頁的 mm 位移重複),
// 位移改由外層 .shift 以 mm 平移 —— 列印時才是真實的紙上位移。

import { useEffect, useMemo, useState } from "react";
import DoPreview from "../../components/DoPreview";
import type { DoForm } from "../../lib/contract";
import {
  PAPER_HEIGHT_MM,
  PAPER_WIDTH_MM,
  loadPrintPreviewForm,
  offsetToMm,
  offsetTransform,
} from "../../lib/printLayout";
import styles from "./page.module.css";

type LoadState =
  | { kind: "loading" }
  | { kind: "empty" }
  | { kind: "ready"; form: DoForm };

export default function PrintPreviewPage() {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  // 本頁的即時微調(初值取自表單)。只影響本頁預覽/列印,不寫回開單頁。
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);

  // 掛載時從 localStorage 讀回表單(新分頁不共用 sessionStorage,故用 localStorage)。
  useEffect(() => {
    const form = loadPrintPreviewForm();
    if (!form) {
      setState({ kind: "empty" });
      return;
    }
    setOffsetX(form.offsetX || 0);
    setOffsetY(form.offsetY || 0);
    setState({ kind: "ready", form });
  }, []);

  // @page 與「列印時隱藏其他頁面元素」只在本頁生效:
  //   - @page 規則以 <style> 動態注入,離開本頁即移除(不污染其他路由的列印)。
  //   - body 掛上 do-print-preview class,供 CSS module 的 @media print 規則定位。
  useEffect(() => {
    const style = document.createElement("style");
    style.dataset.printPreview = "";
    style.textContent = `@page { size: ${PAPER_WIDTH_MM}mm ${PAPER_HEIGHT_MM}mm; margin: 0; }`;
    document.head.appendChild(style);
    document.body.classList.add("do-print-preview");
    return () => {
      style.remove();
      document.body.classList.remove("do-print-preview");
    };
  }, []);

  // 送進 DoPreview 的表單:offset 歸零,避免 DoPreview 內建的 px 平移與本頁 mm 平移疊加。
  const sheetForm = useMemo<DoForm | null>(
    () =>
      state.kind === "ready"
        ? { ...state.form, offsetX: 0, offsetY: 0 }
        : null,
    [state],
  );

  const transform = offsetTransform(offsetX, offsetY);
  const { xMm, yMm } = offsetToMm(offsetX, offsetY);

  if (state.kind === "loading") {
    return (
      <div className={styles.page}>
        <p className={styles.notice}>載入中…</p>
      </div>
    );
  }

  if (state.kind === "empty" || !sheetForm) {
    return (
      <div className={styles.page}>
        <div className={styles.notice}>
          <h1 className={styles.noticeTitle}>沒有可預覽的送貨單</h1>
          <p>
            請從<strong>開單頁</strong>按「在新分頁開啟列印預覽」開啟本頁。
          </p>
          <a className={styles.noticeLink} href="/">
            ← 回開單頁
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      {/* 螢幕專用工具列(列印時隱藏) */}
      <div className={styles.toolbar}>
        <div className={styles.toolbarMain}>
          <button
            type="button"
            className={styles.printBtn}
            onClick={() => window.print()}
          >
            🖨　用瀏覽器列印
          </button>

          <div className={styles.nudges}>
            <Nudge
              id="pp-offset-x"
              label="X 微調 (1/60 吋)"
              value={offsetX}
              onChange={setOffsetX}
              mm={xMm}
            />
            <Nudge
              id="pp-offset-y"
              label="Y 微調 (1/180 吋)"
              value={offsetY}
              onChange={setOffsetY}
              mm={yMm}
            />
          </div>

          <button
            type="button"
            className={styles.resetBtn}
            onClick={() => {
              setOffsetX(0);
              setOffsetY(0);
            }}
          >
            歸零
          </button>
        </div>

        <p className={styles.hint}>
          此頁走<strong>瀏覽器列印</strong>,不需要本機 print agent。按下列印會跳出
          <strong>系統列印對話框</strong>(瀏覽器無法靜默列印):請選
          <strong> EPSON LQ-310(原廠驅動)</strong>,
          <em>不要</em>選 Generic / Text Only(那是 agent 路徑用的 raw 佇列)。
          紙張請設 <code>215.9 × 139.7 mm</code>(中一刀)、邊界 <code>無/None</code>、
          並關閉「頁首及頁尾」與「縮放/符合頁面」,才能 1:1 對位。
        </p>
      </div>

      {/* 紙張:實體尺寸容器。DoPreview 以 cqw 縮放,放進 215.9mm 寬的容器即為真實比例。 */}
      <div className={styles.stage}>
        <div className={styles.paper}>
          <div className={styles.shift} style={{ transform }}>
            <DoPreview form={sheetForm} />
          </div>

          {/* 紙張邊界 / 中線輔助線:僅螢幕顯示,列印時隱藏。 */}
          <div className={styles.guides} aria-hidden>
            <span className={styles.guideEdge} />
            <span className={styles.guideSafe} />
            <span className={styles.guideVCenter} />
            <span className={styles.guideHCenter} />
          </div>
        </div>

        <p className={styles.stageNote}>
          紙張 {PAPER_WIDTH_MM} × {PAPER_HEIGHT_MM} mm(中一刀 8.5&quot; × 5.5&quot;
          橫式)。虛線 = 紙張邊界與安全邊界,僅螢幕顯示,不會印出。
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ 微調輸入 */

interface NudgeProps {
  id: string;
  label: string;
  value: number;
  mm: number;
  onChange: (v: number) => void;
}

/** X/Y 即時微調:數字輸入 + 加減按鈕,改動即時反映在紙上位移。 */
function Nudge({ id, label, value, mm, onChange }: NudgeProps) {
  const step = (d: number) => onChange(value + d);
  return (
    <div className={styles.nudge}>
      <label className={styles.nudgeLabel} htmlFor={id}>
        {label}
      </label>
      <div className={styles.nudgeRow}>
        <button
          type="button"
          className={styles.stepBtn}
          onClick={() => step(-1)}
          aria-label={`${label} 減 1`}
        >
          −
        </button>
        <input
          id={id}
          className={styles.nudgeInput}
          type="number"
          value={value}
          onChange={(e) => {
            const n = Number(e.target.value);
            onChange(Number.isFinite(n) ? n : 0);
          }}
        />
        <button
          type="button"
          className={styles.stepBtn}
          onClick={() => step(1)}
          aria-label={`${label} 加 1`}
        >
          ＋
        </button>
        <span className={styles.nudgeMm}>{mm.toFixed(2)} mm</span>
      </div>
    </div>
  );
}
