import { Eye, EyeOff, ImageOff, ScanSearch, TriangleAlert } from "lucide-react";

import type { Assessment, FusionVerdict } from "@/lib/types";

const VERDICT_STYLE: Record<
  FusionVerdict,
  { label: string; tone: string; icon: typeof Eye }
> = {
  "text-only": {
    label: "Description only",
    tone: "border-slate-300 bg-slate-50 text-slate-700",
    icon: EyeOff,
  },
  agree: {
    label: "Photo agrees with description",
    tone: "border-emerald-300 bg-emerald-50 text-emerald-900",
    icon: Eye,
  },
  "image-worse": {
    label: "Photo shows more than described",
    tone: "border-red-300 bg-red-50 text-red-900",
    icon: TriangleAlert,
  },
  "text-worse": {
    label: "Description exceeds what the photo shows",
    tone: "border-amber-300 bg-amber-50 text-amber-900",
    icon: TriangleAlert,
  },
  "image-unusable": {
    label: "Photo could not be assessed",
    tone: "border-slate-300 bg-slate-50 text-slate-700",
    icon: ImageOff,
  },
  "image-resolved-vagueness": {
    label: "Photo resolved a vague description",
    tone: "border-blue-300 bg-blue-50 text-blue-900",
    icon: ScanSearch,
  },
};

/**
 * Shows how the photograph moved the danger score. The two source scores are
 * always displayed side by side so a disagreement is visible rather than
 * averaged away silently.
 */
export function PhotoAssessment({ assessment }: { assessment: Assessment }) {
  const { fusion, imageFindings } = assessment;
  const style = VERDICT_STYLE[fusion.verdict];
  const Icon = style.icon;

  return (
    <section className="panel p-4">
      <h2 className="text-sm font-bold uppercase tracking-wide text-slate-900">
        Photo Assessment
      </h2>

      <div className={`mt-3 flex items-start gap-2.5 border px-3 py-2.5 ${style.tone}`}>
        <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <div>
          <p className="text-sm font-semibold">{style.label}</p>
          <p className="mt-0.5 text-xs leading-relaxed">{fusion.note}</p>
        </div>
      </div>

      {fusion.verdict !== "text-only" && (
        <dl className="mt-4 grid grid-cols-3 gap-4 border-t border-slate-200 pt-3">
          <div>
            <dt className="label-caps">From text</dt>
            <dd className="mt-0.5 font-mono text-lg font-bold tabular-nums text-slate-900">
              {fusion.textDanger}
            </dd>
          </div>
          <div>
            <dt className="label-caps">From photo</dt>
            <dd className="mt-0.5 font-mono text-lg font-bold tabular-nums text-slate-900">
              {fusion.imageDanger ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="label-caps">Used</dt>
            <dd className="mt-0.5 font-mono text-lg font-bold tabular-nums text-slate-900">
              {assessment.breakdown.danger}
            </dd>
          </div>
        </dl>
      )}

      {imageFindings && (
        <div className="mt-3 border-t border-slate-200 pt-3">
          <p className="label-caps">Model reading</p>
          <p className="mt-1 text-sm text-slate-700">{imageFindings.summary}</p>
          <p className="mt-1.5 font-mono text-[11px] text-slate-400">
            {imageFindings.model} · confidence{" "}
            {Math.round(imageFindings.confidence * 100)}%
          </p>
        </div>
      )}
    </section>
  );
}
