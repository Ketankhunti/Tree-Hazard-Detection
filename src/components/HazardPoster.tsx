import type { ScoredRequest } from "@/lib/types";

/**
 * One-page US Letter field assessment sheet.
 *
 * On screen this renders as a scaled preview card; in print it is the only
 * element left in the box (see the @media print block in index.css), so the
 * layout below is sized for a 7.5in x 10in printable area.
 */
export function HazardPoster({ complaint }: { complaint: ScoredRequest }) {
  const { assessment } = complaint;
  const assessmentDate = new Date().toLocaleDateString("en-CA", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const isUrgent =
    assessment.priority === "Critical" || assessment.priority === "High";

  return (
    <article className="hazard-poster mx-auto w-full max-w-[8.5in] border border-slate-300 bg-white p-[0.4in] text-slate-900 print:border-0 print:p-0">
      {/* Masthead */}
      <header className="poster-block">
        <div
          className={`px-5 py-4 text-white ${isUrgent ? "bg-red-700" : "bg-slate-800"}`}
        >
          <h1 className="text-center text-[30px] font-extrabold uppercase leading-none tracking-tight">
            {isUrgent ? "Urgent Tree Hazard Assessment" : "Tree Hazard Assessment"}
          </h1>
          <p className="mt-2 text-center text-[11px] font-semibold uppercase tracking-[0.2em] text-white/80">
            Halifax Regional Municipality &middot; Urban Forestry Operations
          </p>
        </div>

        <div className="border-x-2 border-b-2 border-slate-900 px-5 py-4 text-center">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
            Inspection Location
          </p>
          <p className="mt-1 text-[38px] font-extrabold uppercase leading-[1.05] tracking-tight">
            {complaint.address}
          </p>
          <p className="mt-1 text-sm font-semibold uppercase tracking-wide text-slate-600">
            {complaint.neighborhood}, Halifax, NS
          </p>
        </div>
      </header>

      {/* Score strip */}
      <section className="poster-block mt-4 grid grid-cols-4 gap-px border-2 border-slate-900 bg-slate-900">
        <Metric
          label="Priority Level"
          value={assessment.priority.toUpperCase()}
          emphasis={isUrgent ? "danger" : "normal"}
        />
        <Metric label="Danger Score" value={`${assessment.breakdown.danger}`} suffix="/100" />
        <Metric label="Final Priority" value={`${assessment.finalScore}`} suffix="/100" />
        <Metric label="Days Waiting" value={`${complaint.daysWaiting}`} suffix="days" />
      </section>

      {assessment.reviewStatus === "Unsure" && (
        <p className="poster-block mt-3 border-2 border-purple-700 bg-purple-50 px-4 py-2 text-center text-[12px] font-bold uppercase tracking-wide text-purple-900">
          Flagged for human review &mdash; insufficient detail in the original complaint
        </p>
      )}

      {/* Complaint */}
      <section className="poster-block mt-4">
        <SectionHeading>Original Complaint</SectionHeading>
        <p className="mt-1.5 border-l-4 border-slate-300 pl-3 text-[12.5px] italic leading-snug text-slate-800">
          &ldquo;{complaint.description}&rdquo;
        </p>
        <p className="mt-1.5 font-mono text-[10px] text-slate-500">
          Ref {complaint.reference} &middot; Submitted{" "}
          {complaint.submittedAt.slice(0, 10)} &middot; Status: {complaint.status}
        </p>
      </section>

      {/* Hazards */}
      <section className="poster-block mt-4">
        <SectionHeading>Hazards Identified</SectionHeading>
        {assessment.hazards.length > 0 ? (
          <ul className="mt-1.5 grid grid-cols-2 gap-x-6 gap-y-0.5">
            {assessment.hazards.map((hazard) => (
              <li key={hazard.id} className="flex items-baseline gap-2 text-[12.5px]">
                <span className="text-slate-900">&bull;</span>
                <span className="font-semibold">{hazard.label}</span>
                <span className="text-slate-500">
                  &mdash; &ldquo;{hazard.evidence}&rdquo;
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1.5 text-[12.5px] text-slate-600">
            No specific hazards detected from complaint text.
          </p>
        )}
      </section>

      {/* Reasoning */}
      <section className="poster-block mt-4">
        <SectionHeading>AI Prioritization Reasoning</SectionHeading>
        <p className="mt-1.5 text-[12.5px] leading-snug text-slate-800">
          {assessment.reasoning}
        </p>
        <div className="mt-2 grid grid-cols-4 gap-3 border-t border-slate-200 pt-2">
          <ScoreLine label="Danger" value={assessment.breakdown.danger} weight="50%" />
          <ScoreLine label="Wait Time" value={assessment.breakdown.wait} weight="25%" />
          <ScoreLine label="Location" value={assessment.breakdown.location} weight="15%" />
          <ScoreLine label="Human Review" value={assessment.breakdown.review} weight="10%" />
        </div>
      </section>

      {/* Sign-off */}
      <section className="poster-block mt-4 grid grid-cols-[1fr_1fr_150px] gap-4 border-t-2 border-slate-900 pt-3">
        <SignatureLine label="Inspecting Arborist" />
        <SignatureLine label="Field Determination" />
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
            Assessment Date
          </p>
          <p className="mt-1 border-b border-slate-400 pb-1 text-[12.5px] font-semibold">
            {assessmentDate}
          </p>
        </div>
      </section>

      <footer className="poster-block mt-3 border-t border-slate-300 pt-2">
        <p className="text-center text-[10px] leading-snug text-slate-600">
          Automated triage assessment &mdash; final determination requires qualified
          arborist inspection. This sheet prioritizes the order of inspection only and
          does not certify that a tree is or is not dangerous.
        </p>
      </footer>
    </article>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="border-b-2 border-slate-900 pb-1 text-[11px] font-extrabold uppercase tracking-[0.14em] text-slate-900">
      {children}
    </h2>
  );
}

function Metric({
  label,
  value,
  suffix,
  emphasis = "normal",
}: {
  label: string;
  value: string;
  suffix?: string;
  emphasis?: "normal" | "danger";
}) {
  return (
    <div className="bg-white px-2 py-2.5 text-center">
      <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-slate-500">
        {label}
      </p>
      <p
        className={`mt-0.5 font-mono text-[26px] font-extrabold leading-none tabular-nums ${
          emphasis === "danger" ? "text-red-700" : "text-slate-900"
        } ${value.length > 6 ? "text-[17px]" : ""}`}
      >
        {value}
      </p>
      {suffix && (
        <p className="mt-0.5 text-[9px] font-semibold uppercase text-slate-400">{suffix}</p>
      )}
    </div>
  );
}

function ScoreLine({
  label,
  value,
  weight,
}: {
  label: string;
  value: number;
  weight: string;
}) {
  return (
    <div>
      <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-slate-500">
        {label} <span className="text-slate-400">({weight})</span>
      </p>
      <p className="font-mono text-[15px] font-bold tabular-nums">
        {value}
        <span className="text-[10px] font-normal text-slate-400"> / 100</span>
      </p>
    </div>
  );
}

function SignatureLine({ label }: { label: string }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
        {label}
      </p>
      <div className="mt-1 h-[18px] border-b border-slate-400" />
    </div>
  );
}
