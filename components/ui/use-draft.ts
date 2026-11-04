"use client";
// Editable copy of server data with a saved baseline.
// Background refreshes update the form only while it has no unsaved edits;
// with edits, the incoming change is flagged instead of silently overwriting them.
import { useCallback, useState } from "react";

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function useDraft<T>(server: T) {
  const [baseline, setBaseline] = useState(server);
  const [draft, setDraft] = useState(server);
  const [seen, setSeen] = useState(server);
  const [remoteChanged, setRemoteChanged] = useState(false);
  const dirty = !same(draft, baseline);

  // "Adjust state when a prop changes" — done during render, as React recommends.
  if (!same(server, seen)) {
    setSeen(server);
    if (dirty) setRemoteChanged(true);
    else {
      setBaseline(server);
      setDraft(server);
    }
  }

  const set = useCallback(<K extends keyof T>(key: K, value: T[K]) => setDraft((d) => ({ ...d, [key]: value })), []);
  /** Throw away edits and show the latest server values. */
  const discard = useCallback(() => {
    setDraft(seen);
    setBaseline(seen);
    setRemoteChanged(false);
  }, [seen]);
  /** Call after the server confirmed a save of `value`. */
  const markSaved = useCallback((value: T) => {
    setBaseline(value);
    setDraft(value);
    setRemoteChanged(false);
  }, []);

  return { draft, setDraft, set, dirty, discard, markSaved, remoteChanged };
}
