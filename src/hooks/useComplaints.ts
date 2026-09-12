/**
 * useComplaints — React hook for fetching complaints from the backend.
 *
 * Handles loading, error, and fallback-to-mock states.
 */

import { useEffect, useState } from "react";
import {
  fetchComplaints,
  type BackendComplaint,
} from "../lib/api";

interface UseComplaintsState {
  complaints: BackendComplaint[];
  loading: boolean;
  error: string | null;
  source: "backend" | "mock" | null;
}

export function useComplaints(): UseComplaintsState {
  const [state, setState] = useState<UseComplaintsState>({
    complaints: [],
    loading: true,
    error: null,
    source: null,
  });

  useEffect(() => {
    let cancelled = false;

    fetchComplaints()
      .then(({ complaints, source }) => {
        if (!cancelled) {
          setState({ complaints, loading: false, error: null, source });
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setState({
            complaints: [],
            loading: false,
            error: err.message,
            source: null,
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
