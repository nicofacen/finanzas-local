"use client";

import { Suspense } from "react";
import { useQuery } from "../data";
import type { AppContainer } from "@/shared/infrastructure/di/container";

export function Loading() {
  return <p className="py-10 text-center text-sm text-muted-foreground">Cargando…</p>;
}

/**
 * Carga datos y renderiza `children(data)`. Incluye el <Suspense> que exige
 * useSearchParams en la exportación estática.
 */
export function Query<T>({
  load,
  deps = [],
  children,
}: {
  load: (c: AppContainer) => Promise<T>;
  deps?: readonly unknown[];
  children: (data: T) => React.ReactNode;
}) {
  const { data, error } = useQuery(load, deps);
  if (error) {
    return (
      <div className="mx-auto mt-10 max-w-md rounded-lg border bg-card p-6 text-center">
        <h2 className="font-semibold">No se pudieron cargar los datos</h2>
        <p className="mt-2 text-sm text-muted-foreground">{error}</p>
      </div>
    );
  }
  if (data === undefined) return <Loading />;
  return <>{children(data)}</>;
}

/** Envuelve una página que usa useSearchParams. */
export function PageSuspense({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<Loading />}>{children}</Suspense>;
}
