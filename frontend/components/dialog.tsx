"use client";

import { X } from "lucide-react";
import { useEffect, useRef } from "react";
import { cn } from "./cn";

/** Diálogo modal accesible basado en <dialog> nativo (foco y Escape incluidos). */
export function Dialog({
  open,
  onOpenChange,
  title,
  children,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={() => onOpenChange(false)}
      onClick={(e) => e.target === ref.current && onOpenChange(false)}
      className={cn(
        "m-auto w-[min(640px,calc(100vw-2rem))] rounded-xl border bg-card p-0 text-card-foreground shadow-2xl backdrop:bg-black/40 backdrop:backdrop-blur-[2px]",
        className,
      )}
    >
      {open && (
        <div className="relative">
          {title && (
            <div className="flex items-center justify-between border-b px-5 py-3">
              <h2 className="text-sm font-semibold">{title}</h2>
              <button aria-label="Cerrar" onClick={() => onOpenChange(false)} className="rounded p-1 hover:bg-muted">
                <X className="size-4" />
              </button>
            </div>
          )}
          {children}
        </div>
      )}
    </dialog>
  );
}
