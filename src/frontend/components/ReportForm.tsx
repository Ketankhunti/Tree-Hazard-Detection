"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Loader2, Upload, X } from "lucide-react";

type FieldErrors = Partial<Record<string, string[]>>;

const MAX_MB = 12;

export function ReportForm() {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [preview, setPreview] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      clearPhoto();
      return;
    }
    setFileName(file.name);
    // Object URL rather than a data URL: no base64 blowup for a 12 MB photo.
    setPreview((current) => {
      if (current) URL.revokeObjectURL(current);
      return URL.createObjectURL(file);
    });
  }

  function clearPhoto() {
    setPreview((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
    setFileName(null);
    if (fileInput.current) fileInput.current.value = "";
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setFieldErrors({});

    try {
      const response = await fetch("/api/requests", {
        method: "POST",
        body: new FormData(event.currentTarget),
      });
      const body = await response.json();

      if (!response.ok) {
        setError(body.error ?? "Something went wrong. Please try again.");
        setFieldErrors(body.fieldErrors ?? {});
        return;
      }

      router.push(`/report/${body.reference}`);
    } catch {
      setError("Could not reach the server. Please check your connection.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6" noValidate>
      {error && (
        <div
          role="alert"
          className="border-l-4 border-red-600 bg-red-50 px-4 py-3 text-sm text-red-900"
        >
          {error}
        </div>
      )}

      <Field
        label="Your name"
        name="reporterName"
        autoComplete="name"
        placeholder="Jordan MacNeil"
        errors={fieldErrors.reporterName}
        required
      />

      <Field
        label="Email address"
        name="reporterEmail"
        type="email"
        autoComplete="email"
        placeholder="you@example.com"
        hint="We will email you when the work is finished."
        errors={fieldErrors.reporterEmail}
        required
      />

      <Field
        label="Location of the tree"
        name="address"
        autoComplete="street-address"
        placeholder="6021 Agricola Street"
        hint="A street address, or the nearest intersection."
        errors={fieldErrors.address}
        required
      />

      <div>
        <label
          htmlFor="description"
          className="block text-sm font-semibold text-slate-900"
        >
          What do you see? <span className="text-red-600">*</span>
        </label>
        <p className="mt-0.5 text-xs text-slate-500">
          Describe the tree and what is underneath it. Mention anything it could
          fall on: a house, a car, a sidewalk, power lines.
        </p>
        <textarea
          id="description"
          name="description"
          rows={5}
          required
          placeholder="The large maple is leaning toward my roof after last night's storm and the trunk looks split near the base."
          className="mt-2 w-full border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400"
        />
        <FieldError errors={fieldErrors.description} />
      </div>

      <div>
        <span className="block text-sm font-semibold text-slate-900">
          Photo of the tree
        </span>
        <p className="mt-0.5 text-xs text-slate-500">
          Optional, but it helps us judge urgency far more accurately. Up to{" "}
          {MAX_MB} MB.
        </p>

        <input
          ref={fileInput}
          id="photo"
          name="photo"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic"
          onChange={handleFileChange}
          className="sr-only"
        />

        {preview ? (
          <div className="mt-2 border border-slate-300 p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={preview}
              alt="Preview of the photo you selected"
              className="max-h-72 w-full object-contain"
            />
            <div className="mt-2 flex items-center justify-between gap-3">
              <span className="truncate font-mono text-xs text-slate-500">
                {fileName}
              </span>
              <button
                type="button"
                onClick={clearPhoto}
                className="inline-flex items-center gap-1 border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
                Remove
              </button>
            </div>
          </div>
        ) : (
          <label
            htmlFor="photo"
            className="mt-2 flex cursor-pointer flex-col items-center justify-center gap-2 border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center transition-colors hover:border-slate-400 hover:bg-slate-100"
          >
            <Camera className="h-6 w-6 text-slate-400" aria-hidden />
            <span className="text-sm font-semibold text-slate-700">
              Add a photo
            </span>
            <span className="text-xs text-slate-500">
              Taking it on your phone also tells us exactly where the tree is.
            </span>
          </label>
        )}
        <FieldError errors={fieldErrors.photo} />
      </div>

      <div className="border-t border-slate-200 pt-5">
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex w-full items-center justify-center gap-2 border border-slate-900 bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Assessing your report...
            </>
          ) : (
            <>
              <Upload className="h-4 w-4" aria-hidden />
              Submit report
            </>
          )}
        </button>
        <p className="mt-3 text-xs leading-relaxed text-slate-500">
          Your report is assessed automatically to decide how soon an arborist
          should visit. This is a prioritization tool, not a safety
          determination.{" "}
          <strong className="font-semibold text-slate-700">
            If a tree is on a power line or blocking a road right now, call 311
            or 911 instead of using this form.
          </strong>
        </p>
      </div>
    </form>
  );
}

function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.length) return null;
  return (
    <p role="alert" className="mt-1 text-xs font-medium text-red-700">
      {errors[0]}
    </p>
  );
}

function Field({
  label,
  name,
  hint,
  errors,
  required,
  ...props
}: {
  label: string;
  name: string;
  hint?: string;
  errors?: string[];
  required?: boolean;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label htmlFor={name} className="block text-sm font-semibold text-slate-900">
        {label} {required && <span className="text-red-600">*</span>}
      </label>
      {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
      <input
        id={name}
        name={name}
        required={required}
        className="mt-2 w-full border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400"
        {...props}
      />
      <FieldError errors={errors} />
    </div>
  );
}
