import { describe, it, expect } from "vitest";
import {
  mapHeaderColumns,
  parseSheetRows,
  normalizeItemInput,
} from "./items";

describe("normalizeItemInput", () => {
  it("trims strings and treats empty as null", () => {
    expect(normalizeItemInput({ name: "  鋼板 ", material: "" })).toEqual({
      name: "鋼板",
      material: null,
      size: null,
      unit: null,
      price: null,
    });
  });

  it("parses price from messy strings", () => {
    expect(normalizeItemInput({ name: "x", price: "$1,200" }).price).toBe(1200);
    expect(normalizeItemInput({ name: "x", price: 3.5 }).price).toBe(3.5);
    expect(normalizeItemInput({ name: "x", price: "abc" }).price).toBeNull();
  });
});

describe("mapHeaderColumns", () => {
  it("maps Chinese headers regardless of order/spacing", () => {
    const cols = mapHeaderColumns(["單價", " 品名 ", "尺寸", "材質", "單位"]);
    expect(cols).toEqual({ price: 0, name: 1, size: 2, material: 3, unit: 4 });
  });

  it("tolerates English aliases and full-width chars", () => {
    const cols = mapHeaderColumns(["Name", "Material", "Ｓｉｚｅ", "unit", "price"]);
    expect(cols.name).toBe(0);
    expect(cols.material).toBe(1);
    expect(cols.size).toBe(2);
  });
});

describe("parseSheetRows", () => {
  it("parses with a header row", () => {
    const rows = [
      ["品名", "材質", "尺寸", "單位", "單價"],
      ["螺絲", "白鐵", "M6", "個", "2.5"],
      ["", "", "", "", ""], // blank -> skipped
      ["墊片", "鐵", "10mm", "片", "1,000"],
    ];
    const out = parseSheetRows(rows);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ name: "螺絲", material: "白鐵", price: 2.5 });
    expect(out[1].price).toBe(1000);
  });

  it("falls back to fixed column order when no recognizable header", () => {
    const rows = [
      ["螺絲", "白鐵", "M6", "個", "2.5"],
      ["墊片", "鐵", "10mm", "片", "1"],
    ];
    const out = parseSheetRows(rows);
    expect(out).toHaveLength(2);
    expect(out[0].name).toBe("螺絲");
  });

  it("drops rows without a name", () => {
    const rows = [
      ["品名", "材質"],
      ["", "白鐵"],
      ["有名字", "鐵"],
    ];
    expect(parseSheetRows(rows)).toHaveLength(1);
  });
});
