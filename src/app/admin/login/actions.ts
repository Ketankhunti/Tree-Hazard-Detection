"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  LOGIN_PATH,
  SESSION_COOKIE,
  checkCredentials,
  createSession,
  safeLanding,
  sessionMaxAgeSeconds,
} from "@/backend/services/auth";

export type SignInResult = { ok: true; landing: string } | { ok: false; error: string };

export async function signIn(input: {
  username: string;
  password: string;
  next?: string;
}): Promise<SignInResult> {
  if (!checkCredentials(input.username, input.password)) {
    // One message for both a wrong username and a wrong password: naming which
    // half failed tells an attacker which half to keep.
    return { ok: false, error: "Incorrect username or password." };
  }

  cookies().set(SESSION_COOKIE, await createSession(input.username.trim()), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: sessionMaxAgeSeconds(),
  });

  // The client navigates rather than the server redirecting, so the cookie is
  // already set by the time middleware sees the next request.
  return { ok: true, landing: safeLanding(input.next) };
}

export async function signOut(): Promise<void> {
  cookies().delete(SESSION_COOKIE);
  redirect(LOGIN_PATH);
}
