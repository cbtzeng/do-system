"use client";

import { useEffect, useState, type RefObject } from "react";
import type { DoForm } from "../lib/contract";
import { getPrinters, printImage } from "../lib/printClient";
import { recordPrint, saveOrder, upsertMasters } from "../lib/orders";
import { isSupabaseConfigured } from "../lib/supabase";
import styles from "./PrintControls.module.css";

interface PrintControlsProps {
  form: DoForm;
  /** 預覽根節點:圖形列印擷取此節點成 PNG。 */
  previewRef: RefObject<HTMLElement | null>;
  onOffsetChange?: (x: number, y: number) => void;
  /** 目前這份單在 Supabase 的 id(null = 新單)。 */
  orderId: string | null;
  /** 存檔後回填 id 給 page,讓後續列印走 update。 */
  onOrderIdChange: (id: string | null) => void;
}

type Status =
  | { kind: "idle" }
  | { kind: "printing" }
  | { kind: "success"; message: string }
  | { kind: "error"; message: string };

export default function PrintControls({
  form,
  previewRef,
  onOffsetChange,
  orderId,
  onOrderIdChange,
}: PrintControlsProps) {
  const [printers, setPrinters] = useState<string[]>([]);
  const [selectedPrinter, setSelectedPrinter] = useState<string>("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  // 存檔小提示(存檔成功 / 已更新 #<orderNo>);與列印狀態分開顯示。
  const [saveNote, setSaveNote] = useState<string>("");

  // 載入印表機清單
  useEffect(() => {
    let cancelled = false;
    getPrinters()
      .then((list) => {
        if (cancelled) return;
        setPrinters(list);
        if (list.length > 0) setSelectedPrinter(list[0]);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setStatus({
          kind: "error",
          message: `無法取得印表機清單: ${
            err instanceof Error ? err.message : String(err)
          }`,
        });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function handleX(e: React.ChangeEvent<HTMLInputElement>) {
    const x = Number(e.target.value);
    onOffsetChange?.(x, form.offsetY);
  }

  function handleY(e: React.ChangeEvent<HTMLInputElement>) {
    const y = Number(e.target.value);
    onOffsetChange?.(form.offsetX, y);
  }

  async function handlePrint() {
    if (!selectedPrinter) {
      setStatus({ kind: "error", message: "請先選擇印表機" });
      return;
    }
    const node = previewRef.current;
    if (!node) {
      setStatus({ kind: "error", message: "找不到預覽內容,無法列印" });
      return;
    }

    // 按列印 = 存檔 + 列印;先確認。
    if (!window.confirm("要存檔並列印嗎?")) return;

    setStatus({ kind: "printing" });
    setSaveNote("");

    // 1) 先存檔(取得 / 沿用 id)+ 累積主檔。即使稍後列印失敗,存檔已完成。
    //    未設定 Supabase 時跳過 DB,只做本機列印,並附註提示。
    let savedId: string | null = orderId;
    if (isSupabaseConfigured) {
      try {
        savedId = await saveOrder(form, orderId ?? undefined);
        onOrderIdChange(savedId);
        setSaveNote(
          orderId
            ? `已更新 #${form.header.orderNo || savedId}`
            : "存檔成功",
        );
        // 主檔累積失敗不影響列印,僅記錄於 console。
        upsertMasters(form).catch((err) => {
          console.error("upsertMasters 失敗:", err);
        });
      } catch (err: unknown) {
        setStatus({
          kind: "error",
          message: `存檔失敗: ${
            err instanceof Error ? err.message : String(err)
          }`,
        });
        return;
      }
    } else {
      setSaveNote("尚未設定 Supabase,僅本機列印(未存檔)");
    }

    // 2) 圖形列印:擷取預覽 DOM → PNG → 送本機 agent 轉 ESC/P。
    setStatus({ kind: "printing" });
    let printOk = false;
    let jobId: string | undefined;
    try {
      const res = await printImage(selectedPrinter, node);
      printOk = res.ok;
      jobId = res.job_id;
      if (res.ok) {
        setStatus({
          kind: "success",
          message: res.job_id ? `列印成功 (job ${res.job_id})` : "列印成功",
        });
      } else {
        setStatus({ kind: "error", message: res.error ?? "列印失敗" });
      }
    } catch (err: unknown) {
      setStatus({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }

    // 3) 記錄本次列印結果(成功或失敗都記),不影響上方狀態。
    if (isSupabaseConfigured && savedId) {
      recordPrint(savedId, printOk, jobId).catch((err) => {
        console.error("recordPrint 失敗:", err);
      });
    }
  }

  return (
    <div className={styles.controls}>
      <div className={styles.fields}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="offset-x">
            X 微調 (1/60 吋)
          </label>
          <input
            id="offset-x"
            className={styles.input}
            type="number"
            value={form.offsetX}
            onChange={handleX}
          />
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="offset-y">
            Y 微調 (1/180 吋)
          </label>
          <input
            id="offset-y"
            className={styles.input}
            type="number"
            value={form.offsetY}
            onChange={handleY}
          />
        </div>
        <div className={`${styles.field} ${styles.printerField}`}>
          <label className={styles.label} htmlFor="printer-select">
            印表機
          </label>
          <select
            id="printer-select"
            className={styles.select}
            value={selectedPrinter}
            onChange={(e) => setSelectedPrinter(e.target.value)}
          >
            {printers.length === 0 && <option value="">(無可用印表機)</option>}
            {printers.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
      </div>

      <button
        type="button"
        className={styles.printBtn}
        onClick={handlePrint}
        disabled={status.kind === "printing"}
      >
        {status.kind === "printing" ? "列印中…" : "🖨  列印"}
      </button>

      {saveNote && (
        <p role="status" className={styles.status}>
          {saveNote}
        </p>
      )}
      {status.kind === "success" && (
        <p role="status" className={`${styles.status} ${styles.success}`}>
          {status.message}
        </p>
      )}
      {status.kind === "error" && (
        <p role="alert" className={`${styles.status} ${styles.error}`}>
          {status.message}
        </p>
      )}
    </div>
  );
}
