"use client";

// 內嵌列印預覽面板(Issue #L)—— 由 #K 的獨立 /print-preview 頁抽出的共用元件。
//
// 一份實作、兩處使用:
//   - 首頁 `/`:直接吃即時表單狀態(不經 localStorage),取代舊的 DoPreview + agent 列印控制項。
//   - `/print-preview`:路由先從 localStorage 讀回表單,再把它交給本元件。
//
// 列印隔離(關鍵):把「要印的那張紙」用 React portal 掛到 <body> 下的 .printRoot,
// 搭配全域列印樣式 `@media print { body > *:not(.printRoot){ display:none } .printRoot{ display:block } }`。
// 用 display:none(非 visibility)—— 被隱藏的元素不佔版面,才不會多印一張空白頁。
// 螢幕上另有一份「可互動」的紙(含輔助線)供對位;portal 那份只在列印時現身,
// 兩份共用同一組 form + 設定,確保所見即所印。
//
// 座標/縮放/旋轉數學一律沿用 lib/printLayout(不重寫)。

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import DoPreview from "./DoPreview";
import type { DoForm } from "../lib/contract";
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
  feedAxis,
  loadPrintSettings,
  offsetToMm,
  offsetTransform,
  pageRule,
  pageSizeMm,
  savePrintSettings,
  sheetTransform,
  suggestFit,
} from "../lib/printLayout";
import styles from "./PrintPreviewPanel.module.css";

/** 讀數一律顯示到小數第 2 位(mm)。 */
const mm = (v: number) => `${v.toFixed(2)} mm`;

interface PrintPreviewPanelProps {
  form: DoForm;
}

