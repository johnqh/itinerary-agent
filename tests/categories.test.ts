import { describe, expect, test } from "vitest";
import { categoryStyle } from "@/lib/categories";

/**
 * Categories arrive from research, so they are open-ended: "Buddhist temple",
 * "Shinto shrine" and "temple" all describe the same kind of place and must
 * look the same on the map.
 */

describe("categoryStyle", () => {
  test("matches a category however research phrased it", () => {
    expect(categoryStyle("temple").glyph).toBe(categoryStyle("Buddhist temple").glyph);
    expect(categoryStyle("shrine").glyph).toBe(categoryStyle("Shinto shrine").glyph);
  });

  test("ignores case and stray whitespace", () => {
    expect(categoryStyle("  MUSEUM ").label).toBe(categoryStyle("museum").label);
  });

  test("gives an unrecognised category a usable default rather than nothing", () => {
    const style = categoryStyle("interpretive dance venue");
    expect(style.glyph).toBeTruthy();
    expect(style.color).toMatch(/^#/);
  });

  test("gives an empty category the default too", () => {
    expect(categoryStyle("").glyph).toBeTruthy();
  });

  test("distinguishes the kinds a traveller actually scans for", () => {
    const kinds = ["temple", "museum", "park", "viewpoint", "market"].map(
      (c) => categoryStyle(c).color,
    );
    expect(new Set(kinds).size).toBe(kinds.length);
  });
});
