"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { DoForm } from "../lib/contract";
import DoFormEditor from "../components/DoFormEditor";
import PrintPreviewPanel from "../components/PrintPreviewPanel";
import { emptyDoForm } from "../components/doForm";
import { getOrder, mapRowToForm } from "../lib/orders";
import { isSupabaseConfigured } from "../lib/supabase";
import styles from "./page.module.css";

function Editor() {
  // 整份 DoForm 保存在 page 狀態,列印控制項直接取用同一份 form。
  const [form, setForm] = useState<DoForm>(() => emptyDoForm());

  // 目前這份單在 Supabase 的 id。null = 尚未存檔的新單;
  // 存檔後回填,之後同一份單的列印皆走 update 同一 id。
  const [orderId, setOrderId] = useState<string | null>(null);

  // 重開既有單(?id=)時的載入狀態/錯誤提示。
  const [loadNote, setLoadNote] = useState<string | null>(null);

  // 網址帶 ?id= → 從 Supabase 載回該單,設 orderId 使後續列印 update 同一筆。
  const searchParams = useSearchParams();
  const idParam = searchParams.get("id");

  useEffect(() => {
    if (!idParam) return;
    if (!isSupabaseConfigured) {
      setLoadNote("尚未設定 Supabase,無法載入既有送貨單。");
      return;
    }
    let cancelled = false;
    setLoadNote("載入中…");
    getOrder(idParam)
      .then((row) => {
        if (cancelled) return;
        if (!row) {
          setLoadNote(`找不到送貨單(id: ${idParam})。`);
          return;
        }
        setForm(mapRowToForm(row));
        setOrderId(row.id);
        setLoadNote(`已載入 #${row.order_no ?? row.id};列印將更新此單。`);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoadNote(
          `載入失敗:${err instanceof Error ? err.message : String(err)}`,
        );
      });
    return () => {
      cancelled = true;
    };
  }, [idParam]);

  return (
    <div className={styles.page}>
      <h1 className={styles.heading}>送貨單編輯</h1>
      <p className={styles.subhead}>
        {orderId ? "重開既有送貨單:改 → 列印會更新同一筆" : "填寫 → 預覽 → 從 LQ-310 列印"}
      </p>

      {loadNote && <p className={styles.loadNote}>{loadNote}</p>}

      <div className={styles.layout}>
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>輸入</h2>
          <DoFormEditor form={form} onChange={setForm} />
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>預覽 / 列印</h2>
          <PrintPreviewPanel form={form} />
        </section>
      </div>
    </div>
  );
}

export default function Home() {
  // useSearchParams 需在 Suspense 邊界內(Next 預渲染要求)。
  return (
    <Suspense fallback={<div className={styles.page} />}>
      <Editor />
    </Suspense>
  );
}
