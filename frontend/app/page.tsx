"use client";

import { useState } from "react";
import type { DoForm } from "../lib/contract";
import DoFormEditor from "../components/DoFormEditor";
import DoPreview from "../components/DoPreview";
import { emptyDoForm } from "../components/doForm";
import styles from "./page.module.css";

export default function Home() {
  // 整份 DoForm 保存在 page 狀態,方便 Issue #2 的列印控制項日後直接取用。
  // offsetX / offsetY 預設為 0,微調 UI 由 Issue #2 提供。
  const [form, setForm] = useState<DoForm>(() => emptyDoForm());

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
        </section>
      </div>
    </div>
  );
}
