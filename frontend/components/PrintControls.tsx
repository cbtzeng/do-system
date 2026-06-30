"use client";

import { useEffect, useState } from "react";
import type { DoForm } from "../lib/contract";
import { getPrinters, printForm } from "../lib/printClient";

interface PrintControlsProps {
  form: DoForm;
  onOffsetChange?: (x: number, y: number) => void;
}

type Status =
  | { kind: "idle" }
  | { kind: "printing" }
  | { kind: "success"; message: string }
  | { kind: "error"; message: string };

export default function PrintControls({
  form,
  onOffsetChange,
}: PrintControlsProps) {
  const [printers, setPrinters] = useState<string[]>([]);
  const [selectedPrinter, setSelectedPrinter] = useState<string>("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

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
    setStatus({ kind: "printing" });
    try {
      const res = await printForm(selectedPrinter, form);
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
  }

  return (
    <div className="print-controls">
      <div>
        <label>
          X 微調 (1/60 吋)
          <input
            type="number"
            value={form.offsetX}
            onChange={handleX}
          />
        </label>
      </div>
      <div>
        <label>
          Y 微調 (1/180 吋)
          <input
            type="number"
            value={form.offsetY}
            onChange={handleY}
          />
        </label>
      </div>
      <div>
        <label>
          印表機
          <select
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
        </label>
      </div>
      <button
        type="button"
        onClick={handlePrint}
        disabled={status.kind === "printing"}
      >
        {status.kind === "printing" ? "列印中…" : "列印"}
      </button>
      {status.kind === "success" && (
        <p role="status" style={{ color: "green" }}>
          {status.message}
        </p>
      )}
      {status.kind === "error" && (
        <p role="alert" style={{ color: "red" }}>
          {status.message}
        </p>
      )}
    </div>
  );
}
