"use client";

import { Button } from "@/components/ui/button";

export default function ErrorPage({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto mt-20 max-w-md rounded-lg border bg-card p-6 text-center">
      <h2 className="font-semibold">Algo salió mal</h2>
      <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
      <Button className="mt-4" onClick={reset}>
        Reintentar
      </Button>
    </div>
  );
}
