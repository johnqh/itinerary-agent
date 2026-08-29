import { describe, expect, test } from "vitest";
import { datasetFor, OFFLINE_DATASETS } from "@/data/datasets";

/**
 * Which destinations answer instantly from a committed dataset, and which go to
 * the research agent. Matching is on the city itself, not a substring: "South
 * San Francisco" is a different place, and answering it with San Francisco's
 * attractions would be a wrong answer rather than a fast one.
 */

describe("matching a covered city", () => {
  test("matches the city on its own", () => {
    expect(datasetFor("Tokyo")?.key).toBe("tokyo");
    expect(datasetFor("San Francisco")?.key).toBe("san-francisco");
  });

  test("matches a city written with its country or state", () => {
    expect(datasetFor("Tokyo, Japan")?.key).toBe("tokyo");
    expect(datasetFor("San Francisco, CA")?.key).toBe("san-francisco");
    expect(datasetFor("San Francisco, USA")?.key).toBe("san-francisco");
  });

  test("ignores case and stray whitespace", () => {
    expect(datasetFor("  tOkYo , japan ")?.key).toBe("tokyo");
  });

  test("matches a common short form", () => {
    expect(datasetFor("SF")?.key).toBe("san-francisco");
  });
});

describe("refusing a near miss", () => {
  test("a different city that merely contains the name is not a match", () => {
    expect(datasetFor("South San Francisco")).toBeNull();
    expect(datasetFor("Tokyo Disneyland")).toBeNull();
  });

  test("an uncovered city has no dataset", () => {
    expect(datasetFor("Lisbon, Portugal")).toBeNull();
    expect(datasetFor("")).toBeNull();
  });
});

describe("dataset contents", () => {
  const dates = ["2026-09-12", "2026-09-13"];

  test("every dataset supplies enough to plan a trip", () => {
    for (const dataset of OFFLINE_DATASETS) {
      expect(dataset.attractions(dates).length).toBeGreaterThanOrEqual(12);
      expect(dataset.restaurants(dates).length).toBeGreaterThanOrEqual(6);
    }
  });

  test("every dataset can seat dinner somewhere", () => {
    for (const dataset of OFFLINE_DATASETS) {
      const late = dataset.restaurants(dates).filter((r) => {
        const hours = r.hoursByDate[dates[0]!];
        return hours?.status === "open" && hours.close >= "19:45";
      });
      expect(late.length, `${dataset.label} has nowhere open for dinner`).toBeGreaterThan(0);
    }
  });

  test("most places carry a photo to show", () => {
    for (const dataset of OFFLINE_DATASETS) {
      const withPhotos = dataset.attractions(dates).filter((a) => a.photoUrls.length > 0);
      expect(withPhotos.length, dataset.label).toBeGreaterThanOrEqual(10);
    }
  });

  test("each dataset centres on its own city", () => {
    const tokyo = datasetFor("Tokyo")!;
    const sf = datasetFor("San Francisco")!;
    expect(tokyo.center.lng).toBeGreaterThan(100);
    expect(sf.center.lng).toBeLessThan(-100);
  });
});
