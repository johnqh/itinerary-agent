import { describe, expect, test } from "vitest";
import { datasetFor, OFFLINE_DATASETS } from "@/data/datasets";
import { parseClock } from "@/planner/time";
import { departureInstant } from "@/routing/departure";

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

  test("each dataset names a zone routing can ask a departure in", () => {
    for (const dataset of OFFLINE_DATASETS) {
      expect(
        departureInstant(dates[0]!, "09:30", dataset.timeZone),
        `${dataset.label} has no usable zone`,
      ).not.toBeNull();
    }
  });

  test("each dataset centres on its own city", () => {
    const tokyo = datasetFor("Tokyo")!;
    const sf = datasetFor("San Francisco")!;
    expect(tokyo.center.lng).toBeGreaterThan(100);
    expect(sf.center.lng).toBeLessThan(-100);
  });
});

/**
 * Seed data has to survive the same scrutiny as researched data. Every fact in
 * a committed dataset reaches the traveller with no hedge, so a clock the app
 * cannot parse, or a photograph of somewhere else hung under this place's
 * name, is a wrong answer rather than a cosmetic slip.
 */
describe("seed data is presentable", () => {
  const dates = ["2026-09-12"];

  test("every opening clock is one the app can parse", () => {
    for (const dataset of OFFLINE_DATASETS) {
      for (const place of [...dataset.attractions(dates), ...dataset.restaurants(dates)]) {
        for (const hours of Object.values(place.hoursByDate)) {
          if (hours.status !== "open") continue;
          expect(parseClock(hours.open), `${place.name} opens at ${hours.open}`).not.toBeNull();
          expect(parseClock(hours.close), `${place.name} closes at ${hours.close}`).not.toBeNull();
        }
      }
    }
  });

  /**
   * Galleries were gathered from each place's encyclopaedia article, which
   * illustrates its subject with neighbouring topics as readily as with the
   * subject itself. Each file below names somewhere the detail panel would
   * then caption with this attraction's name: another neighbourhood, another
   * city's market, another venue, a woodblock print, a fire-insurance map, a
   * sumo wrestler.
   */
  const MISLABELLED = [
    "Haight_Ashbury11",
    "Queen_Anne_House",
    "Yushima_Seid",
    "Nagoya_Castle",
    "Crowds_of_Nishiki_Market",
    "TeamLab_Borderless",
    "Watermill_at_Onden",
    "Kisenosato",
    "Shinobugaoka_Junior_High_School",
    "sanborn",
  ];

  test("no gallery shows a photograph of somewhere else", () => {
    for (const dataset of OFFLINE_DATASETS) {
      for (const place of dataset.attractions(dates)) {
        for (const url of place.photoUrls) {
          for (const wrong of MISLABELLED) {
            expect(
              decodeURIComponent(url).toLowerCase(),
              `${place.name} shows ${wrong}`,
            ).not.toContain(wrong.toLowerCase());
          }
        }
      }
    }
  });
});

describe("matching a city written in its own script", () => {
  test("the Japanese name resolves with or without the country", () => {
    expect(datasetFor("東京")?.key).toBe("tokyo");
    expect(datasetFor("東京, Japan")?.key).toBe("tokyo");
  });
});
