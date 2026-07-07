"use client";

// 品項主檔(items)管理頁:清單/搜尋 + 新增/編輯/刪除 + Excel(.xlsx)匯入。
//
// 全部前端直連 Supabase;未設定 env 時只顯示友善提示(build 不需 env)。

import { useCallback, useEffect, useMemo, useState } from "react";
import { isSupabaseConfigured } from "../../lib/supabase";
import type { ItemRow } from "../../lib/db-types";
import {
  listItems,
  insertItem,
  updateItem,
  deleteItem,
  bulkUpsertItems,
  parseSheetRows,
  type ItemInput,
  type RawItemInput,
} from "../../lib/items";
import styles from "./page.module.css";

type Draft = {
  name: string;
  material: string;
  size: string;
  unit: string;
  price: string;
};

const emptyDraft: Draft = { name: "", material: "", size: "", unit: "", price: "" };

function rowToDraft(r: ItemRow): Draft {
  return {
    name: r.name ?? "",
    material: r.material ?? "",
    size: r.size ?? "",
    unit: r.unit ?? "",
    price: r.price === null ? "" : String(r.price),
  };
}

function draftToInput(d: Draft): RawItemInput {
  return {
    name: d.name,
    material: d.material,
    size: d.size,
    unit: d.unit,
    price: d.price,
  };
}

