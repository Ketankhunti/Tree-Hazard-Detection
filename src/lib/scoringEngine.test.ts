import { describe, it, expect } from "vitest";
import { scoreComplaint, scoreAllComplaints } from "./scoringEngine";
import type { TreeComplaint } from "../types";

describe("scoringEngine", () => {
  const baseComplaint: TreeComplaint = {
    id: "TEST-001",
    address: "123 Quinpool Road",
    street: "Quinpool Road",
    neighborhood: "West End",
    complaintText: "Healthy tree with regular autumn leaf drop.",
    daysWaiting: 5,
    submittedDate: "2026-09-01T12:00:00Z",
    status: "Pending",
    latitude: 44.6488,
    longitude: -63.5752,
  };

  it("scores low risk complaints appropriately", () => {
    const scored = scoreComplaint(baseComplaint);

    expect(scored.scores.finalScore).toBeLessThan(40);
    expect(scored.priority).toBe("Low");
    expect(scored.hazards).toHaveLength(0);
    expect(scored.textImageConflict).toBe(false);
  });

  it("detects high danger hazards from complaint text", () => {
    const urgentComplaint: TreeComplaint = {
      ...baseComplaint,
      complaintText:
        "Large tree is leaning heavily over house and could fall on roof and power lines. Trunk is splitting.",
      daysWaiting: 45,
    };

    const scored = scoreComplaint(urgentComplaint);

    expect(scored.scores.dangerScore).toBeGreaterThanOrEqual(70);
    expect(["High", "Critical"]).toContain(scored.priority);
    const hazardLabels = scored.hazards.map((h) => h.label);
    expect(hazardLabels).toContain("Power Line Threat");
    expect(hazardLabels).toContain("Leaning Tree");
    expect(hazardLabels).toContain("Falling Risk");
    expect(hazardLabels).toContain("Property Threat");
    expect(hazardLabels).toContain("Split Trunk");
  });

  it("calculates wait time score correctly based on 180-day baseline", () => {
    const freshComplaint: TreeComplaint = {
      ...baseComplaint,
      daysWaiting: 0,
    };
    const halfComplaint: TreeComplaint = {
      ...baseComplaint,
      daysWaiting: 90,
    };
    const oldComplaint: TreeComplaint = {
      ...baseComplaint,
      daysWaiting: 180,
    };

    const freshScored = scoreComplaint(freshComplaint);
    const halfScored = scoreComplaint(halfComplaint);
    const oldScored = scoreComplaint(oldComplaint);

    expect(freshScored.scores.waitScore).toBe(0);
    expect(halfScored.scores.waitScore).toBe(50);
    expect(oldScored.scores.waitScore).toBe(100);
  });

  it("applies arterial street location bonus", () => {
    const robieStreet: TreeComplaint = {
      ...baseComplaint,
      street: "Robie Street",
    };
    const quietStreet: TreeComplaint = {
      ...baseComplaint,
      street: "Quiet Residential Lane",
    };

    const robieScored = scoreComplaint(robieStreet);
    const quietScored = scoreComplaint(quietStreet);

    expect(robieScored.scores.locationScore).toBeGreaterThan(quietScored.scores.locationScore);
  });

  it("flags text-image conflict and weights photo over exaggerated text (anti-gaming)", () => {
    // TR-015 in mock image detections has an image showing 0 hazards with high confidence (0.85).
    // When text claims extreme danger, the system detects a text-image conflict.
    const conflictingComplaint: TreeComplaint = {
      ...baseComplaint,
      id: "TR-015",
      complaintText:
        "Severe hazard! Tree is leaning over house and about to fall on power lines with split trunk and dead branches!",
      daysWaiting: 10,
    };

    const scored = scoreComplaint(conflictingComplaint);

    expect(scored.textImageConflict).toBe(true);
    expect(scored.scores.imageDangerScore).toBe(0);
    expect(scored.scores.textDangerScore).toBeGreaterThanOrEqual(50);
    // Anti-gaming weighting: 65% image (0) + 35% text (>=50) => lower danger score than text alone
    expect(scored.scores.dangerScore).toBeLessThan(scored.scores.textDangerScore);
  });

  it("ranks complaints in descending order of priority score with scoreAllComplaints", () => {
    const list: TreeComplaint[] = [
      {
        ...baseComplaint,
        id: "LOW-1",
        complaintText: "Tree looks fine, just wondering when pruning is scheduled.",
        daysWaiting: 2,
      },
      {
        ...baseComplaint,
        id: "CRIT-1",
        complaintText: "Massive split trunk leaning over house and power lines about to collapse!",
        daysWaiting: 120,
      },
      {
        ...baseComplaint,
        id: "MED-1",
        complaintText: "Dead branch hanging over sidewalk.",
        daysWaiting: 20,
      },
    ];

    const ranked = scoreAllComplaints(list);

    expect(ranked).toHaveLength(3);
    expect(ranked[0].id).toBe("CRIT-1");
    expect(ranked[0].scores.finalScore).toBeGreaterThan(ranked[1].scores.finalScore);
    expect(ranked[1].scores.finalScore).toBeGreaterThan(ranked[2].scores.finalScore);
  });
});
