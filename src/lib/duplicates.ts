import { config } from "./config";
import { distanceMeters } from "./geo";
import type { ScoredRequest, TreeRequest } from "./types";

/**
 * Same-tree detection.
 *
 * When a large tree comes down, a dozen neighbours report it. Left alone that
 * fills the top of the priority queue with one tree, and makes the same-day
 * bundling feature recommend "five nearby jobs" that are all the same job.
 *
 * Three independent signals, because no single one is sufficient:
 *
 *   PROXIMITY  Two reports of the same tree are metres apart. But two genuinely
 *              different trees on one block are also metres apart, and a
 *              street-centroid geocode puts every address on a street at the
 *              same point - so proximity alone would merge a whole street.
 *   RECENCY    The same tree gets reported within days. A report six months
 *              later is a new problem, or the same one nobody fixed.
 *   SIMILARITY Two descriptions of one event share distinctive words.
 *
 * The score is deliberately conservative: a wrong merge HIDES a real hazard
 * from the queue, which is worse than showing a duplicate. Anything below the
 * auto-link threshold is surfaced as a suggestion for a human instead.
 */

/** Words too common in tree complaints to carry any signal. */
const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "but", "is", "are", "was", "were", "be",
  "been", "it", "its", "this", "that", "there", "here", "of", "in", "on",
  "at", "to", "for", "with", "from", "by", "my", "our", "their", "has",
  "have", "had", "not", "no", "can", "could", "would", "will", "please",
  "tree", "trees", "street", "road", "avenue", "i", "we", "you", "they",
  "some", "very", "about", "over", "under", "up", "down", "out", "now",
]);

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length > 2 && !STOP_WORDS.has(word))
  );
}

/** Jaccard overlap of the two descriptions' meaningful words. */
export function textSimilarity(a: string, b: string): number {
  const setA = tokenize(a);
  const setB = tokenize(b);
  if (setA.size === 0 || setB.size === 0) return 0;

  let shared = 0;
  for (const word of setA) if (setB.has(word)) shared += 1;

  const union = setA.size + setB.size - shared;
  return union === 0 ? 0 : shared / union;
}

function daysApart(a: string, b: string): number {
  const diff = Math.abs(new Date(a).getTime() - new Date(b).getTime());
  return diff / 86_400_000;
}

export interface DuplicateCandidate {
  request: ScoredRequest;
  /** 0-1. At or above config.duplicates.autoLinkConfidence it is auto-linked. */
  confidence: number;
  distanceMeters: number;
  daysApart: number;
  similarity: number;
  /** Human-readable justification shown in the admin UI. */
  reason: string;
}

interface Candidate {
  id: string;
  description: string;
  submittedAt: string;
  latitude: number | null;
  longitude: number | null;
  street: string;
}

/**
 * Scores one pair. Returns null when any hard gate fails.
 *
 * Coordinates are required on both sides: without them proximity is unknown,
 * and text similarity alone is far too weak to merge on.
 */
function scorePair(
  incoming: Candidate,
  existing: Candidate
): { confidence: number; meters: number; days: number; similarity: number } | null {
  if (incoming.id === existing.id) return null;

  const meters = distanceMeters(incoming, existing);
  if (meters === null) return null;

  const { radiusMeters, windowDays, similarityThreshold } = config.duplicates;
  if (meters > radiusMeters) return null;

  const days = daysApart(incoming.submittedAt, existing.submittedAt);
  if (days > windowDays) return null;

  const similarity = textSimilarity(incoming.description, existing.description);
  if (similarity < similarityThreshold) return null;

  // Each factor normalized so 1 = perfect, then weighted. Similarity carries
  // the most weight because it is the only signal that distinguishes two
  // different trees standing next to each other.
  const proximityScore = 1 - meters / radiusMeters;
  const recencyScore = 1 - days / windowDays;
  const similarityScore = Math.min(similarity / 0.5, 1);

  const confidence =
    proximityScore * 0.3 + recencyScore * 0.2 + similarityScore * 0.5;

  return { confidence, meters, days, similarity };
}

function describe(
  meters: number,
  days: number,
  similarity: number,
  reference: string
): string {
  const when =
    days < 1
      ? "the same day"
      : `${Math.round(days)} day${Math.round(days) === 1 ? "" : "s"} apart`;
  return `${Math.round(meters)} m from ${reference}, reported ${when}, with ${Math.round(
    similarity * 100
  )}% wording overlap.`;
}

/**
 * Finds existing reports that may describe the same tree as `incoming`.
 * Highest confidence first.
 */
export function findDuplicateCandidates(
  incoming: {
    id: string;
    description: string;
    submittedAt: string;
    latitude: number | null;
    longitude: number | null;
    street: string;
  },
  existing: ScoredRequest[]
): DuplicateCandidate[] {
  const candidates: DuplicateCandidate[] = [];

  for (const other of existing) {
    // Never chain a duplicate onto a duplicate; always point at the primary.
    if (other.duplicateOfId) continue;

    const scored = scorePair(incoming, other);
    if (!scored) continue;

    candidates.push({
      request: other,
      confidence: scored.confidence,
      distanceMeters: scored.meters,
      daysApart: scored.days,
      similarity: scored.similarity,
      reason: describe(
        scored.meters,
        scored.days,
        scored.similarity,
        other.reference
      ),
    });
  }

  return candidates.sort((a, b) => b.confidence - a.confidence);
}

/** The single best candidate, only if it clears the auto-link bar. */
export function pickAutoLink(
  candidates: DuplicateCandidate[]
): DuplicateCandidate | null {
  const best = candidates[0];
  if (!best) return null;
  return best.confidence >= config.duplicates.autoLinkConfidence ? best : null;
}

export type { TreeRequest };
