"use client";

import { useState } from "react";
import type { DoForm } from "../lib/contract";
import DoFormEditor from "../components/DoFormEditor";
import DoPreview from "../components/DoPreview";
import PrintControls from "../components/PrintControls";
import { emptyDoForm } from "../components/doForm";
import styles from "./page.module.css";

export default function Home() {
  // 整份 DoForm 保存在 page 狀態,列印控制項(Issue #2)直接取用同一份 form。
  const [form, setForm] = useState<DoForm>(() => emptyDoForm());

  // PrintControls 的 X/Y 微調寫回同一份 form,讓預覽與列印一致。
  const handleOffsetChange = (offsetX: number, offsetY: number) =>
    setForm((prev) => ({ ...prev, offsetX, offsetY }));

  return (
    <div className={styles.page}>
      <h1 className={styles.heading}>送貨單編輯</h1>

      <div className={styles.layout}>
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>輸入</h2>
          <DoFormEditor form={form} onChange={setForm} />
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>預覽</h2>
          <DoPreview form={form} />
          <PrintControls form={form} onOffsetChange={handleOffsetChange} />
        </section>
      </div>
    </div>
  );
}
