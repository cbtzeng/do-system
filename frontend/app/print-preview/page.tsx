"use client";

// 獨立列印預覽頁(#K)—— 現改為薄殼:從 localStorage 讀回表單,交給共用的
// <PrintPreviewPanel>(#L)渲染。所有工具列/紙張/列印隔離邏輯都在該元件裡,
// 與首頁 `/` 內嵌的那份是同一份實作,不會分岔。
//
// 開單頁按「在新分頁開啟列印預覽」→ 把 DoForm 寫進 localStorage → window.open("/print-preview"),
// 本頁讀回後渲染。沒有資料時給友善提示。

import { useEffect, useState } from "react";
import PrintPreviewPanel from "../../components/PrintPreviewPanel";
import type { DoForm } from "../../lib/contract";
import { loadPrintPreviewForm } from "../../lib/printLayout";
import styles from "./page.module.css";

type LoadState =
  | { kind: "loading" }
  | { kind: "empty" }
  | { kind: "ready"; form: DoForm };

export default function PrintPreviewPage() {
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  // 掛載時從 localStorage 讀回表單(新分頁不共用 sessionStorage,故用 localStorage)。
  useEffect(() => {
    const form = loadPrintPreviewForm();
    setState(form ? { kind: "ready", form } : { kind: "empty" });
  }, []);

  if (state.kind === "loading") {
    return (
      <div className={styles.page}>
        <p className={styles.notice}>載入中…</p>
      </div>
    );
  }

  if (state.kind === "empty") {
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
      <PrintPreviewPanel form={state.form} />
    </div>
  );
}
