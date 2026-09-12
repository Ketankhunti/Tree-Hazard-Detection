import { useState, type ChangeEvent, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import {
  TreePine,
  MapPin,
  Camera,
  Send,
  AlertCircle,
  CheckCircle2,
  Loader2,
  X,
} from "lucide-react";
import { submitComplaint, geocodeAddress } from "../lib/api";

const HALIFAX_NEIGHBORHOODS = [
  "Downtown",
  "Halifax Peninsula",
  "North End",
  "South End",
  "West End",
  "Quinpool",
  "Clayton Park",
  "Wentworth",
  "Spryfield",
  "Fairview",
  "Bedford",
  "Dartmouth",
];

interface FormData {
  address: string;
  neighborhood: string;
  complaintText: string;
  latitude: string;
  longitude: string;
}

export function SubmitComplaint() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState<FormData>({
    address: "",
    neighborhood: "Downtown",
    complaintText: "",
    latitude: "",
    longitude: "",
  });
  const [photos, setPhotos] = useState<File[]>([]);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [geocodeSuccess, setGeocodeSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submittedId, setSubmittedId] = useState<string | null>(null);

  async function handleGeocodeAddress() {
    if (!formData.address.trim()) {
      setError("Please enter a street address first.");
      return;
    }
    setGeocoding(true);
    setError(null);
    setGeocodeSuccess(null);
    try {
      const geo = await geocodeAddress(formData.address);
      if (geo) {
        setFormData((prev) => ({
          ...prev,
          latitude: geo.latitude.toFixed(6),
          longitude: geo.longitude.toFixed(6),
          address: geo.formattedAddress.replace(/, Canada$/, ""),
        }));
        setGeocodeSuccess(`Location mapped: ${geo.latitude.toFixed(4)}, ${geo.longitude.toFixed(4)}`);
      } else {
        setError("Could not geocode this address. You can enter coordinates manually or use device location.");
      }
    } catch {
      setError("Address lookup failed. Please enter coordinates manually.");
    } finally {
      setGeocoding(false);
    }
  }

  function handleTextChange(e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  function handlePhotoChange(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setPhotos((prev) => [...prev, ...files]);
    for (const file of files) {
      const reader = new FileReader();
      reader.onload = () => setPhotoPreviews((prev) => [...prev, reader.result as string]);
      reader.readAsDataURL(file);
    }
  }

  function removePhoto(index: number) {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
    setPhotoPreviews((prev) => prev.filter((_, i) => i !== index));
  }

  async function useMyLocation() {
    if (!navigator.geolocation) {
      setError("Geolocation is not supported by your browser.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setFormData((prev) => ({
          ...prev,
          latitude: pos.coords.latitude.toFixed(6),
          longitude: pos.coords.longitude.toFixed(6),
        }));
        setError(null);
      },
      () => {
        setError("Could not get your location. Please enter coordinates manually.");
      }
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!formData.address.trim()) {
      setError("Please provide the street address.");
      return;
    }
    if (!formData.complaintText.trim() || formData.complaintText.trim().length < 10) {
      setError("Please describe the hazard (at least 10 characters).");
      return;
    }

    setSubmitting(true);
    try {
      const result = await submitComplaint({
        address: formData.address,
        neighborhood: formData.neighborhood,
        complaintText: formData.complaintText,
        latitude: formData.latitude ? parseFloat(formData.latitude) : 44.6488,
        longitude: formData.longitude ? parseFloat(formData.longitude) : -63.5752,
        photos,
      });
      setSubmittedId(result.id);
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit complaint.");
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="max-w-md w-full rounded-lg border border-gray-200 bg-white p-8 text-center">
          <CheckCircle2 size={48} className="mx-auto text-green-600" />
          <h1 className="mt-4 text-xl font-bold text-gray-900">Complaint Submitted!</h1>
          <p className="mt-2 text-sm text-gray-600">
            Your tree hazard report has been received and added to the triage queue.
            A forestry officer will assess it based on priority scoring.
          </p>
          <p className="mt-3 text-sm font-mono text-gray-500">
            Tracking ID: {submittedId}
          </p>
          <div className="mt-6 flex flex-col gap-2">
            <button
              className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
              onClick={() => navigate("/")}
            >
              View Triage Queue
            </button>
            <button
              className="rounded border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              onClick={() => {
                setSuccess(false);
                setSubmittedId(null);
                setFormData({
                  address: "",
                  neighborhood: "Downtown",
                  complaintText: "",
                  latitude: "",
                  longitude: "",
                });
                setPhotos([]);
                setPhotoPreviews([]);
              }}
            >
              Submit Another Report
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-3xl px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <TreePine size={24} className="text-green-700" />
              <div>
                <h1 className="text-lg font-bold text-gray-900">Report a Tree Hazard</h1>
                <p className="text-sm text-gray-500">Halifax Urban Forestry — Citizen Portal</p>
              </div>
            </div>
            <button
              className="text-sm text-gray-600 hover:text-gray-900"
              onClick={() => navigate("/")}
            >
              Officer View →
            </button>
          </div>
        </div>
      </header>

      {/* Form */}
      <main className="mx-auto max-w-3xl px-6 py-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Location Section */}
          <div className="rounded-lg border border-gray-200 bg-white p-5">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-gray-700">
              <MapPin size={16} /> Location
            </h2>
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between">
                  <label className="block text-sm font-medium text-gray-700">
                    Street Address <span className="text-red-500">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={handleGeocodeAddress}
                    disabled={geocoding || !formData.address.trim()}
                    className="inline-flex items-center gap-1 text-xs font-medium text-green-700 hover:text-green-800 disabled:opacity-40"
                  >
                    {geocoding ? <Loader2 size={12} className="animate-spin" /> : <MapPin size={12} />}
                    {geocoding ? "Locating on Map…" : "Locate with Google Maps"}
                  </button>
                </div>
                <input
                  type="text"
                  name="address"
                  value={formData.address}
                  onChange={handleTextChange}
                  onBlur={() => {
                    if (formData.address.trim() && !formData.latitude) {
                      handleGeocodeAddress();
                    }
                  }}
                  placeholder="e.g. 1234 Quinpool Rd, Halifax"
                  className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                />
                {geocodeSuccess && (
                  <p className="mt-1 text-xs text-green-700 font-medium">✓ {geocodeSuccess}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Neighborhood</label>
                <select
                  name="neighborhood"
                  value={formData.neighborhood}
                  onChange={handleTextChange}
                  className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                >
                  {HALIFAX_NEIGHBORHOODS.map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <label className="block text-sm font-medium text-gray-700">
                    GPS Coordinates
                  </label>
                  <button
                    type="button"
                    onClick={useMyLocation}
                    className="text-xs text-green-700 hover:text-green-800 font-medium"
                  >
                    📍 Use my location
                  </button>
                </div>
                <div className="mt-1 grid grid-cols-2 gap-3">
                  <input
                    type="text"
                    name="latitude"
                    value={formData.latitude}
                    onChange={handleTextChange}
                    placeholder="Latitude (44.6488)"
                    className="block w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                  />
                  <input
                    type="text"
                    name="longitude"
                    value={formData.longitude}
                    onChange={handleTextChange}
                    placeholder="Longitude (-63.5752)"
                    className="block w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                  />
                </div>
                <p className="mt-1 text-xs text-gray-400">
                  Optional — helps officers find the exact tree. Enter an address and click "Locate with Google Maps".
                </p>

                {formData.latitude && formData.longitude && import.meta.env.VITE_GOOGLE_MAPS_API_KEY && (
                  <div className="mt-3 overflow-hidden rounded border border-gray-200">
                    <img
                      src={`https://maps.googleapis.com/maps/api/staticmap?center=${formData.latitude},${formData.longitude}&zoom=16&size=600x180&scale=2&maptype=roadmap&markers=color:green%7C${formData.latitude},${formData.longitude}&key=${import.meta.env.VITE_GOOGLE_MAPS_API_KEY}`}
                      alt="Pinned tree hazard location"
                      className="h-36 w-full object-cover"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Description Section */}
          <div className="rounded-lg border border-gray-200 bg-white p-5">
            <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-gray-700">
              Hazard Description
            </h2>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                What did you observe? <span className="text-red-500">*</span>
              </label>
              <textarea
                name="complaintText"
                value={formData.complaintText}
                onChange={handleTextChange}
                rows={5}
                placeholder="Describe the tree hazard in detail. For example: 'Large dead branch hanging over the sidewalk on the oak tree near the bus stop. Bark peeling off the south side. Concerned it could fall on pedestrians.'"
                className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
              />
              <p className="mt-1 text-xs text-gray-400">
                Be specific — mention what you see (dead branches, leaning, wires, cracks, etc.). The AI triage system uses your description to assess danger.
              </p>
            </div>
          </div>

          {/* Photo Section */}
          <div className="rounded-lg border border-gray-200 bg-white p-5">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-gray-700">
              <Camera size={16} /> Field Photos ({photos.length})
            </h2>
            {photoPreviews.length > 0 && (
              <div className="mb-3 grid grid-cols-3 gap-3">
                {photoPreviews.map((preview, i) => (
                  <div key={i} className="relative">
                    <img src={preview} alt={`Preview ${i + 1}`} className="h-28 w-full rounded border border-gray-200 object-cover" />
                    <button
                      type="button"
                      onClick={() => removePhoto(i)}
                      className="absolute top-1 right-1 rounded-full bg-black/60 p-1 text-white hover:bg-black/80"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <label className="flex h-32 cursor-pointer flex-col items-center justify-center rounded border-2 border-dashed border-gray-300 bg-gray-50 hover:border-green-400 hover:bg-green-50">
              <Camera size={28} className="text-gray-300" />
              <p className="mt-2 text-sm text-gray-500">
                {photos.length > 0 ? "Add more photos" : "Click to upload photos"}
              </p>
              <p className="text-xs text-gray-400">JPG, PNG up to 10MB each</p>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={handlePhotoChange}
                className="hidden"
              />
            </label>
            <p className="mt-2 text-xs text-gray-400">
              Upload multiple photos from different angles. The AI cross-references images with your text description to verify the hazard.
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4">
              <AlertCircle size={20} className="mt-0.5 shrink-0 text-red-600" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* Submit */}
          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => navigate("/")}
              className="rounded border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 rounded bg-green-700 px-6 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Submitting…
                </>
              ) : (
                <>
                  <Send size={16} />
                  Submit Report
                </>
              )}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
