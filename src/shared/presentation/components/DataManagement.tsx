"use client";

import { Database, Download, HardDriveDownload, RotateCcw, Sparkles, Upload } from "lucide-react";
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Input } from "@/components/ui/primitives";
import {
  exportBackupAction,
  exportDatabaseFileAction,
  resetDataAction,
  restoreBackupAction,
  seedDemoAction,
} from "../systemActions";
import { useAction } from "../useAction";

function download(content: BlobPart, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const stamp = () => new Date().toISOString().slice(0, 10);

export function DataManagement({ location }: { location: string }) {
  const seed = useAction(seedDemoAction, { success: (d) => `Demo cargada: ${d.transactions} movimientos` });
  const reset = useAction(resetDataAction, { success: "Datos eliminados" });
  const restore = useAction(restoreBackupAction, { success: (d) => `Backup restaurado (${d.rows} filas)` });
  const exportJson = useAction(exportBackupAction, { success: "Backup descargado" });
  const exportFile = useAction(exportDatabaseFileAction, { success: "Archivo SQLite descargado" });
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="lg:col-span-2">
        <CardContent className="pt-5 text-sm text-muted-foreground">
          Tus datos se guardan <strong className="text-foreground">solo en este navegador</strong> ({location}). Nadie más puede verlos,
          pero si borrás los datos del sitio o cambiás de navegador/dispositivo, no estarán. <strong className="text-foreground">Descargá un backup
          cada tanto.</strong>
        </CardContent>
      </Card>

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
          <Button
            variant="outline"
            disabled={exportJson.pending}
            onClick={async () => {
              const r = await exportJson.run(undefined);
              if (r.ok) download(JSON.stringify(r.data, null, 2), `finanzas-backup-${stamp()}.json`, "application/json");
            }}
          >
            <Download /> Descargar backup
          </Button>
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
          <CardTitle className="flex items-center gap-2"><Database className="size-4" /> Archivo SQLite</CardTitle>
          <CardDescription>Copia binaria de toda la base, abrible con cualquier visor de SQLite.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            disabled={exportFile.pending}
            onClick={async () => {
              const r = await exportFile.run(undefined);
              if (r.ok) download(r.data.bytes as BlobPart, `finanzas-${stamp()}.sqlite`, "application/octet-stream");
            }}
          >
            <HardDriveDownload /> Descargar archivo .sqlite
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
