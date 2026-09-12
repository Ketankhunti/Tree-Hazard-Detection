import type { ScoredComplaint } from "../types";
import { PriorityBadge } from "./PriorityBadge";

export function HazardPoster({ complaint }: { complaint: ScoredComplaint }) {
  const today = new Date().toLocaleDateString("en-CA");

  return (
    <div className="print-poster hidden bg-white" id="hazard-poster">
      {/* Red Header */}
      <div className="bg-red-700 text-white text-center py-4 px-6">
        <h1 className="text-2xl font-bold uppercase tracking-wide">
          Urgent Tree Hazard Assessment
        </h1>
      </div>

      {/* Address */}
      <div className="px-6 py-6 text-center border-b-2 border-gray-300">
        <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">Address</p>
        <p className="text-3xl font-bold text-gray-900">{complaint.address}</p>
        <p className="text-sm text-gray-600 mt-1">
          {complaint.neighborhood}, Halifax, NS
        </p>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-4 gap-4 px-6 py-4 border-b border-gray-200">
        <div className="text-center">
          <p className="text-xs uppercase tracking-wide text-gray-500">Priority Level</p>
          <div className="mt-1 flex justify-center">
            <PriorityBadge priority={complaint.priority} />
          </div>
        </div>
        <div className="text-center">
          <p className="text-xs uppercase tracking-wide text-gray-500">Danger Score</p>
          <p className="text-2xl font-bold text-red-600">{complaint.scores.dangerScore}</p>
        </div>
        <div className="text-center">
          <p className="text-xs uppercase tracking-wide text-gray-500">Final Score</p>
          <p className="text-2xl font-bold text-gray-900">{complaint.scores.finalScore}</p>
        </div>
        <div className="text-center">
          <p className="text-xs uppercase tracking-wide text-gray-500">Days Waiting</p>
          <p className="text-2xl font-bold text-gray-900">{complaint.daysWaiting}</p>
        </div>
      </div>

      {/* Text-Image Conflict Warning */}
      {complaint.textImageConflict && (
        <div className="px-6 py-3 bg-amber-50 border-b-2 border-amber-400">
          <p className="text-sm font-bold text-amber-900">⚠ Text-Image Conflict</p>
          <p className="text-xs text-amber-800 mt-1">
            The description does not match the field photo. Score weighted toward photo evidence.
          </p>
        </div>
      )}

      {/* Hazards */}
      <div className="px-6 py-4 border-b border-gray-200">
        <h2 className="text-sm font-bold uppercase tracking-wide text-gray-700 mb-2">
          Hazards Identified
        </h2>
        {complaint.hazards.length > 0 ? (
          <ul className="list-disc list-inside space-y-1">
            {complaint.hazards.map((h, i) => (
              <li key={i} className="text-sm text-gray-800">
                {h.label} <span className="text-gray-400">(+{h.points} pts, {h.source})</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-500 italic">
            No specific hazards detected from complaint text or field photo.
          </p>
        )}
      </div>

      {/* Reasoning */}
      <div className="px-6 py-4 border-b border-gray-200">
        <h2 className="text-sm font-bold uppercase tracking-wide text-gray-700 mb-2">
          AI Prioritization Reasoning
        </h2>
        <p className="text-sm text-gray-800 leading-relaxed">{complaint.reasoning}</p>
      </div>

      {/* Score Breakdown */}
      <div className="px-6 py-4 border-b border-gray-200">
        <h2 className="text-sm font-bold uppercase tracking-wide text-gray-700 mb-2">
          Score Breakdown
        </h2>
        <table className="w-full text-sm">
          <tbody>
            <tr className="border-b border-gray-100">
              <td className="py-1.5 font-medium text-gray-600">Text Danger (35%)</td>
              <td className="py-1.5 text-right font-semibold text-gray-900">{complaint.scores.textDangerScore} / 100</td>
            </tr>
            <tr className="border-b border-gray-100">
              <td className="py-1.5 font-medium text-gray-600">Image Danger (65%)</td>
              <td className="py-1.5 text-right font-semibold text-gray-900">{complaint.scores.imageDangerScore} / 100</td>
            </tr>
            <tr className="border-b border-gray-100">
              <td className="py-1.5 font-medium text-gray-600">Combined Danger (50%)</td>
              <td className="py-1.5 text-right font-semibold text-gray-900">{complaint.scores.dangerScore} / 100</td>
            </tr>
            <tr className="border-b border-gray-100">
              <td className="py-1.5 font-medium text-gray-600">Wait Time (25%)</td>
              <td className="py-1.5 text-right font-semibold text-gray-900">{Math.round(complaint.scores.waitScore)} / 100</td>
            </tr>
            <tr className="border-b border-gray-100">
              <td className="py-1.5 font-medium text-gray-600">Location Impact (15%)</td>
              <td className="py-1.5 text-right font-semibold text-gray-900">{complaint.scores.locationScore} / 100</td>
            </tr>
            <tr className="border-b border-gray-100">
              <td className="py-1.5 font-medium text-gray-600">Human Review (10%)</td>
              <td className="py-1.5 text-right font-semibold text-gray-900">{complaint.scores.reviewScore} / 100</td>
            </tr>
            <tr>
              <td className="py-1.5 font-bold text-gray-900">Final Priority Score</td>
              <td className="py-1.5 text-right font-bold text-gray-900">{complaint.scores.finalScore} / 100</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Assessment Date */}
      <div className="px-6 py-3 border-b border-gray-200">
        <p className="text-xs uppercase tracking-wide text-gray-500">Assessment Date</p>
        <p className="text-sm font-medium text-gray-900">{today}</p>
      </div>

      {/* Footer Disclaimer */}
      <div className="px-6 py-4">
        <p className="text-xs text-center text-gray-500 italic">
          Automated triage assessment — final determination requires qualified arborist inspection.
        </p>
      </div>
    </div>
  );
}
