import { describe, it, expect } from "vitest";
import { buildEscp, toBase64 } from "./escp";
import type { DoForm } from "./contract";

const ESC = 0x1b;

function baseForm(overrides: Partial<DoForm> = {}): DoForm {
  return {
    lines: [
      { name: "Widget", size: "M", qty: 2, price: 600 },
      { name: "Gadget", size: "L", qty: 1, price: 350 },
    ],
    offsetX: 10,
    offsetY: 30,
    ...overrides,
  };
}

describe("buildEscp", () => {
  it("starts with ESC @ (init)", () => {
    const bytes = buildEscp(baseForm());
    expect(bytes[0]).toBe(ESC);
    expect(bytes[1]).toBe(0x40);
  });

  it("ends with FF (form feed)", () => {
    const bytes = buildEscp(baseForm());
    expect(bytes[bytes.length - 1]).toBe(0x0c);
  });

  it("changing offsetY changes the bytes", () => {
    const a = buildEscp(baseForm({ offsetY: 30 }));
    const b = buildEscp(baseForm({ offsetY: 45 }));
    expect(Array.from(a)).not.toEqual(Array.from(b));
  });

  it("changing offsetX changes the bytes", () => {
    const a = buildEscp(baseForm({ offsetX: 10 }));
    const b = buildEscp(baseForm({ offsetX: 200 }));
    expect(Array.from(a)).not.toEqual(Array.from(b));
  });

  it("emits ESC 3 n with offsetY as line spacing", () => {
    const bytes = buildEscp(baseForm({ offsetY: 42 }));
    expect(bytes[2]).toBe(ESC);
    expect(bytes[3]).toBe(0x33);
    expect(bytes[4]).toBe(42);
  });

  it("emits ESC $ nL nH per line with offsetX encoded little-endian", () => {
    const bytes = buildEscp(baseForm({ offsetX: 300 }));
    // first line ESC $ begins right after ESC @ (2) + ESC 3 n (3) = index 5
    expect(bytes[5]).toBe(ESC);
    expect(bytes[6]).toBe(0x24);
    expect(bytes[7]).toBe(300 & 0xff); // 44
    expect(bytes[8]).toBe((300 >> 8) & 0xff); // 1
  });

  it("contains the subtotal text (qty * price) as ASCII", () => {
    const bytes = buildEscp(
      baseForm({ lines: [{ name: "X", size: "M", qty: 3, price: 100 }] }),
    );
    const text = String.fromCharCode(...Array.from(bytes));
    expect(text).toContain("300"); // 3 * 100
  });
});

describe("toBase64", () => {
  it("round-trips arbitrary bytes", () => {
    const original = Uint8Array.from([0x1b, 0x40, 0x00, 0x0c, 0xff, 0x7f, 0x80]);
    const b64 = toBase64(original);
    const decoded = Uint8Array.from(
      atob(b64)
        .split("")
        .map((c) => c.charCodeAt(0)),
    );
    expect(Array.from(decoded)).toEqual(Array.from(original));
  });

  it("encodes ESC @ as expected base64", () => {
    expect(toBase64(Uint8Array.from([0x1b, 0x40]))).toBe(
      Buffer.from([0x1b, 0x40]).toString("base64"),
    );
  });
});
