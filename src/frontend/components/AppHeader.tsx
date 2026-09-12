import Link from "next/link";
import { TreePine } from "lucide-react";

export function AppHeader({ status }: { status?: string }) {
  return (
    <header className="no-print border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <Link href="/admin" className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center bg-slate-900">
            <TreePine className="h-5 w-5 text-white" aria-hidden />
          </div>
          <div>
            <h1 className="text-base font-bold leading-tight tracking-tight text-slate-900">
              Halifax Urban Forestry
            </h1>
            <p className="text-xs leading-tight text-slate-500">
              Tree Hazard Prioritization
            </p>
          </div>
        </Link>

        <div className="flex items-center gap-3">
          <Link
            href="/report"
            className="border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100"
          >
            Public report form
          </Link>
          {status && (
          <div className="flex items-center gap-2 border border-slate-200 bg-slate-50 px-3 py-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
            <span className="font-mono text-xs font-medium text-slate-600">
              {status}
            </span>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