export default function ItemsPage() {
  const configured = isSupabaseConfigured;

  const [items, setItems] = useState<ItemRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // 新增列草稿
  const [newDraft, setNewDraft] = useState<Draft>(emptyDraft);
  // 編輯中的 id + 草稿
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Draft>(emptyDraft);

  // Excel 匯入預覽
  const [preview, setPreview] = useState<ItemInput[] | null>(null);
  const [previewName, setPreviewName] = useState<string>("");
  const [importing, setImporting] = useState(false);

  const load = useCallback(
    async (term?: string) => {
      if (!configured) return;
      setLoading(true);
      setError(null);
      try {
        const data = await listItems(term ?? search);
        setItems(data);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    },
    [configured, search],
  );

  useEffect(() => {
    void load("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSearch = (e: React.FormEvent) => {
    e.preventDefault();
    void load(search);
  };

  const handleAdd = async () => {
    if (!newDraft.name.trim()) {
      setError("請至少輸入品名。");
      return;
    }
    setError(null);
    try {
      await insertItem(draftToInput(newDraft));
      setNewDraft(emptyDraft);
      setNotice("已新增品項。");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    if (!editDraft.name.trim()) {
      setError("品名不可為空。");
      return;
    }
    setError(null);
    try {
      await updateItem(editingId, draftToInput(editDraft));
      setEditingId(null);
      setNotice("已更新品項。");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleDelete = async (r: ItemRow) => {
    if (!window.confirm(`確定刪除「${r.name ?? "(未命名)"}」?`)) return;
    setError(null);
    try {
      await deleteItem(r.id);
      setNotice("已刪除品項。");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  // ---- Excel 匯入 ----
  const handleFile = async (file: File) => {
    setError(null);
    setNotice(null);
    setPreview(null);
    setPreviewName(file.name);
    try {
      // 動態載入 SheetJS,避免進入首屏 bundle。
      const XLSX = await import("xlsx");
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const first = wb.SheetNames[0];
      if (!first) {
        setError("找不到工作表。");
        return;
      }
      const sheet = wb.Sheets[first];
      const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
        header: 1,
        blankrows: false,
        defval: null,
      });
      const parsed = parseSheetRows(rows as unknown[][]);
      if (parsed.length === 0) {
        setError("未能從檔案解析出任何品項(請確認含「品名」欄)。");
        return;
      }
      setPreview(parsed);
    } catch (e) {
      setError(`解析 Excel 失敗:${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const confirmImport = async () => {
    if (!preview) return;
    setImporting(true);
    setError(null);
    try {
      const { inserted, updated } = await bulkUpsertItems(preview);
      setNotice(`匯入完成:新增 ${inserted} 筆、更新 ${updated} 筆。`);
      setPreview(null);
      setPreviewName("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setImporting(false);
    }
  };

  const previewDedupCount = useMemo(() => {
    if (!preview) return 0;
    const seen = new Set<string>();
    for (const p of preview) {
      seen.add([p.name, p.material, p.size, p.unit].map((v) => v ?? "").join(""));
    }
    return seen.size;
  }, [preview]);

  return (
    <div className={styles.page}>
      <h1 className={styles.heading}>品項主檔</h1>
      <p className={styles.subhead}>管理品名 / 材質 / 尺寸 / 單位 / 單價,或從 Excel 匯入</p>

      {!configured && (
        <div className={styles.notice}>
          尚未設定 Supabase(NEXT_PUBLIC_SUPABASE_URL /
          NEXT_PUBLIC_SUPABASE_ANON_KEY)。設定後即可管理與匯入品項。
        </div>
      )}

      {error && <div className={`${styles.notice} ${styles.error}`}>{error}</div>}
      {notice && <div className={`${styles.notice} ${styles.success}`}>{notice}</div>}

      {/* Excel 匯入 */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Excel 匯入</h2>
        <div className={styles.importHead}>
          <label className={styles.fileLabel}>
            選擇 .xlsx 檔
            <input
              type="file"
              accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              disabled={!configured}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFile(f);
                e.target.value = "";
              }}
            />
          </label>
          <span className={styles.muted}>
            可辨識標題:品名 / 材質 / 尺寸 / 單位 / 單價(容忍不同寫法);無標題則依欄序對應。
          </span>
        </div>

        {preview && (
          <>
            <div className={styles.muted}>
              預覽 <strong>{previewName}</strong>:共 {preview.length} 筆,去重後 {previewDedupCount} 筆。
            </div>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>品名</th>
                    <th>材質</th>
                    <th>尺寸</th>
                    <th>單位</th>
                    <th className={styles.num}>單價</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.slice(0, 50).map((p, i) => (
                    <tr key={i}>
                      <td>{p.name}</td>
                      <td>{p.material ?? ""}</td>
                      <td>{p.size ?? ""}</td>
                      <td>{p.unit ?? ""}</td>
                      <td className={styles.num}>{p.price ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {preview.length > 50 && (
              <div className={styles.muted}>(僅顯示前 50 筆預覽)</div>
            )}
            <div className={styles.row}>
              <button
                className={styles.btn}
                onClick={() => void confirmImport()}
                disabled={importing || !configured}
              >
                {importing ? "匯入中…" : `確認匯入(去重 upsert)`}
              </button>
              <button
                className={`${styles.btn} ${styles.btnGhost}`}
                onClick={() => {
                  setPreview(null);
                  setPreviewName("");
                }}
                disabled={importing}
              >
                取消
              </button>
            </div>
          </>
        )}
      </section>

      {/* 新增 + 搜尋 + 清單 */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>新增品項</h2>
        <div className={styles.row}>
          <div className={styles.field}>
            <label>品名</label>
            <input
              className={styles.input}
              value={newDraft.name}
              disabled={!configured}
              onChange={(e) => setNewDraft({ ...newDraft, name: e.target.value })}
            />
          </div>
          <div className={styles.field}>
            <label>材質</label>
            <input
              className={styles.input}
              value={newDraft.material}
              disabled={!configured}
              onChange={(e) => setNewDraft({ ...newDraft, material: e.target.value })}
            />
          </div>
          <div className={styles.field}>
            <label>尺寸</label>
            <input
              className={styles.input}
              value={newDraft.size}
              disabled={!configured}
              onChange={(e) => setNewDraft({ ...newDraft, size: e.target.value })}
            />
          </div>
          <div className={styles.field}>
            <label>單位</label>
            <input
              className={styles.input}
              value={newDraft.unit}
              disabled={!configured}
              onChange={(e) => setNewDraft({ ...newDraft, unit: e.target.value })}
            />
          </div>
          <div className={styles.field}>
            <label>單價</label>
            <input
              className={styles.input}
              inputMode="decimal"
              value={newDraft.price}
              disabled={!configured}
              onChange={(e) => setNewDraft({ ...newDraft, price: e.target.value })}
            />
          </div>
          <button
            className={styles.btn}
            onClick={() => void handleAdd()}
            disabled={!configured}
          >
            新增
          </button>
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>品項清單</h2>
        <form className={styles.row} onSubmit={onSearch}>
          <input
            className={`${styles.input} ${styles.search}`}
            placeholder="搜尋品名 / 材質 / 尺寸…"
            value={search}
            disabled={!configured}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button className={styles.btn} type="submit" disabled={!configured}>
            搜尋
          </button>
          {search && (
            <button
              type="button"
              className={`${styles.btn} ${styles.btnGhost}`}
              onClick={() => {
                setSearch("");
                void load("");
              }}
              disabled={!configured}
            >
              清除
            </button>
          )}
        </form>

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>品名</th>
                <th>材質</th>
                <th>尺寸</th>
                <th>單位</th>
                <th className={styles.num}>單價</th>
                <th className={styles.num}>使用次數</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((r) =>
                editingId === r.id ? (
                  <tr key={r.id} className={styles.editRow}>
                    <td colSpan={7}>
                      <div className={styles.editGrid}>
                        <input
                          className={styles.input}
                          placeholder="品名"
                          value={editDraft.name}
                          onChange={(e) =>
                            setEditDraft({ ...editDraft, name: e.target.value })
                          }
                        />
                        <input
                          className={styles.input}
                          placeholder="材質"
                          value={editDraft.material}
                          onChange={(e) =>
                            setEditDraft({ ...editDraft, material: e.target.value })
                          }
                        />
                        <input
                          className={styles.input}
                          placeholder="尺寸"
                          value={editDraft.size}
                          onChange={(e) =>
                            setEditDraft({ ...editDraft, size: e.target.value })
                          }
                        />
                        <input
                          className={styles.input}
                          placeholder="單位"
                          value={editDraft.unit}
                          onChange={(e) =>
                            setEditDraft({ ...editDraft, unit: e.target.value })
                          }
                        />
                        <input
                          className={styles.input}
                          placeholder="單價"
                          inputMode="decimal"
                          value={editDraft.price}
                          onChange={(e) =>
                            setEditDraft({ ...editDraft, price: e.target.value })
                          }
                        />
                        <div className={styles.actions}>
                          <button
                            className={styles.linkBtn}
                            onClick={() => void handleSaveEdit()}
                          >
                            儲存
                          </button>
                          <button
                            className={styles.linkBtn}
                            onClick={() => setEditingId(null)}
                          >
                            取消
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={r.id}>
                    <td>{r.name ?? ""}</td>
                    <td>{r.material ?? ""}</td>
                    <td>{r.size ?? ""}</td>
                    <td>{r.unit ?? ""}</td>
                    <td className={styles.num}>{r.price ?? ""}</td>
                    <td className={styles.num}>{r.use_count}</td>
                    <td>
                      <div className={styles.actions}>
                        <button
                          className={styles.linkBtn}
                          onClick={() => {
                            setEditingId(r.id);
                            setEditDraft(rowToDraft(r));
                          }}
                        >
                          編輯
                        </button>
                        <button
                          className={`${styles.linkBtn} ${styles.linkDanger}`}
                          onClick={() => void handleDelete(r)}
                        >
                          刪除
                        </button>
                      </div>
                    </td>
                  </tr>
                ),
              )}
              {items.length === 0 && (
                <tr>
                  <td colSpan={7} className={styles.empty}>
                    {!configured
                      ? "設定 Supabase 後即可載入品項。"
                      : loading
                        ? "載入中…"
                        : "尚無品項。"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
