import { useCallback, useEffect, useState } from "react";

import type { PublicSnapshot, SnapshotState } from "./model";
import {
  fetchCandidate,
  freshnessState,
  isRollback,
  readCachedSnapshot,
  writeCachedSnapshot,
} from "./snapshot";

const POLL_MS = 60_000;

function initialState(): SnapshotState {
  const cached = readCachedSnapshot();
  return cached
    ? {
        state: freshnessState(cached, Date.now(), navigator.onLine),
        snapshot: cached,
        pending: null,
      }
    : { state: "loading", snapshot: null, pending: null };
}

export function useSnapshot(): SnapshotState & {
  refresh: () => Promise<void>;
  applyUpdate: () => void;
} {
  const [result, setResult] = useState<SnapshotState>(initialState);

  const refresh = useCallback(async () => {
    try {
      const candidate = await fetchCandidate(new URL(import.meta.env.BASE_URL, document.baseURI));
      setResult((current) => {
        if (
          current.snapshot &&
          (candidate.snapshot.metadata.digest === current.snapshot.metadata.digest ||
            isRollback(current.snapshot, candidate.version))
        ) {
          return {
            state: freshnessState(current.snapshot, Date.now(), navigator.onLine),
            snapshot: current.snapshot,
            pending: null,
          };
        }
        if (current.snapshot) {
          return {
            state: "update_available",
            snapshot: current.snapshot,
            pending: candidate.snapshot,
          };
        }
        writeCachedSnapshot(candidate.snapshot);
        return {
          state: freshnessState(candidate.snapshot, Date.now(), navigator.onLine),
          snapshot: candidate.snapshot,
          pending: null,
        };
      });
    } catch (error) {
      setResult((current) => {
        if (current.snapshot) {
          return {
            ...current,
            state: navigator.onLine ? "stale" : "offline",
            detail: error instanceof Error ? error.message : "refresh failed",
          };
        }
        return {
          state: "invalid",
          snapshot: null,
          pending: null,
          detail: error instanceof Error ? error.message : "snapshot unavailable",
        };
      });
    }
  }, []);

  const applyUpdate = useCallback(() => {
    setResult((current) => {
      if (!current.pending) return current;
      writeCachedSnapshot(current.pending);
      return {
        state: freshnessState(current.pending, Date.now(), navigator.onLine),
        snapshot: current.pending,
        pending: null,
      };
    });
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), POLL_MS);
    const updateConnectivity = () =>
      setResult((current) =>
        current.snapshot
          ? {
              ...current,
              state: freshnessState(current.snapshot, Date.now(), navigator.onLine),
            }
          : current,
      );
    window.addEventListener("online", updateConnectivity);
    window.addEventListener("offline", updateConnectivity);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("online", updateConnectivity);
      window.removeEventListener("offline", updateConnectivity);
    };
  }, [refresh]);

  return { ...result, refresh, applyUpdate };
}

export function snapshotForTest(
  snapshot: PublicSnapshot,
  state: SnapshotState["state"],
): SnapshotState {
  return { snapshot, state, pending: null };
}
