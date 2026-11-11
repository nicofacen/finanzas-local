"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { getContainer } from "@/shared/infrastructure/di/browser";
import type { AppContainer } from "@/shared/infrastructure/di/container";
import type { DomainError, Result } from "@/shared/domain";

// ─────────────── Invalidación global (reemplaza a revalidatePath) ───────────────
let version = 0;
const listeners = new Set<() => void>();

/** Avisa a todas las consultas activas que los datos cambiaron. */
export function invalidateAll() {
  version++;
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export interface QueryState<T> {
  data: T | undefined;
  error: string | null;
  loading: boolean;
}

/**
 * Carga datos con un caso de uso del contenedor y se vuelve a ejecutar cuando
 * cambian `deps` o cuando alguna acción modifica los datos. Conserva el dato
 * anterior mientras recarga (sin parpadeos).
 */
export function useQuery<T>(load: (c: AppContainer) => Promise<T>, deps: readonly unknown[] = []): QueryState<T> {
  const dataVersion = useSyncExternalStore(subscribe, () => version, () => 0);
  const [state, setState] = useState<QueryState<T>>({ data: undefined, error: null, loading: true });
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    let cancelled = false;
    getContainer()
      .then((c) => loadRef.current(c))
      .then(
        (data) => !cancelled && setState({ data, error: null, loading: false }),
        (e: unknown) => !cancelled && setState((s) => ({ data: s.data, error: e instanceof Error ? e.message : String(e), loading: false })),
      );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataVersion, ...deps]);

  return state;
}

/** Para lecturas: un Err del caso de uso se convierte en excepción (la captura useQuery). */
export function unwrapQuery<T>(result: Result<T, DomainError>): T {
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}
