"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, Lock } from "lucide-react";

import { signIn } from "@/app/admin/login/actions";

/**
 * Staff sign-in for the inspection queue.
 *
 * Deliberately plain: one operator account, no self-service recovery, nothing
 * that suggests a resident should be signing in here.
 */
export function AdminLogin({ next }: { next?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await signIn({ username, password, next });
      if (!result.ok) {
        setError(result.error);
        setPassword("");
        return;
      }
      router.replace(result.landing);
      // The queue is a server component; without this it renders from the cache
      // that was produced for an unauthenticated request.
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label
          htmlFor="username"
          className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500"
        >
          Username
        </label>
        <input
          id="username"
          name="username"
          autoComplete="username"
          required
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          className="mt-1 h-[38px] w-full border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-slate-900"
        />
      </div>

      <div>
        <label
          htmlFor="password"
          className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500"
        >
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="mt-1 h-[38px] w-full border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-slate-900"
        />
      </div>

      {error && (
        <p
          role="alert"
          className="border-l-4 border-red-600 bg-red-50 px-3 py-2 text-sm font-medium text-red-800"
        >
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-[38px] w-full items-center justify-center gap-2 border border-slate-900 bg-slate-900 px-4 text-sm font-semibold text-white transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <Lock className="h-4 w-4" aria-hidden />
        )}
        Sign in
      </button>
    </form>
  );
}
