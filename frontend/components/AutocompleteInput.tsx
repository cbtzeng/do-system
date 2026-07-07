"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import styles from "./AutocompleteInput.module.css";

/**
 * 建議項的泛型型別:字串(自由欄位)或帶關聯資料的物件(客戶)。
 * `getLabel` 決定顯示 / 填入輸入框的文字;`onPick` 回傳完整物件供帶入相關欄位。
 */
export interface AutocompleteInputProps<T> {
  /** 目前值(受控)。 */
  value: string;
  /** 輸入框文字變更(逐字)。 */
  onChange: (value: string) => void;
  /** 依目前輸入 q 取得建議清單(呼叫端可回傳字串或物件陣列)。 */
  fetchSuggestions: (q: string) => Promise<T[]>;
  /** 從建議項取出顯示文字;預設把 string 直接回傳。 */
  getLabel?: (item: T) => string;
  /** 選定某建議項(點擊 / Enter)。回傳完整物件,呼叫端可自動帶入關聯欄位。 */
  onPick?: (item: T) => void;
  placeholder?: string;
  className?: string;
  /** debounce 毫秒數(預設 180)。 */
  debounceMs?: number;
  "aria-label"?: string;
}

const DEFAULT_DEBOUNCE = 180;

export default function AutocompleteInput<T>({
  value,
  onChange,
  fetchSuggestions,
  getLabel = (item: T) => String(item),
  onPick,
  placeholder,
  className,
  debounceMs = DEFAULT_DEBOUNCE,
  "aria-label": ariaLabel,
}: AutocompleteInputProps<T>) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<T[]>([]);
  const [active, setActive] = useState(-1);

  const rootRef = useRef<HTMLDivElement>(null);
  // 用來忽略過期的非同步結果(避免慢查詢覆蓋新查詢)。
  const reqRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 剛選取後暫時不要再開建議(避免帶入後又跳出清單)。
  const suppressRef = useRef(false);

  const listboxId = useId();

  const runFetch = useCallback(
    (q: string) => {
      const reqId = ++reqRef.current;
      fetchSuggestions(q)
        .then((results) => {
          if (reqId !== reqRef.current) return; // 過期結果丟棄
          if (suppressRef.current) {
            suppressRef.current = false;
            return;
          }
          setItems(results);
          setActive(-1);
          setOpen(results.length > 0);
        })
        .catch(() => {
          if (reqId !== reqRef.current) return;
          setItems([]);
          setOpen(false);
        });
    },
    [fetchSuggestions],
  );

  // 值變動時 debounce 觸發查詢。
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (suppressRef.current) {
      // 由選取觸發的值變動:略過本次查詢。
      suppressRef.current = false;
      return;
    }
    const q = value.trim();
    if (!q) {
      setItems([]);
      setOpen(false);
      return;
    }
    debounceRef.current = setTimeout(() => runFetch(q), debounceMs);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value, debounceMs, runFetch]);

  // 點擊外部關閉。
  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, []);

  function pick(item: T) {
    suppressRef.current = true;
    onChange(getLabel(item));
    onPick?.(item);
    setOpen(false);
    setActive(-1);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || items.length === 0) {
      if (e.key === "ArrowDown" && value.trim()) {
        // 重新開啟建議
        runFetch(value.trim());
      }
      return;
    }
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActive((a) => (a + 1) % items.length);
        break;
      case "ArrowUp":
        e.preventDefault();
        setActive((a) => (a - 1 + items.length) % items.length);
        break;
      case "Enter":
        if (active >= 0 && active < items.length) {
          e.preventDefault();
          pick(items[active]);
        }
        break;
      case "Escape":
        setOpen(false);
        setActive(-1);
        break;
    }
  }

  return (
    <div className={styles.root} ref={rootRef}>
      <input
        className={`${styles.input} ${className ?? ""}`}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-label={ariaLabel}
        autoComplete="off"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onFocus={() => {
          if (items.length > 0) setOpen(true);
        }}
      />
      {open && items.length > 0 && (
        <ul className={styles.list} id={listboxId} role="listbox">
          {items.map((item, i) => {
            const label = getLabel(item);
            return (
              <li
                key={`${label}-${i}`}
                role="option"
                aria-selected={i === active}
                className={`${styles.option} ${
                  i === active ? styles.optionActive : ""
                }`}
                // mousedown 早於 input blur,避免點擊時清單先關掉
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(item);
                }}
                onMouseEnter={() => setActive(i)}
              >
                {label}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
