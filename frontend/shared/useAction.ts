"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import type { ActionResult } from "./action";

/** Ejecuta un Server Action mostrando toasts de éxito/error. */
export function useAction<I, T>(
  action: (input: I) => Promise<ActionResult<T>>,
  options: { success?: string | ((data: T) => string); silent?: boolean } = {},
) {
  const [pending, startTransition] = useTransition();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const run = (input: I) =>
    new Promise<ActionResult<T>>((resolve) => {
      startTransition(async () => {
        const result = await action(input);
        if (result.ok) {
          setFieldErrors({});
          const msg = typeof options.success === "function" ? options.success(result.data) : options.success;
          if (msg && !options.silent) toast.success(msg);
        } else {
          setFieldErrors(result.fieldErrors ?? {});
          if (!options.silent) toast.error(result.error);
        }
        resolve(result);
      });
    });

  return { run, pending, fieldErrors };
}

/** Lee un <form> como objeto plano (todos los valores como string). */
export function formToObject(form: HTMLFormElement): Record<string, string> {
  const data: Record<string, string> = {};
  new FormData(form).forEach((value, key) => {
    if (typeof value === "string") data[key] = value;
  });
  return data;
}
