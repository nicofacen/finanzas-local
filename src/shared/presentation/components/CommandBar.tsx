"use client";

import { ArrowRight, CornerDownLeft, Search, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/primitives";
import { Dialog } from "@/components/ui/dialog";
import { cn } from "@/components/ui/cn";
import type { QuickEntryInterpretation } from "@/modules/transactions/application/QuickEntryUseCases";
import { previewQuickEntryAction, quickEntryAction } from "@/modules/transactions/presentation/actions";
import { NAV_ITEMS } from "./Sidebar";

const EXAMPLES = ["15000 Supermercado Débito", "+850000 Sueldo banco", "usd 20 Netflix visa", "120000 Zapatillas visa 6c ayer"];

/**
 * Barra de comando global (Ctrl+K / Cmd+K):
 *  - si el texto tiene un monto → carga rápida con vista previa en vivo,
 *  - si no → navegación entre secciones.
 */
export function CommandBar() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<QuickEntryInterpretation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const requestId = useRef(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("open-command-bar", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("open-command-bar", onOpen);
    };
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 10);
    else {
      setText("");
      setPreview(null);
      setError(null);
    }
  }, [open]);

  const hasAmount = /\d/.test(text);
  const navMatches = NAV_ITEMS.filter((i) => i.label.toLowerCase().includes(text.trim().toLowerCase()));

  // Vista previa con debounce: el parseo lo hace el dominio en el servidor.
  useEffect(() => {
    if (!hasAmount) {
      setPreview(null);
      setError(null);
      return;
    }
    const id = ++requestId.current;
    const t = setTimeout(async () => {
      const r = await previewQuickEntryAction({ text });
      if (id !== requestId.current) return;
      if (r.ok) {
        setPreview(r.data);
        setError(null);
      } else {
        setPreview(null);
        setError(r.error);
      }
    }, 220);
    return () => clearTimeout(t);
  }, [text, hasAmount]);

  const submit = async () => {
    if (!hasAmount) {
      const item = navMatches[selected] ?? navMatches[0];
      if (item) {
        router.push(item.href);
        setOpen(false);
      }
      return;
    }
    setSaving(true);
    const r = await quickEntryAction({ text });
    setSaving(false);
    if (r.ok) {
      const what = r.data.kind === "income" ? "Ingreso" : r.data.kind === "installments" ? `Compra en ${r.data.installments} cuotas` : "Gasto";
      toast.success(`${what} registrado: ${r.data.amountFormatted} · ${r.data.description}`, {
        description: `${r.data.accountName}${r.data.categoryName ? ` · ${r.data.categoryName}` : ""}`,
      });
      setText("");
      setPreview(null);
    } else {
      setError(r.error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen} className="mt-[12vh] mb-auto">
      <div className="flex items-center gap-3 border-b px-4">
        {hasAmount ? <Sparkles className="size-4 text-primary" /> : <Search className="size-4 text-muted-foreground" />}
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setSelected(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void submit();
            } else if (e.key === "ArrowDown") setSelected((s) => Math.min(s + 1, navMatches.length - 1));
            else if (e.key === "ArrowUp") setSelected((s) => Math.max(s - 1, 0));
          }}
          placeholder='Ej: "15000 Supermercado Débito" o buscá una sección…'
          className="h-14 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
          aria-label="Carga rápida o navegación"
        />
        <kbd className="hidden rounded border px-1.5 py-0.5 text-[10px] text-muted-foreground sm:block">ESC</kbd>
      </div>

      <div className="max-h-[50vh] overflow-y-auto p-2">
        {hasAmount ? (
          <div className="p-2">
            {preview && (
              <div className="rounded-lg border bg-muted/40 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <Badge tone={preview.kind === "income" ? "positive" : preview.kind === "installments" ? "warning" : "negative"}>
                    {preview.kind === "income" ? "Ingreso" : preview.kind === "installments" ? `${preview.installments} cuotas` : "Gasto"}
                  </Badge>
                  <span className="text-lg font-semibold tabular">{preview.amountFormatted}</span>
                </div>
                <dl className="grid grid-cols-[110px_1fr] gap-y-1.5 text-sm">
                  <dt className="text-muted-foreground">Descripción</dt>
                  <dd>{preview.description}</dd>
                  <dt className="text-muted-foreground">Cuenta</dt>
                  <dd>{preview.accountName}</dd>
                  <dt className="text-muted-foreground">Categoría</dt>
                  <dd>
                    {preview.categoryName ?? <span className="text-muted-foreground">Sin categoría</span>}
                    {preview.categorySource === "rule" && <Badge tone="primary" className="ml-2">por regla</Badge>}
                  </dd>
                  <dt className="text-muted-foreground">Fecha</dt>
                  <dd>{preview.date}</dd>
                </dl>
                {preview.note && <p className="mt-3 text-xs text-muted-foreground">{preview.note}</p>}
              </div>
            )}
            {error && <p className="rounded-md bg-negative/10 p-3 text-sm text-negative">{error}</p>}
            <p className="mt-3 flex items-center gap-1 text-xs text-muted-foreground">
              <CornerDownLeft className="size-3" /> Enter para guardar {saving && "· guardando…"}
            </p>
          </div>
        ) : (
          <>
            <p className="px-2 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Ir a</p>
            {navMatches.map((item, i) => (
              <button
                key={item.href}
                onMouseEnter={() => setSelected(i)}
                onClick={() => {
                  router.push(item.href);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm",
                  i === selected ? "bg-accent text-accent-foreground" : "hover:bg-muted",
                )}
              >
                <item.icon className="size-4" />
                {item.label}
                <ArrowRight className="ml-auto size-3.5 opacity-50" />
              </button>
            ))}
            <p className="px-2 pb-1 pt-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Carga rápida</p>
            <div className="flex flex-wrap gap-1.5 px-2 pb-2">
              {EXAMPLES.map((ex) => (
                <button key={ex} onClick={() => setText(ex)} className="rounded-full border px-2.5 py-1 text-xs hover:bg-muted">
                  {ex}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}

export function CommandBarTrigger() {
  return (
    <button
      onClick={() => window.dispatchEvent(new Event("open-command-bar"))}
      className="flex h-9 w-full max-w-sm items-center gap-2 rounded-md border bg-card px-3 text-sm text-muted-foreground shadow-xs hover:bg-muted"
    >
      <Sparkles className="size-4 text-primary" />
      <span className="flex-1 text-left">Carga rápida…</span>
      <kbd className="rounded border px-1.5 text-[10px]">Ctrl K</kbd>
    </button>
  );
}
