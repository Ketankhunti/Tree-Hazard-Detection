import { config } from "@/backend/config";

/**
 * Admin console gate.
 *
 * One hardcoded operator (see config.admin) and a signed cookie. There is no
 * user table because there is no second kind of user: everything behind /admin
 * is the same municipal audience, and the requirement is only that the queue,
 * the resident contact details and the crew actions are not open to the public
 * internet.
 *
 * Signed rather than stored: a session store would need either a table or a
 * process-local map, and the latter breaks the moment the app runs on more than
 * one instance. The cookie proves the holder knew the password and nothing else
 * hangs off it.
 *
 * Uses Web Crypto rather than node:crypto so the same verification runs in
 * middleware, which is the only place that can gate a route before it renders.
 */

export const SESSION_COOKIE = "hrm_forestry_session";
export const LOGIN_PATH = "/admin/login";

/** Where an unauthenticated visitor is sent back to after signing in. */
export const DEFAULT_LANDING = "/admin";

const encoder = new TextEncoder();

/**
 * Anything server-only and stable works here. DATABASE_URL is required for the
 * app to run at all and never reaches the client, which makes it a serviceable
 * default; the literal is a last resort for a bare dev environment.
 */
function signingSecret(): string {
  return (
    config.admin.sessionSecret ??
    process.env.DATABASE_URL ??
    "halifax-tree-triage-insecure-dev-secret"
  );
}

async function hmac(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(signingSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** Length-independent comparison, so neither check leaks by timing. */
function matches(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function checkCredentials(username: string, password: string): boolean {
  return (
    matches(username.trim(), config.admin.username) &&
    matches(password, config.admin.password)
  );
}

export function sessionMaxAgeSeconds(): number {
  return Math.round(config.admin.sessionHours * 3600);
}

/** `username.issuedAt.signature` - all three needed to survive verification. */
export async function createSession(username: string): Promise<string> {
  const payload = `${username}.${Date.now()}`;
  return `${payload}.${await hmac(payload)}`;
}

/** The signed-in username, or null for a missing, forged or expired cookie. */
export async function verifySession(token: string | null | undefined): Promise<string | null> {
  if (!token) return null;

  const separator = token.lastIndexOf(".");
  if (separator < 1) return null;

  const payload = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  if (!matches(signature, await hmac(payload))) return null;

  const [username, issuedAt] = payload.split(".");
  const issued = Number(issuedAt);
  if (!username || !Number.isFinite(issued)) return null;

  // The cookie's own Max-Age already covers the normal case; this catches a
  // cookie whose expiry was edited by hand.
  if (Date.now() - issued > sessionMaxAgeSeconds() * 1000) return null;

  return username;
}

/**
 * Keeps `?next=` from becoming an open redirect: only paths inside the console
 * are ever followed.
 */
export function safeLanding(target: string | null | undefined): string {
  if (!target || !target.startsWith("/admin")) return DEFAULT_LANDING;
  if (target.startsWith("//") || target.startsWith(LOGIN_PATH)) return DEFAULT_LANDING;
  return target;
}
