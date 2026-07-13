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
  DEFAULT_PRINT_SETTINGS,
  MAX_MARGIN_MM,
  MAX_SCALE_PERCENT,
  MIN_SCALE_PERCENT,
  PAPER_HEIGHT_MM,
  PAPER_WIDTH_MM,
  SUGGEST_SLACK_MM,
  checkPrintableFit,
  clampMarginMm,
  clampScalePercent,
  contentEdgesMm,
  loadPrintPreviewForm,
  loadPrintSettings,
  offsetToMm,
  offsetTransform,
  pageRule,
  pageSizeMm,
  savePrintSettings,
  sheetTransform,
  suggestFit,
} from "../../lib/printLayout";
import styles from "./page.module.css";

/** 讀數一律顯示到小數第 2 位(mm)。 */
const mm = (v: number) => `${v.toFixed(2)} mm`;

type LoadState =
  | { kind: "loading" }
  | { kind: "empty" }
  | { kind: "ready"; form: DoForm };

export default function PrintPreviewPage() {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  // 本頁的即時微調(初值取自表單)。只影響本頁預覽/列印,不寫回開單頁。
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  // 列印方向 / 縮放(#32)。預設 = 不旋轉、100%,即與原本行為完全相同。
  const [rotate, setRotate] = useState(DEFAULT_PRINT_SETTINGS.rotate);
  // 縮放存「使用者打的字」,實際採用值再夾到 80–120%:
  // 直接把 state 夾住的話,打「85」會在按下 8 的當下被跳成 80,之後怎麼打都不對。
  const [scaleText, setScaleText] = useState(
    String(DEFAULT_PRINT_SETTINGS.scalePercent),
  );
  // 印表機的不可列印邊界(#33)。同樣存「使用者打的字」,理由同 scaleText。
  const [topText, setTopText] = useState(
    String(DEFAULT_PRINT_SETTINGS.printableTopMm),
  );
  const [bottomText, setBottomText] = useState(
    String(DEFAULT_PRINT_SETTINGS.printableBottomMm),
  );
  // localStorage 讀完之前不要寫回去,免得把使用者記住的設定洗成預設值。
  const [settingsLoaded, setSettingsLoaded] = useState(false);

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

  // 讀回上次的列印設定(旋轉 / 縮放 / 可列印邊界)。SSR 不能碰 localStorage,故放在 effect。
  useEffect(() => {
    const settings = loadPrintSettings();
    setRotate(settings.rotate);
    setScaleText(String(settings.scalePercent));
    setTopText(String(settings.printableTopMm));
    setBottomText(String(settings.printableBottomMm));
    setSettingsLoaded(true);
  }, []);

  // 實際採用的縮放:輸入框清空 / 亂打 → 100%,超出範圍 → 夾到 80–120%。
  const scalePercent = clampScalePercent(scaleText);
  // 實際採用的可列印邊界:清空 / 亂打 → 回實測預設值,超出範圍 → 夾到 0–60mm。
  const printableTopMm = clampMarginMm(
    topText,
    DEFAULT_PRINT_SETTINGS.printableTopMm,
  );
  const printableBottomMm = clampMarginMm(
    bottomText,
    DEFAULT_PRINT_SETTINGS.printableBottomMm,
  );

  // 記住設定,下次開本頁不必重設(存的是夾過的值)。
  useEffect(() => {
    if (!settingsLoaded) return;
    savePrintSettings({
      rotate,
      scalePercent,
      printableTopMm,
      printableBottomMm,
    });
  }, [settingsLoaded, rotate, scalePercent, printableTopMm, printableBottomMm]);

  // @page 與「列印時隱藏其他頁面元素」只在本頁生效:
  //   - @page 規則以 <style> 動態注入,離開本頁即移除(不污染其他路由的列印)。
  //     旋轉開關會把宣告的頁面尺寸換成直式(見 printLayout.pageRule)。
  //   - body 掛上 do-print-preview class,供 CSS module 的 @media print 規則定位。
  useEffect(() => {
    const style = document.createElement("style");
    style.dataset.printPreview = "";
    style.textContent = pageRule(rotate);
    document.head.appendChild(style);
    document.body.classList.add("do-print-preview");
    return () => {
      style.remove();
      document.body.classList.remove("do-print-preview");
    };
  }, [rotate]);

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
  // 紙張本身的 transform:旋轉 90° + 縮放,以紙張中心為原點(置中、不裁切)。
  const paperTransform = sheetTransform(rotate, scalePercent);
  const page = pageSizeMm(rotate);

  /* ---------------------------------------- 落點讀數 / 範圍檢查(#33) */

  const printWindow = useMemo(
    () => ({ topMm: printableTopMm, bottomMm: printableBottomMm }),
    [printableTopMm, printableBottomMm],
  );

  // 內容會落在頁面的哪一段(mm,自頁面頂端起算)。
  const edges = useMemo(
    () => contentEdgesMm({ scale: scalePercent, offsetX, offsetY, rotate }),
    [scalePercent, offsetX, offsetY, rotate],
  );

  // 有沒有超出印表機印得到的範圍。
  const fit = useMemo(
    () => checkPrintableFit(edges, printWindow),
    [edges, printWindow],
  );

  // 「自動建議」會給的那組值(先算好顯示,按了才套用)。
  const suggestion = useMemo(
    () => suggestFit(printWindow, rotate, offsetX),
    [printWindow, rotate, offsetX],
  );

  const applySuggestion = () => {
    setScaleText(String(suggestion.scalePercent));
    setOffsetY(suggestion.offsetY);
  };

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

        {/* 列印方向 / 縮放(#32):驅動不聽話時的補償手段。 */}
        <div className={styles.orientRow}>
          <label className={styles.switch} htmlFor="pp-rotate">
            <input
              id="pp-rotate"
              type="checkbox"
              className={styles.switchInput}
              checked={rotate}
              onChange={(e) => setRotate(e.target.checked)}
            />
            <span className={styles.switchTrack} aria-hidden />
            <span className={styles.switchText}>
              旋轉 90°
              <span className={styles.switchNote}>
                驅動把單子轉向、印成跨兩節時打開
              </span>
            </span>
          </label>

          <div className={styles.nudge}>
            <label className={styles.nudgeLabel} htmlFor="pp-scale">
              縮放 ({MIN_SCALE_PERCENT}–{MAX_SCALE_PERCENT}%)
            </label>
            <div className={styles.nudgeRow}>
              <input
                id="pp-scale"
                className={styles.nudgeInput}
                type="number"
                min={MIN_SCALE_PERCENT}
                max={MAX_SCALE_PERCENT}
                step={1}
                value={scaleText}
                onChange={(e) => setScaleText(e.target.value)}
                // 離開輸入框才把數值正規化(夾到 80–120、清空回 100),
                // 打字中途不動它,免得游標跳掉。
                onBlur={() => setScaleText(String(scalePercent))}
              />
              <span className={styles.nudgeMm}>%</span>
            </div>
          </div>

          <p className={styles.orientState}>
            列印頁面:<code>{page.widthMm} × {page.heightMm} mm</code>
            （{rotate ? "直式 + 內容轉 90°" : "橫式"}
            {scalePercent !== 100 ? `、縮放 ${scalePercent}%` : ""}）
          </p>
        </div>

        {/* 落點讀數 + 可列印範圍檢查 + 自動建議(#33)。 */}
        <div className={styles.fitPanel}>
          <div className={styles.fitRow}>
            {/* 讀數:內容會落在頁面的哪一段(mm,自頁面頂端起算)。 */}
            <dl className={styles.readout}>
              <div className={styles.readoutItem}>
                <dt>內容上緣</dt>
                <dd
                  className={fit.topClipMm > 0 ? styles.readoutBad : undefined}
                >
                  {mm(edges.topMm)}
                </dd>
              </div>
              <div className={styles.readoutItem}>
                <dt>內容下緣</dt>
                <dd
                  className={
                    fit.bottomClipMm > 0 ? styles.readoutBad : undefined
                  }
                >
                  {mm(edges.bottomMm)}
                </dd>
              </div>
              <div className={styles.readoutItem}>
                <dt>內容高度</dt>
                <dd>{mm(edges.heightMm)}</dd>
              </div>
              <div className={styles.readoutItem}>
                <dt>內容左緣</dt>
                <dd>{mm(edges.leftMm)}</dd>
              </div>
              <div className={styles.readoutItem}>
                <dt>內容右緣</dt>
                <dd>{mm(edges.rightMm)}</dd>
              </div>
              <div className={styles.readoutItem}>
                <dt>內容寬度</dt>
                <dd>{mm(edges.widthMm)}</dd>
              </div>
            </dl>

            {/* 可列印範圍:印表機印不到的上下邊界(每台不同,實測後填進來)。 */}
            <div className={styles.windowInputs}>
              <p className={styles.windowTitle}>
                可列印範圍
                <span className={styles.windowNote}>印表機印不到的邊界</span>
              </p>
              <div className={styles.windowRow}>
                <MarginInput
                  id="pp-printable-top"
                  label="上"
                  value={topText}
                  onChange={setTopText}
                  onBlur={() => setTopText(String(printableTopMm))}
                />
                <MarginInput
                  id="pp-printable-bottom"
                  label="下"
                  value={bottomText}
                  onChange={setBottomText}
                  onBlur={() => setBottomText(String(printableBottomMm))}
                />
              </div>
              <p className={styles.windowRange}>
                可印:<code>{mm(fit.printableTopMm)}</code> –{" "}
                <code>{mm(fit.printableBottomMm)}</code>(高{" "}
                {mm(fit.printableHeightMm)})
              </p>
            </div>
          </div>

          {/* 警告 / OK:把「要不要試印」這件事變成螢幕上就能看的檢查。 */}
          {fit.ok ? (
            <p className={`${styles.fitStatus} ${styles.fitOk}`} role="status">
              ✓　內容完全落在可列印範圍內（上緣還有{" "}
              {mm(edges.topMm - fit.printableTopMm)}、下緣還有{" "}
              {mm(fit.printableBottomMm - edges.bottomMm)} 餘裕）。
            </p>
          ) : (
            <p className={`${styles.fitStatus} ${styles.fitWarn}`} role="alert">
              ⚠️
              {fit.topClipMm > 0 && (
                <>
                  　<strong>上緣會被裁掉 {mm(fit.topClipMm)}</strong> —
                  請降低縮放或加大 Y。
                </>
              )}
              {fit.bottomClipMm > 0 && (
                <>
                  　<strong>下緣會被裁掉 {mm(fit.bottomClipMm)}</strong> —
                  請降低縮放或減小 Y。
                </>
              )}
              {fit.topClipMm > 0 && fit.bottomClipMm > 0 && (
                <>
                  　內容比可列印範圍還高,單靠移動 Y 救不回來 ——
                  <strong>一定要縮小</strong>。
                </>
              )}
            </p>
          )}

          {/* 自動建議:直接算出一組塞得進可列印範圍的縮放 + Y。 */}
          <div className={styles.suggestRow}>
            <button
              type="button"
              className={styles.suggestBtn}
              onClick={applySuggestion}
              disabled={!suggestion.fits}
            >
              ✨　自動建議
            </button>
            {suggestion.fits ? (
              <p className={styles.suggestText}>
                建議 <strong>縮放 {suggestion.scalePercent}%</strong> +{" "}
                <strong>Y {suggestion.offsetY}</strong> → 內容落在{" "}
                <code>{mm(suggestion.edges.topMm)}</code> –{" "}
                <code>{mm(suggestion.edges.bottomMm)}</code>,置中於可列印範圍
                (上下各留約 {SUGGEST_SLACK_MM / 2} mm 餘裕)。
              </p>
            ) : (
              <p className={styles.suggestText}>
                連縮到 {MIN_SCALE_PERCENT}% 都塞不進這個可列印範圍 ——
                請確認上下邊界是不是填錯了。
              </p>
            )}
          </div>
        </div>

        <p className={styles.hint}>
          此頁走<strong>瀏覽器列印</strong>,不需要本機 print agent。按下列印會跳出
          <strong>系統列印對話框</strong>(瀏覽器無法靜默列印):請選
          <strong> EPSON LQ-310(原廠驅動)</strong>,
          <em>不要</em>選 Generic / Text Only(那是 agent 路徑用的 raw 佇列)。
          紙張請設 <code>215.9 × 139.7 mm</code>(中一刀)、邊界 <code>無/None</code>、
          並關閉「頁首及頁尾」與「縮放/符合頁面」,才能 1:1 對位。
        </p>

        <PrintChecklist />
      </div>

      {/* 紙張:實體尺寸容器。DoPreview 以 cqw 縮放,放進 215.9mm 寬的容器即為真實比例。
          .sheet = 實際頁面框(旋轉時變直式);.paper 以中心為原點旋轉/縮放,
          轉 90° 後的外框正好 = 直式頁面,故置中且不會被裁切。 */}
      <div className={styles.stage}>
        <div
          className={`${styles.sheet} ${rotate ? styles.sheetPortrait : ""}`}
        >
          <div className={styles.paper} style={{ transform: paperTransform }}>
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

          {/* 可列印範圍(#33):畫在**頁面框**上(不是紙張上)—— 這是印表機的硬體
              限制,不會跟著紙張一起縮放/旋轉。橘色實線 = 印得到的上下界,
              斜線區 = 印不到的地方。僅螢幕顯示。 */}
          <div className={styles.pageGuides} aria-hidden>
            <span
              className={styles.guideDead}
              style={{ top: 0, height: `${printableTopMm}mm` }}
            />
            <span
              className={styles.guideDead}
              style={{ bottom: 0, height: `${printableBottomMm}mm` }}
            />
            <span
              className={styles.guidePrintable}
              style={{
                top: `${printableTopMm}mm`,
                bottom: `${printableBottomMm}mm`,
              }}
            />
          </div>
        </div>

        <p className={styles.stageNote}>
          送貨單 {PAPER_WIDTH_MM} × {PAPER_HEIGHT_MM} mm(中一刀 8.5&quot; ×
          5.5&quot; 橫式)
          {rotate
            ? `,已轉 90° 印在直式 ${page.widthMm} × ${page.heightMm} mm 頁面上`
            : ""}
          。綠色虛線 = 紙張邊界與安全邊界;
          <span className={styles.stageNoteWindow}>橘色實線 = 可列印範圍</span>
          (斜線區印表機印不到)。皆僅螢幕顯示,不會印出。
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------ 列印設定指引(#32) */

/**
 * 真正的解法在驅動端:建立「中一刀」自訂表單。沒有它,Chrome 會退回預設直式紙
 * 並自動把橫式頁面轉 90°,內容就會跨到下一節。這份清單照著設定一次即可。
 */
function PrintChecklist() {
  return (
    <details className={styles.checklist}>
      <summary className={styles.checklistSummary}>
        🖨　印出來歪掉 / 跨兩節?先照這份「列印設定」設一次
      </summary>

      <div className={styles.checklistBody}>
        <ol className={styles.checklistSteps}>
          <li>
            <strong>Windows:建立「中一刀」表單</strong>
            <br />
            控制台 → 裝置和印表機 → 列印伺服器內容 → 表單 → 勾「建立新表單」,
            名稱 <code>中一刀</code>,寬 <code>21.59 cm</code> × 高{" "}
            <code>13.97 cm</code>,四邊邊界皆 <code>0</code> → 儲存表單。
          </li>
          <li>
            <strong>LQ-310 列印喜好設定</strong>
            <br />
            紙張大小 = <code>中一刀</code>。
          </li>
          <li>
            <strong>Chrome 列印對話框</strong>
            <br />
            紙張大小 = <code>中一刀</code>、邊界 = <code>無</code>、縮放 ={" "}
            <code>100%</code>(不要用「符合頁面」)、
            <code>背景圖形</code> 勾選、<code>頁首及頁尾</code> 取消。
          </li>
          <li>
            <strong>還是被轉向?</strong>
            <br />
            打開上方的「<strong>旋轉 90°</strong>」開關 ——
            會改用直式頁面並把單子轉 90° 印,補償驅動的強制轉向。
          </li>
        </ol>

        <p className={styles.checklistWhy}>
          原因:驅動裡沒有相符的自訂紙張時,Chrome 會退回預設直式紙張,並把我們
          宣告的橫式頁面自動轉 90° —— 轉完之後內容沿走紙方向長 215.9 mm,超過一節
          139.7 mm 的表單長度,就會跨到下一節。
        </p>
      </div>
    </details>
  );
}

/* ------------------------------------------- 可列印邊界輸入(#33) */

interface MarginInputProps {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  onBlur: () => void;
}

/** 上 / 下不可列印邊界(mm)。存字串,離開輸入框才正規化(理由同縮放輸入框)。 */
function MarginInput({ id, label, value, onChange, onBlur }: MarginInputProps) {
  return (
    <div className={styles.marginField}>
      <label className={styles.marginLabel} htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className={styles.nudgeInput}
        type="number"
        min={0}
        max={MAX_MARGIN_MM}
        step={0.5}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
      />
      <span className={styles.marginUnit}>mm</span>
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
