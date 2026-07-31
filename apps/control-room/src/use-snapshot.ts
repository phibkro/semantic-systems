import { useCallback, useEffect, useRef, useState } from "react";
import type { SnapshotState } from "./model.ts";
import {
  SnapshotCandidateError,
  fetchCandidate,
  freshnessState,
  isRollback,
  readCachedSnapshot,
  writeCachedSnapshot,
} from "./snapshot.ts";

const POLL_MS = 60_000;

const initialState = (): SnapshotState => {
  const cached = readCachedSnapshot();
  return cached === null
    ? { state: "loading", snapshot: null, pending: null }
    : {
        state: freshnessState(cached, Date.now(), navigator.onLine),
        snapshot: cached,
        pending: null,
      };
};

export const useSnapshot = (): SnapshotState & {
  readonly refresh: () => Promise<void>;
  readonly applyUpdate: () => void;
} => {
  const [result, setResult] = useState<SnapshotState>(initialState);
  const request = useRef<AbortController | null>(null);
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    try {
      const candidate = await fetchCandidate(
        new URL(import.meta.env.BASE_URL, document.baseURI),
        controller.signal,
      );
      if (!mounted.current || request.current !== controller) return;
      setResult((current) => {
        if (
          current.snapshot !== null &&
          (candidate.snapshot.metadata.digest === current.snapshot.metadata.digest ||
            isRollback(current.snapshot, candidate.version))
        ) {
          return {
            state: freshnessState(current.snapshot, Date.now(), navigator.onLine),
            snapshot: current.snapshot,
            pending: null,
          };
        }
        if (current.snapshot !== null) {
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
      if (controller.signal.aborted || !mounted.current || request.current !== controller) return;
      setResult((current) => {
        const detail = error instanceof Error ? error.message : "snapshot refresh failed";
        if (current.snapshot !== null) {
          return {
            ...current,
            state:
              error instanceof SnapshotCandidateError && error.kind === "invalid"
                ? "invalid"
                : navigator.onLine
                  ? "stale"
                  : "offline",
            detail,
          };
        }
        return {
          state:
            error instanceof SnapshotCandidateError && error.kind === "invalid"
              ? "invalid"
              : "unavailable",
          snapshot: null,
          pending: null,
          detail,
        };
      });
    } finally {
      if (request.current === controller) request.current = null;
    }
  }, []);

  const applyUpdate = useCallback(() => {
    setResult((current) => {
      if (current.pending === null) return current;
      writeCachedSnapshot(current.pending);
      return {
        state: freshnessState(current.pending, Date.now(), navigator.onLine),
        snapshot: current.pending,
        pending: null,
      };
    });
  }, []);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    const timer = window.setInterval(() => void refresh(), POLL_MS);
    const updateConnectivity = () =>
      setResult((current) =>
        current.snapshot === null
          ? current
          : {
              ...current,
              state: freshnessState(current.snapshot, Date.now(), navigator.onLine),
            },
      );
    window.addEventListener("online", updateConnectivity);
    window.addEventListener("offline", updateConnectivity);
    return () => {
      mounted.current = false;
      request.current?.abort();
      window.clearInterval(timer);
      window.removeEventListener("online", updateConnectivity);
      window.removeEventListener("offline", updateConnectivity);
    };
  }, [refresh]);

  return { ...result, refresh, applyUpdate };
};
