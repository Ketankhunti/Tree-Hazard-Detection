import type { PriorityLevel } from "./types";

/**
 * The scoring contract.
 *
 * These constants live in `shared` rather than with the engine because the UI
 * displays them: the breakdown panel prints the weight beside each component,
 * and the poster prints the band a score falls into. Keeping one definition
 * means the number the engine multiplies by is provably the number the arborist
 * reads on the sheet.
 *
 * The rules that *consume* these - hazard detection, fusion, the escalation
 * floor - stay in `backend/domain/scoring.ts`, which is server-side only.
 */

/** Component weights. Must sum to 1. */
export const WEIGHTS = {
  danger: 0.5,
  wait: 0.25,
  location: 0.15,
  review: 0.1,
} as const;

/** Lower bound of each priority band, highest first. */
export const PRIORITY_THRESHOLDS: Array<{ min: number; level: PriorityLevel }> = [
  { min: 80, level: "Critical" },
  { min: 60, level: "High" },
  { min: 35, level: "Medium" },
  { min: 0, level: "Low" },
];

export function getPriorityLevel(finalScore: number): PriorityLevel {
  for (const band of PRIORITY_THRESHOLDS) {
    if (finalScore >= band.min) return band.level;
  }
  return "Low";
}

/** Days at which the backlog factor reaches 100. */
export const WAIT_SATURATION_DAYS = 180;
