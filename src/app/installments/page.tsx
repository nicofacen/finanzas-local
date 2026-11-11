import { Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, Progress, Table, Td, Th, Tr } from "@/components/ui/primitives";
import { ProjectionBars } from "@/modules/analytics/presentation/components/Charts";
import { getContainer } from "@/shared/infrastructure/di/container";
import { unwrapQuery } from "@/shared/presentation/action";
import { MoneyText } from "@/shared/presentation/components/Money";
import { PageHeader } from "@/shared/presentation/components/MonthNav";

export const dynamic = "force-dynamic";

export default async function InstallmentsPage() {
  const data = unwrapQuery(await getContainer().transactions.installmentsOverview.execute({ months: 12 }));
  return (
    <>
      <PageHeader title="Compras en cuotas" description="Cada cuota impacta automáticamente el presupuesto de su mes" />
      <Card>
        <CardHeader>
          <CardTitle>Proyección de cuotas — próximos 12 meses</CardTitle>
          <CardDescription>Total comprometido por mes en moneda base</CardDescription>
        </CardHeader>
        <CardContent>
          <ProjectionBars data={data.projection.map((p) => ({ label: p.label, amount: p.amount.value }))} />
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Planes activos</CardTitle>
        </CardHeader>
        <CardContent>
          {data.purchases.length === 0 ? (
            <EmptyState title="No hay cuotas pendientes" description='Cargá una compra desde Movimientos o con Ctrl+K: "120000 Zapatillas visa 6c".' />
          ) : (
            <Table>
              <thead>
                <tr className="border-b">
                  <Th>Compra</Th>
                  <Th>Tarjeta</Th>
                  <Th className="text-right">Total</Th>
                  <Th className="text-right">Cuota</Th>
                  <Th>Avance</Th>
                  <Th className="text-right">Resta pagar</Th>
                  <Th>Período</Th>
                </tr>
              </thead>
              <tbody>
                {data.purchases.map((p) => (
                  <Tr key={p.id}>
                    <Td>
                      <p className="font-medium">{p.description}</p>
                      <p className="text-xs text-muted-foreground">{p.categoryName ?? "Sin categoría"} · comprado {p.purchaseDate}</p>
                    </Td>
                    <Td className="text-muted-foreground">{p.accountName}</Td>
                    <Td className="text-right"><MoneyText value={p.total} /></Td>
                    <Td className="text-right"><MoneyText value={p.installmentAmount} /></Td>
                    <Td className="min-w-32">
                      <p className="mb-1 text-xs text-muted-foreground">
                        {p.billed}/{p.count} {p.currentLabel && `· este mes ${p.currentLabel}`}
                      </p>
                      <Progress value={(p.billed / p.count) * 100} />
                    </Td>
                    <Td className="text-right font-medium"><MoneyText value={p.remaining} /></Td>
                    <Td className="whitespace-nowrap text-xs text-muted-foreground">{p.firstMonth} → {p.lastMonth}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
