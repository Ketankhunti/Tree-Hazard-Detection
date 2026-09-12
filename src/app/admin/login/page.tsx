import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { TreePine } from "lucide-react";

import { AdminLogin } from "@/frontend/components/AdminLogin";
import {
  SESSION_COOKIE,
  safeLanding,
  verifySession,
} from "@/backend/services/auth";

export const metadata = {
  title: "Staff sign-in | Halifax Urban Forestry",
};

export const dynamic = "force-dynamic";

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: { next?: string };
}) {
  // Already signed in: skip the form rather than asking twice.
  if (await verifySession(cookies().get(SESSION_COOKIE)?.value)) {
    redirect(safeLanding(searchParams.next));
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3 sm:px-6">
          <div className="flex h-9 w-9 items-center justify-center bg-slate-900">
            <TreePine className="h-5 w-5 text-white" aria-hidden />
          </div>
          <div>
            <p className="text-base font-bold leading-tight text-slate-900">
              Halifax Regional Municipality
            </p>
            <p className="text-xs leading-tight text-slate-500">
              Urban Forestry &middot; Staff access
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-md px-4 py-12 sm:px-6">
        <h1 className="text-xl font-bold tracking-tight text-slate-900">
          Inspection queue sign-in
        </h1>
        <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
          For Urban Forestry staff. The queue contains resident contact details,
          so it is not open to the public.
        </p>

        <div className="mt-5 border border-slate-200 bg-white p-5">
          <AdminLogin next={searchParams.next} />
        </div>

        <p className="mt-5 text-xs leading-relaxed text-slate-500">
          Reporting a tree does not need an account &mdash;{" "}
          <Link href="/" className="font-semibold underline">
            report a tree problem
          </Link>
          .
        </p>
      </main>
    </div>
  );
}
