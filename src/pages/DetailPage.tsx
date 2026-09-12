import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, MapPin, Printer, Calendar, Clock, Camera, AlertTriangle, ShieldCheck, Eye, Loader2, TreePine, Sparkles } from "lucide-react";
import { fetchComplaintById, analyzeHazard, type BackendComplaint, type AIHazardAnalysis } from "../lib/api";
import { scoreComplaint, scoreComplaintWithAI } from "../lib/scoringEngine";
import type { ScoredComplaint } from "../types";
import { PriorityBadge, ReviewBadge } from "../components/PriorityBadge";
import { AssessmentBreakdown } from "../components/AssessmentBreakdown";
import { HazardTag } from "../components/HazardTag";
import { HazardPoster } from "../components/HazardPoster";

export function DetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [complaint, setComplaint] = useState<BackendComplaint | null>(null);
  const [loading, setLoading] = useState(true);
  const [aiAnalysis, setAiAnalysis] = useState<AIHazardAnalysis | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    setAiAnalysis(null);
    setAiError(null);
    fetchComplaintById(id).then(({ complaint }) => {
      if (!cancelled) {
        setComplaint(complaint);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [id]);

  // Trigger AI analysis when complaint loads (for citizen complaints with photos)
  useEffect(() => {
    if (!complaint || complaint.source !== "citizen") return;
    if (aiAnalysis || aiLoading) return;

    let cancelled = false;
    setAiLoading(true);
    setAiError(null);

    analyzeHazard({
      complaintText: complaint.complaintText,
      complaintId: complaint.id,
    })
      .then((result) => {
        if (!cancelled) {
          setAiAnalysis(result);
          setAiLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setAiError(err.message);
          setAiLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [complaint, aiAnalysis, aiLoading]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!complaint) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500">Complaint not found.</p>
          <button
            className="mt-4 rounded border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            onClick={() => navigate("/")}
          >
            Back to Queue
          </button>
        </div>
      </div>
    );
  }

  // Use AI-powered scoring if available, otherwise fall back to deterministic
  const scored: ScoredComplaint = aiAnalysis
    ? scoreComplaintWithAI(complaint, aiAnalysis)
    : scoreComplaint(complaint);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="no-print border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-7xl px-6 py-4">
          <div className="flex items-center justify-between">
            <button
              className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
              onClick={() => navigate("/")}
            >
              <ArrowLeft size={16} strokeWidth={2} />
              Back to Queue
            </button>
            <button
              className="inline-flex items-center gap-2 rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
              onClick={() => window.print()}
            >
              <Printer size={16} strokeWidth={2} />
              Print Poster
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="no-print mx-auto max-w-7xl space-y-6 px-6 py-6">
        {/* Title */}
        <div className="border-b border-gray-200 pb-4">
          <h1 className="text-2xl font-bold text-gray-900">Tree Hazard Assessment</h1>
          <p className="text-sm text-gray-500">{complaint.id}</p>
        </div>

        {/* Key Info Grid */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <div className="rounded-lg border border-gray-200 bg-white p-3">
            <p className="text-xs uppercase tracking-wide text-gray-500">Address</p>
            <p className="text-sm font-semibold text-gray-900">{complaint.address}</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-3">
            <p className="text-xs uppercase tracking-wide text-gray-500">Neighborhood</p>
            <p className="text-sm font-semibold text-gray-900">{complaint.neighborhood}</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-3">
            <p className="text-xs uppercase tracking-wide text-gray-500">Priority</p>
            <div className="mt-1"><PriorityBadge priority={scored.priority} /></div>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-3">
            <p className="text-xs uppercase tracking-wide text-gray-500">Final Score</p>
            <p className="text-lg font-bold text-gray-900">{scored.scores.finalScore}</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-3">
            <p className="text-xs uppercase tracking-wide text-gray-500">Danger Score</p>
            <p className="text-lg font-bold text-red-600">{scored.scores.dangerScore}</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-3">
            <p className="text-xs uppercase tracking-wide text-gray-500">Days Waiting</p>
            <p className="text-lg font-bold text-gray-900">{complaint.daysWaiting}</p>
          </div>
        </div>

        {/* HRM Tree Inventory Data (from backend) */}
        {complaint.treeData && (
          <div className="rounded-lg border border-green-200 bg-green-50 p-5">
            <div className="flex items-center gap-2 mb-3">
              <TreePine size={18} className="text-green-700" />
              <h2 className="text-sm font-bold uppercase tracking-wide text-green-800">
                HRM Tree Inventory Record
              </h2>
              <span className="ml-auto text-xs text-green-600">Live HRM Open Data</span>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              <div>
                <p className="text-xs text-green-600">Species</p>
                <p className="text-sm font-semibold text-gray-900">{complaint.treeData.commonName}</p>
                {complaint.treeData.scientificName && (
                  <p className="text-xs italic text-gray-500">{complaint.treeData.scientificName}</p>
                )}
              </div>
              <div>
                <p className="text-xs text-green-600">Trunk Size (DBH)</p>
                <p className="text-sm font-semibold text-gray-900">{complaint.treeData.dbhLabel}</p>
              </div>
              <div>
                <p className="text-xs text-green-600">Overhead Wires</p>
                <p className={`text-sm font-semibold ${complaint.treeData.wiresPresent ? "text-red-600" : "text-green-700"}`}>
                  {complaint.treeData.wiresPresent ? "Yes ⚠" : "No"}
                </p>
              </div>
              <div>
                <p className="text-xs text-green-600">Feature Type</p>
                <p className="text-sm font-semibold text-gray-900">{complaint.treeData.featureLabel}</p>
              </div>
              <div>
                <p className="text-xs text-green-600">Asset Status</p>
                <p className="text-sm font-semibold text-gray-900">{complaint.treeData.statusLabel}</p>
              </div>
              <div>
                <p className="text-xs text-green-600">Location Type</p>
                <p className="text-sm font-semibold text-gray-900">
                  {complaint.treeData.generalLocation === "ROW" ? "Right-of-Way" : complaint.treeData.generalLocation}
                </p>
              </div>
              <div>
                <p className="text-xs text-green-600">Asset ID</p>
                <p className="text-sm font-mono text-gray-700">{complaint.treeData.assetId}</p>
              </div>
              {complaint.treeData.yearPlanted && (
                <div>
                  <p className="text-xs text-green-600">Year Planted</p>
                  <p className="text-sm font-semibold text-gray-900">{complaint.treeData.yearPlanted}</p>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Left Column */}
          <div className="space-y-6">
            {/* Complaint Text */}
            <div className="rounded-lg border border-gray-200 bg-white p-5">
              <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-gray-700">Complaint</h2>
              <p className="text-gray-800 leading-relaxed italic">"{complaint.complaintText}"</p>
              <div className="mt-3 flex items-center gap-4 text-xs text-gray-500">
                <span className="inline-flex items-center gap-1">
                  <Calendar size={12} /> {complaint.submittedDate}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Clock size={12} /> {complaint.daysWaiting} days waiting
                </span>
                <ReviewBadge status={scored.reviewStatus} />
              </div>
            </div>

            {/* AI Assessment */}
            <div className="rounded-lg border border-gray-200 bg-white p-5">
              <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-gray-700">
                Why This Was Prioritized
              </h2>
              <p className="text-sm text-gray-700 leading-relaxed">{scored.reasoning}</p>
            </div>

            {/* Text-Image Conflict Warning */}
            {scored.textImageConflict && (
              <div className="rounded-lg border-2 border-amber-400 bg-amber-50 p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle size={20} className="mt-0.5 shrink-0 text-amber-600" />
                  <div>
                    <h3 className="text-sm font-bold text-amber-900">Text-Image Conflict Detected</h3>
                    <p className="mt-1 text-sm text-amber-800">
                      The citizen's description does not match the field photo evidence. The danger score has been weighted toward the photo to prevent exaggeration. This complaint should be reviewed carefully.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Hazards */}
            <div className="rounded-lg border border-gray-200 bg-white p-5">
              <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-gray-700">
                Hazards Detected
              </h2>
              {scored.hazards.length > 0 ? (
                <div className="space-y-3">
                  {/* Group by source */}
                  {scored.hazards.some((h) => h.source === "text") && (
                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-orange-600">From Text Description</p>
                      <div className="flex flex-wrap gap-2">
                        {scored.hazards.filter((h) => h.source === "text").map((h, i) => (
                          <HazardTag key={`t-${i}`} label={h.label} />
                        ))}
                      </div>
                    </div>
                  )}
                  {scored.hazards.some((h) => h.source === "image") && (
                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-red-600">From Field Photo</p>
                      <div className="flex flex-wrap gap-2">
                        {scored.hazards.filter((h) => h.source === "image").map((h, i) => (
                          <HazardTag key={`i-${i}`} label={h.label} />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-gray-500 italic">
                  No specific hazards detected from complaint text or field photo.
                </p>
              )}
            </div>
          </div>

          {/* Right Column */}
          <div className="space-y-6">
            {/* Score Breakdown */}
            <div className="rounded-lg border border-gray-200 bg-white p-5">
              <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-gray-700">
                Scoring Breakdown
              </h2>
              <AssessmentBreakdown scores={scored.scores} />
            </div>

            {/* Map Placeholder */}
            <div className="rounded-lg border border-gray-200 bg-white p-5">
              <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-gray-700">
                Inspection Location
              </h2>
              <div className="relative h-48 overflow-hidden rounded border border-gray-200 bg-gray-100">
                {/* Stylized street grid */}
                <svg className="absolute inset-0 h-full w-full" viewBox="0 0 400 200">
                  <defs>
                    <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                      <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#d1d5db" strokeWidth="1" />
                    </pattern>
                  </defs>
                  <rect width="100%" height="100%" fill="url(#grid)" />
                  <line x1="0" y1="100" x2="400" y2="100" stroke="#9ca3af" strokeWidth="2" />
                  <line x1="200" y1="0" x2="200" y2="200" stroke="#9ca3af" strokeWidth="2" />
                  <line x1="0" y1="50" x2="400" y2="50" stroke="#d1d5db" strokeWidth="1.5" />
                  <line x1="0" y1="150" x2="400" y2="150" stroke="#d1d5db" strokeWidth="1.5" />
                  <line x1="100" y1="0" x2="100" y2="200" stroke="#d1d5db" strokeWidth="1.5" />
                  <line x1="300" y1="0" x2="300" y2="200" stroke="#d1d5db" strokeWidth="1.5" />
                </svg>
                {/* Pin */}
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-full">
                  <MapPin size={32} className="text-red-600 fill-red-500" strokeWidth={1.5} />
                </div>
                <div className="absolute bottom-2 left-2 rounded bg-white/90 px-2 py-1 text-xs font-medium text-gray-700">
                  {complaint.address}
                </div>
              </div>
              <p className="mt-2 text-xs text-gray-500">
                {complaint.latitude.toFixed(4)}, {complaint.longitude.toFixed(4)}
              </p>
            </div>

            {/* Field Photo + AI Analysis */}
            <div className="rounded-lg border border-gray-200 bg-white p-5">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-bold uppercase tracking-wide text-gray-700">
                  Field Photo & AI Analysis
                </h2>
                {aiAnalysis && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700">
                    <Sparkles size={12} /> AI-Powered
                  </span>
                )}
              </div>

              {/* Photo display */}
              {complaint.photoUrl ? (
                <img
                  src={`http://localhost:3001${complaint.photoUrl}`}
                  alt="Field photo"
                  className="h-48 w-full rounded border border-gray-200 object-cover"
                />
              ) : (
                <div className="flex h-40 items-center justify-center rounded border border-dashed border-gray-300 bg-gray-50">
                  <div className="text-center">
                    <Camera size={32} className="mx-auto text-gray-300" />
                    <p className="mt-2 text-sm text-gray-400">No photo submitted</p>
                  </div>
                </div>
              )}

              {/* AI Loading state */}
              {aiLoading && (
                <div className="mt-4 flex items-center gap-2 rounded border border-purple-200 bg-purple-50 p-3">
                  <Loader2 size={16} className="animate-spin text-purple-600" />
                  <p className="text-sm text-purple-700">
                    AI is analyzing the photo and complaint text…
                  </p>
                </div>
              )}

              {/* AI Error */}
              {aiError && !aiLoading && (
                <div className="mt-4 rounded border border-amber-300 bg-amber-50 p-3">
                  <p className="text-sm text-amber-800">
                    AI analysis unavailable: {aiError}. Showing rule-based assessment.
                  </p>
                </div>
              )}

              {/* AI / Image analysis results */}
              {scored.imageDetection && !aiLoading && (
                <div className="mt-4 space-y-3">
                  {/* Confidence indicator */}
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Image Confidence</span>
                    <span className={`text-sm font-bold ${scored.imageDetection.confidence > 0.7 ? "text-green-600" : scored.imageDetection.confidence > 0.5 ? "text-amber-600" : "text-red-600"}`}>
                      {Math.round(scored.imageDetection.confidence * 100)}%
                    </span>
                  </div>
                  {/* Image analysis summary */}
                  <div className={`rounded border p-3 ${scored.imageDetection.confidence <= 0.5 ? "border-amber-300 bg-amber-50" : "border-gray-200 bg-gray-50"}`}>
                    <div className="flex items-start gap-2">
                      {scored.imageDetection.confidence <= 0.5 ? (
                        <Eye size={16} className="mt-0.5 shrink-0 text-amber-600" />
                      ) : scored.imageDetection.hazards.length > 0 ? (
                        <AlertTriangle size={16} className="mt-0.5 shrink-0 text-red-600" />
                      ) : (
                        <ShieldCheck size={16} className="mt-0.5 shrink-0 text-green-600" />
                      )}
                      <p className="text-sm text-gray-700">{scored.imageDetection.summary}</p>
                    </div>
                  </div>
                </div>
              )}
              {!scored.imageDetection && !aiLoading && (
                <p className="mt-3 text-sm text-gray-500 italic">
                  No photo was submitted with this complaint. Assessment is based on text description only.
                </p>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Printable Poster */}
      <HazardPoster complaint={scored} />
    </div>
  );
}