export default function PrintPreviewPanel({ form }: PrintPreviewPanelProps) {
  // X/Y 微調(對位用):初值取自傳入的表單(僅初始化一次,之後由本面板自行管理,
  // 避免使用者在編輯區打字時把已對好的位移洗掉)。
  const [offsetX, setOffsetX] = useState(() => form.offsetX || 0);
  const [offsetY, setOffsetY] = useState(() => form.offsetY || 0);
  // 列印方向 / 縮放(#32)。預設 = 不旋轉、100%。
  const [rotate, setRotate] = useState(DEFAULT_PRINT_SETTINGS.rotate);
  // 縮放/邊界存「使用者打的字」,採用值再夾到範圍(直接夾 state 會讓打字中途跳掉)。
  const [scaleText, setScaleText] = useState(
    String(DEFAULT_PRINT_SETTINGS.scalePercent),
  );
  const [topText, setTopText] = useState(
    String(DEFAULT_PRINT_SETTINGS.printableTopMm),
  );
  const [bottomText, setBottomText] = useState(
    String(DEFAULT_PRINT_SETTINGS.printableBottomMm),
  );
  // localStorage 讀完之前不要寫回去,免得把使用者記住的設定洗成預設值。
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  // 列印目標的 portal 容器:掛在 <body> 下的 .printRoot(全域 class,供列印隔離 CSS 定位)。
  const [portalEl, setPortalEl] = useState<HTMLElement | null>(null);

  // 讀回上次的列印設定(旋轉 / 縮放 / 可列印邊界)。SSR 不能碰 localStorage,故放在 effect。
  useEffect(() => {
    const settings = loadPrintSettings();
    setRotate(settings.rotate);
    setScaleText(String(settings.scalePercent));
    setTopText(String(settings.printableTopMm));
    setBottomText(String(settings.printableBottomMm));
    setSettingsLoaded(true);
  }, []);

  // 建立 / 卸載 portal 容器(.printRoot)。用純字串 class,配合全域列印 CSS。
  useEffect(() => {
    const el = document.createElement("div");
    el.className = "printRoot";
    document.body.appendChild(el);
    setPortalEl(el);
    return () => {
      el.remove();
      setPortalEl(null);
    };
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

  // 記住設定,下次再開不必重設(存的是夾過的值)。
  useEffect(() => {
    if (!settingsLoaded) return;
    savePrintSettings({
      rotate,
      scalePercent,
      printableTopMm,
      printableBottomMm,
    });
  }, [settingsLoaded, rotate, scalePercent, printableTopMm, printableBottomMm]);

  // @page 規則以 <style> 動態注入,離開即移除(不污染其他路由的列印)。
  // 旋轉開關會把宣告的頁面尺寸換成直式(見 printLayout.pageRule)。
  useEffect(() => {
    const style = document.createElement("style");
    style.dataset.printPreview = "";
    style.textContent = pageRule(rotate);
    document.head.appendChild(style);
    return () => {
      style.remove();
    };
  }, [rotate]);

  // 送進 DoPreview 的表單:offset 歸零,避免 DoPreview 內建的 px 平移與本面板的 mm 平移疊加。
  const sheetForm = useMemo<DoForm>(
    () => ({ ...form, offsetX: 0, offsetY: 0 }),
    [form],
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

  const edges = useMemo(
    () => contentEdgesMm({ scale: scalePercent, offsetX, offsetY, rotate }),
    [scalePercent, offsetX, offsetY, rotate],
  );

  const fit = useMemo(
    () => checkPrintableFit(edges, printWindow),
    [edges, printWindow],
  );

  const suggestion = useMemo(
    () => suggestFit(printWindow, rotate, { offsetX, offsetY }),
    [printWindow, rotate, offsetX, offsetY],
  );

  const applySuggestion = () => {
    setScaleText(String(suggestion.scalePercent));
    setOffsetX(suggestion.offsetX);
    setOffsetY(suggestion.offsetY);
  };

  // 走紙方向(上下)是由哪一個微調在推?旋轉 90° 時 X/Y 會互換(見 pageOffsetMm)。
  const feedLabel = feedAxis(rotate) === "x" ? "X" : "Y";

  // 列印目標:只有紙張本身(無工具列、無輔助線)。portal 到 body 下的 .printRoot,
  // 列印時由全域 CSS 顯示、其餘 body 子節點隱藏。
  const printTarget = (
    <div className={styles.printStage}>
      <div className={`${styles.sheet} ${rotate ? styles.sheetPortrait : ""}`}>
        <div className={styles.paper} style={{ transform: paperTransform }}>
          <div className={styles.shift} style={{ transform }}>
            <DoPreview form={sheetForm} />
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className={styles.panel}>
      {/* 螢幕專用工具列(列印時整個 body 子樹被隱藏,不會印出) */}
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
              {rotate && (
                <p className={styles.axisNote}>
                  ⚠️ 已旋轉 90°:單子跟著轉,<strong>X 微調</strong>
                  才是上下移動(Y 變成左右移)。
                </p>
              )}
            </div>
          </div>

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
                  請降低縮放或加大 {feedLabel}。
                </>
              )}
              {fit.bottomClipMm > 0 && (
                <>
                  　<strong>下緣會被裁掉 {mm(fit.bottomClipMm)}</strong> —
                  請降低縮放或減小 {feedLabel}。
                </>
              )}
              {fit.topClipMm > 0 && fit.bottomClipMm > 0 && (
                <>
                  　內容比可列印範圍還高,單靠移動 {feedLabel} 救不回來 ——
                  <strong>一定要縮小</strong>。
                </>
              )}
            </p>
          )}

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
                <strong>
                  {suggestion.axis === "x"
                    ? `X ${suggestion.offsetX}`
                    : `Y ${suggestion.offsetY}`}
                </strong>{" "}
                → 內容落在 <code>{mm(suggestion.edges.topMm)}</code> –{" "}
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
          此面板走<strong>瀏覽器列印</strong>,不需要本機 print agent。按下列印會跳出
          <strong>系統列印對話框</strong>(瀏覽器無法靜默列印):請選
          <strong> EPSON LQ-310(原廠驅動)</strong>,
          <em>不要</em>選 Generic / Text Only(那是 agent 路徑用的 raw 佇列)。
          紙張請設 <code>215.9 × 139.7 mm</code>(中一刀)、邊界 <code>無/None</code>、
          並關閉「頁首及頁尾」與「縮放/符合頁面」,才能 1:1 對位。
        </p>

        <PrintChecklist />
      </div>

      {/* 螢幕上的「可互動」紙:實體尺寸容器 + 輔助線,供對位。列印時整個 body 子樹隱藏。 */}
      <div className={styles.stage}>
        <div
          className={`${styles.sheet} ${rotate ? styles.sheetPortrait : ""}`}
        >
          <div className={styles.paper} style={{ transform: paperTransform }}>
            <div className={styles.shift} style={{ transform }}>
              <DoPreview form={sheetForm} />
            </div>

            {/* 紙張邊界 / 中線輔助線:僅螢幕顯示。 */}
            <div className={styles.guides} aria-hidden>
              <span className={styles.guideEdge} />
              <span className={styles.guideSafe} />
              <span className={styles.guideVCenter} />
              <span className={styles.guideHCenter} />
            </div>
          </div>

          {/* 可列印範圍(#33):畫在**頁面框**上(不隨紙張縮放/旋轉)。僅螢幕顯示。 */}
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

      {/* 列印目標:portal 到 body 下的 .printRoot(螢幕隱藏、列印顯示)。 */}
      {portalEl ? createPortal(printTarget, portalEl) : null}
    </div>
  );
}

/* ------------------------------------------------ 列印設定指引(#32) */

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
