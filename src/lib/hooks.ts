import { useEffect, useState } from "react";
import { collection, doc, onSnapshot, query, type QueryConstraint } from "firebase/firestore";
import { db } from "../firebase";

export interface Live<T> { data: T; loading: boolean; error: string | null }

// Subscribes to one document. `path` null means "nothing to read yet".
export function useDoc<T>(path: string | null): Live<(T & { id: string }) | null> {
  const [state, setState] = useState<Live<(T & { id: string }) | null>>({ data: null, loading: !!path, error: null });
  useEffect(() => {
    if (!path) { setState({ data: null, loading: false, error: null }); return; }
    setState(s => ({ ...s, loading: true }));
    return onSnapshot(doc(db, path),
      s => setState({ data: s.exists() ? ({ id: s.id, ...s.data() } as T & { id: string }) : null, loading: false, error: null }),
      e => setState({ data: null, loading: false, error: e.code || "error" }));
  }, [path]);
  return state;
}

// Subscribes to a collection. `key` must change whenever the constraints change.
export function useCollection<T>(path: string | null, constraints: QueryConstraint[] = [], key = ""): Live<(T & { id: string })[]> {
  const [state, setState] = useState<Live<(T & { id: string })[]>>({ data: [], loading: !!path, error: null });
  useEffect(() => {
    if (!path) { setState({ data: [], loading: false, error: null }); return; }
    setState(s => ({ ...s, loading: true }));
    return onSnapshot(query(collection(db, path), ...constraints),
      s => setState({ data: s.docs.map(d => ({ id: d.id, ...d.data() }) as T & { id: string }), loading: false, error: null }),
      e => setState({ data: [], loading: false, error: e.code || "error" }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, key]);
  return state;
}
