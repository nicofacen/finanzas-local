import { AlertTriangle, CheckCircle2, Coffee, Gauge, Info, TrendingDown, TrendingUp } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState } from "@/components/ui/primitives";
import type { DashboardView as Dashboard } from "../application/GetDashboardUseCase";
import { MoneyText } from "@/shared/presentation/components/Money";
import { MonthNav, PageHeader } from "@/shared/presentation/components/MonthNav";
import { CategoryBars, FlowsChart, PaceChart, ProjectionBars } from "./components/Charts";

const PACE_LABEL = {
  under: { text: "Por debajo del ritmo", tone: "positive", icon: CheckCircle2 },
  on_track: { text: "En ritmo", tone: "positive", icon: CheckCircle2 },
  over: { text: "Gastando rápido", tone: "negative", icon: AlertTriangle },
  no_budget: { text: "Sin presupuesto", tone: "neutral", icon: Info },
} as const;

function Kpi({ title, children, hint }: { title: string; children: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-1">
        <CardDescription>{title}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold tracking-tight">{children}</div>
        {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
      </CardContent>
    </Card>
  );
}

export function DashboardView({ data, empty }: { data: Dashboard; empty: boolean }) {
  const pace = PACE_LABEL[data.pace.status];
  const PaceIcon = pace.icon;

  if (empty) {
    return (
      <>
        <PageHeader title="Dashboard" />
        <EmptyState title="Todavía no hay datos" description="Creá tu primera cuenta o cargá los datos de demostración para explorar la app.">
          <div className="mt-2 flex gap-2">
            <Link href="/accounts" className={buttonVariants({ size: "sm" })}>Crear cuenta</Link>
            <Link href="/settings" className={buttonVariants({ size: "sm", variant: "outline" })}>Cargar demo</Link>
          </div>
        </EmptyState>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Dashboard" description="Tu mes de un vistazo">
        <MonthNav month={data.month} basePath="/" />
      </PageHeader>

      {data.missingRates.length > 0 && (
        <p className="mb-4 rounded-md bg-warning/15 px-3 py-2 text-xs text-warning">
          Faltan tipos de cambio para {data.missingRates.join(", ")}: esas cuentas no se suman al patrimonio.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi title="Patrimonio neto" hint={<>Activos <MoneyText value={data.netWorth.assets} /> · Deudas <MoneyText value={data.netWorth.liabilities} /></>}>
          <MoneyText value={data.netWorth.net} />
        </Kpi>
        <Kpi
          title="Tasa de ahorro del mes"
          hint={<>Ahorrado <MoneyText value={data.savings.saved} colored /></>}
        >
          <span className={data.savings.ratePercent !== null && data.savings.ratePercent < 0 ? "text-negative" : ""}>
            {data.savings.ratePercent === null ? "—" : `${data.savings.ratePercent.toLocaleString("es-AR")}%`}
          </span>
        </Kpi>
        <Kpi title="Ingresos del mes" hint={<>Gastos <MoneyText value={data.savings.expenses} /></>}>
          <MoneyText value={data.savings.income} />
        </Kpi>
        <Kpi
          title="Ritmo de gasto"
          hint={<>Promedio diario <MoneyText value={data.pace.dailyAverage} /> · quedan {data.pace.daysRemaining} días</>}
        >
          <span className="flex items-center gap-2">
            {data.pace.pacePercent === null ? "—" : `${Math.round(data.pace.pacePercent)}%`}
            <Badge tone={pace.tone}>
              <PaceIcon className="size-3" /> {pace.text}
            </Badge>
          </span>
        </Kpi>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Gauge className="size-4" /> Velocidad de gasto vs. días del mes</CardTitle>
            <CardDescription>
              Gastado <MoneyText value={data.pace.spent} /> de <MoneyText value={data.pace.budget} />
              {data.pace.budgetSource === "average" && " (promedio de los últimos meses)"}
              {data.pace.budgetSource === "envelopes" && " asignado en sobres"} · proyección al cierre{" "}
              <MoneyText value={data.pace.projected} className={data.pace.status === "over" ? "text-negative" : ""} />
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PaceChart data={data.pace.series} />
          </CardContent>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Coffee className="size-4" /> Alertas: gastos hormiga y desvíos</CardTitle>
            <CardDescription>Comparado con tu promedio móvil de 3 meses</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.insights.length === 0 && <p className="text-sm text-muted-foreground">Sin desvíos relevantes este mes. 🎉</p>}
            {data.insights.slice(0, 6).map((i, idx) => (
              <div key={idx} className="flex gap-3 rounded-md border p-3">
                {i.severity === "info" ? (
                  <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                ) : (
                  <AlertTriangle className={`mt-0.5 size-4 shrink-0 ${i.severity === "critical" ? "text-negative" : "text-warning"}`} />
                )}
                <div className="min-w-0">
                  <p className="text-sm font-medium">{i.title}</p>
                  <p className="text-xs text-muted-foreground">{i.message}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><TrendingUp className="size-4" /> Ingresos vs. gastos (6 meses)</CardTitle>
            <CardDescription>Los gastos incluyen las cuotas de cada mes</CardDescription>
          </CardHeader>
          <CardContent>
            <FlowsChart data={data.flows} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Gasto por categoría</CardTitle>
            <CardDescription>{data.monthLabel}</CardDescription>
          </CardHeader>
          <CardContent>
            {data.categories.length ? <CategoryBars data={data.categories} /> : <p className="text-sm text-muted-foreground">Sin gastos.</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><TrendingDown className="size-4" /> Cuotas comprometidas</CardTitle>
            <CardDescription>Próximos 6 meses</CardDescription>
          </CardHeader>
          <CardContent>
            <ProjectionBars data={data.installmentProjection} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
