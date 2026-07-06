import { describe, it, expect } from "vitest";
import { buildEscp, toBase64 } from "./escp";
import type { StandardDoForm } from "./contract";

const ESC = 0x1b;

const emptyHeader = {
  customerName: "",
  address: "",
  phone: "",
  orderNo: "",
  date: "",
  remark: "",
  carrier: "",
  vehicleNo: "",
  taxId: "",
  invoiceNo: "",
};

function baseForm(overrides: Partial<StandardDoForm> = {}): StandardDoForm {
  return {
    template: "standard",
    header: emptyHeader,
    lines: [
      { name: "Widget", unit: "pcs", qty: 2, price: 600 },
      { name: "Gadget", unit: "pcs", qty: 1, price: 350 },
    ],
    taxAmount: 0,
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

  it("emits ESC C 33 (page length) right after ESC @", () => {
    const bytes = buildEscp(baseForm());
    // ESC @ (index 0,1) 之後緊接 ESC C n,鎖定連續三聯單頁長 5.5" = 33 行
    expect(bytes[2]).toBe(ESC);
    expect(bytes[3]).toBe(0x43);
    expect(bytes[4]).toBe(33);
  });

  it("emits ESC 3 n with offsetY as line spacing", () => {
    const bytes = buildEscp(baseForm({ offsetY: 42 }));
    // ESC @ (2) + ESC C n (3) = index 5
    expect(bytes[5]).toBe(ESC);
    expect(bytes[6]).toBe(0x33);
    expect(bytes[7]).toBe(42);
  });

  it("emits ESC $ nL nH per line with offsetX encoded little-endian", () => {
    const bytes = buildEscp(baseForm({ offsetX: 300 }));
    // first line ESC $ begins after ESC @ (2) + ESC C n (3) + ESC 3 n (3) = index 8
    expect(bytes[8]).toBe(ESC);
    expect(bytes[9]).toBe(0x24);
    expect(bytes[10]).toBe(300 & 0xff); // 44
    expect(bytes[11]).toBe((300 >> 8) & 0xff); // 1
  });

  it("contains the subtotal text (qty * price) as ASCII", () => {
    const bytes = buildEscp(
      baseForm({ lines: [{ name: "X", unit: "pcs", qty: 3, price: 100 }] }),
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
