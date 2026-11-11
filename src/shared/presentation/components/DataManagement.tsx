"use client";

import { Database, Download, HardDriveDownload, RotateCcw, Sparkles, Upload } from "lucide-react";
import { useRef } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Input } from "@/components/ui/primitives";
import { resetDataAction, restoreBackupAction, seedDemoAction, snapshotDatabaseAction } from "../systemActions";
import { useAction } from "../useAction";

export function DataManagement({ databasePath }: { databasePath: string }) {
  const seed = useAction(seedDemoAction, { success: (d) => `Demo cargada: ${d.transactions} movimientos` });
  const reset = useAction(resetDataAction, { success: "Datos eliminados" });
  const restore = useAction(restoreBackupAction, { success: (d) => `Backup restaurado (${d.rows} filas)` });
  const snapshot = useAction(snapshotDatabaseAction, { success: (d) => `Copia guardada en ${d.path}` });
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Sparkles className="size-4" /> Datos de demostración</CardTitle>
          <CardDescription>Reemplaza TODO por 4 meses de datos de ejemplo generados a través de los casos de uso.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            disabled={seed.pending}
            onClick={() => confirm("Se borrarán tus datos actuales y se cargará la demo. ¿Continuar?") && void seed.run(undefined)}
          >
            {seed.pending ? "Cargando…" : "Limpiar y cargar demo"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><RotateCcw className="size-4" /> Limpiar base de datos</CardTitle>
          <CardDescription>Elimina cuentas, movimientos, sobres, reglas y suscripciones. No se puede deshacer.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const confirmText = (form.elements.namedItem("confirm") as HTMLInputElement).value;
              const r = await reset.run({ confirm: confirmText });
              if (r.ok) form.reset();
            }}
          >
            <Input name="confirm" placeholder='Escribí "BORRAR"' />
            <Button variant="destructive" disabled={reset.pending}>Borrar todo</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Download className="size-4" /> Backup JSON</CardTitle>
          <CardDescription>Archivo portable con todas las tablas. Restaurar reemplaza los datos actuales.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <a href="/api/backup" className={buttonVariants({ variant: "outline" })}>
            <Download /> Descargar backup
          </a>
          <Button variant="outline" disabled={restore.pending} onClick={() => fileRef.current?.click()}>
            <Upload /> Restaurar desde archivo
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file || !confirm(`¿Restaurar "${file.name}"? Se reemplazarán los datos actuales.`)) return;
              await restore.run({ json: await file.text() });
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Database className="size-4" /> Copia del archivo SQLite</CardTitle>
          <CardDescription className="break-all">Base local: {databasePath}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" disabled={snapshot.pending} onClick={() => void snapshot.run(undefined)}>
            <HardDriveDownload /> Crear copia en data/backups
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
