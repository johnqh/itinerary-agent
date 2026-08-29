import { describe, expect, test } from "vitest";
import { completeExclusions } from "@/agent/optimizer";
import type { Attraction, ExclusionReason, PlanDay } from "@/types/workspace";

/**
 * An attraction the scheduler simply did not mention.
 *
 * The validator requires every candidate to be either scheduled or excluded,
 * which is right for the traveller — an attraction that vanishes with no
 * explanation is a bug they cannot see. But it is bookkeeping, not
 * feasibility, and rejecting a perfectly walkable day over it throws away good
 * work. Completing the ledger here keeps the day rules strict without failing
 * for a missing line item.
 */

function attraction(id: string): Attraction {
  return {
    id, name: id, category: "landmark",
    location: { lat: 37.77, lng: -122.42 },
    description: "", hoursByDate: {}, estimatedVisitMinutes: 60,
    ticketRequired: false, photoUrls: [], sources: [], confidence: 0.5,
  };
}

const days: PlanDay[] = [
  {
    date: "2026-09-12", isCarDay: false, summary: "", legs: [],
    items: [{ kind: "attraction", refId: "a1", startTime: "09:00", endTime: "10:00" }],
  },
];

describe("completeExclusions", () => {
  test("accounts for an attraction the scheduler never mentioned", () => {
    const result = completeExclusions(days, [attraction("a1"), attraction("a2")], []);
    expect(result.map((e) => e.attractionId)).toEqual(["a2"]);
  });

  test("says only what is known about why it was left out", () => {
    const [entry] = completeExclusions(days, [attraction("a1"), attraction("a2")], []);
    expect(entry!.reason).toMatch(/\w/);
    // No invented cause: the scheduler reported an absence, not a reason.
    expect(entry!.reason).not.toMatch(/closed|far|rating|hours/i);
  });

  test("keeps the reasons the scheduler did give", () => {
    const given: ExclusionReason[] = [{ attractionId: "a2", reason: "Closed all week." }];
    const result = completeExclusions(days, [attraction("a1"), attraction("a2")], given);
    expect(result).toEqual(given);
  });

  test("adds nothing when every attraction is accounted for", () => {
    const result = completeExclusions(days, [attraction("a1")], []);
    expect(result).toEqual([]);
  });

  test("does not exclude something that was scheduled", () => {
    const result = completeExclusions(days, [attraction("a1")], []);
    expect(result.some((e) => e.attractionId === "a1")).toBe(false);
  });

  test("never lists the same attraction twice", () => {
    const given: ExclusionReason[] = [{ attractionId: "a2", reason: "Closed." }];
    const result = completeExclusions(days, [attraction("a1"), attraction("a2")], given);
    const ids = result.map((e) => e.attractionId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
