import type { Metadata } from "next";
import { desc, eq } from "drizzle-orm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SelectNativo } from "@/components/admin/select-nativo";
import { requireRol } from "@/lib/auth/rbac";
import { db } from "@/lib/db/sqlite";
import { auditLog } from "@/lib/db/schema";

export const metadata: Metadata = { title: "Auditoría" };
export const dynamic = "force-dynamic";

const ACCIONES = [
  "login_ok",
  "login_fail",
  "login_bloqueado",
  "logout",
  "cambio_password",
  "crear_usuario",
  "editar_usuario",
  "reset_password",
  "crear_cliente",
  "editar_cliente",
  "config_facturacion",
  "export",
  "plan_generar",
  "plan_editar",
  "plan_publicar",
  "plan_ausencia",
  "plan_bolsa",
  "plan_config",
  "plan_saldo_ajuste",
] as const;

export default async function PaginaAuditoria({
  searchParams,
}: {
  searchParams: Promise<{ accion?: string }>;
}) {
  await requireRol(); // solo admin; el layout no basta (ver admin/layout.tsx)
  const { accion } = await searchParams;
  const filtro = ACCIONES.includes(accion as (typeof ACCIONES)[number]) ? accion : undefined;

  const consulta = db.select().from(auditLog);
  const entradas = (
    filtro ? consulta.where(eq(auditLog.accion, filtro!)) : consulta
  )
    .orderBy(desc(auditLog.ts))
    .limit(200)
    .all();

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">
          Últimas {entradas.length} entradas{filtro ? ` · ${filtro}` : ""}
        </CardTitle>
        <form method="GET" className="flex items-center gap-2">
          <SelectNativo name="accion" defaultValue={filtro ?? ""} className="w-48">
            <option value="">Todas las acciones</option>
            {ACCIONES.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </SelectNativo>
          <Button variant="outline" size="sm" type="submit">
            Filtrar
          </Button>
        </form>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha y hora</TableHead>
              <TableHead>Usuario</TableHead>
              <TableHead>Acción</TableHead>
              <TableHead>Detalle</TableHead>
              <TableHead>IP</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entradas.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  Sin entradas
                </TableCell>
              </TableRow>
            ) : (
              entradas.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="whitespace-nowrap text-sm tabular-nums">
                    {e.ts.toLocaleString("es-ES", { dateStyle: "short", timeStyle: "medium" })}
                  </TableCell>
                  <TableCell className="text-sm">{e.username ?? "—"}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        e.accion.startsWith("login_") && e.accion !== "login_ok"
                          ? "destructive"
                          : "secondary"
                      }
                      className="text-[10px]"
                    >
                      {e.accion}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-md truncate text-sm text-muted-foreground">
                    {e.detalle ?? "—"}
                  </TableCell>
                  <TableCell className="text-sm tabular-nums">{e.ip ?? "—"}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
