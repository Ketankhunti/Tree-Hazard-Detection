import Link from "next/link";
import { TreePine } from "lucide-react";

import { ReportForm } from "@/frontend/components/ReportForm";

export const metadata = {
  title: "Report a tree | Halifax Urban Forestry",
};

export default function ReportPage() {
  return (
    <div className="min-h-screen bg-slate-50">
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
              Urban Forestry &middot; Report a tree
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Report a tree problem
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
          Tell us what you can see and we will decide how quickly an arborist
          needs to visit. Reports that describe an immediate danger are moved to
          the front of the queue automatically.
        </p>

        <div className="mt-6 border border-slate-200 bg-white p-5 sm:p-6">
          <ReportForm />
        </div>

        <p className="mt-6 text-xs text-slate-500">
          Municipal staff can open the{" "}
          <Link href="/admin" className="font-semibold underline">
            inspection queue
          </Link>
          .
        </p>
      </main>
    </div>
  );
}
