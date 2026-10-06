import type { Metadata } from "next";
import { Download } from "lucide-react";
import { notFound } from "next/navigation";
import { CabeceraMes } from "@/components/planificacion/cabecera-mes";
import { Muestra } from "@/components/planificacion/campos";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireRol, ROLES_PLAN_LECTURA } from "@/lib/auth/rbac";
import { hoyISO, horasLegibles } from "@/lib/fechas";
import { fechasDelMes } from "@/lib/planificacion/motor";
import { cierreMes } from "@/lib/planificacion/seguimiento";
import { fechaDiaMes, nombreMes, saldoTexto } from "@/lib/planificacion/tablero";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Cierre de mes" };
export const dynamic = "force-dynamic";

function Diferencia({ h }: { h: number | null }) {
  if (h == null) return <span className="text-muted-foreground">—</span>;
  const r = Math.round(h * 100) / 100;
  return <span className={cn("tabular-nums", r < 0 && "text-red-600", r > 0 && "text-emerald-700")}>{saldoTexto(h)}</span>;
}

export default async function PaginaCierre({ params }: { params: Promise<{ mes: string }> }) {
  await requireRol(...ROLES_PLAN_LECTURA);
  const { mes } = await params;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) notFound();
  const fechas = fechasDelMes(mes);
  const empezado = fechas[0] < hoyISO();
  const d = empezado ? await cierreMes(mes) : null;
  const total = d
    ? {
        planificadoH: d.filas.reduce((t, f) => t + f.planificadoH, 0),
        realH: d.filas.reduce((t, f) => t + f.realH, 0),
      }
    : null;

  return (
    <div className="space-y-6">
      <CabeceraMes
        mes={mes}
        nombreMes={nombreMes(mes)}
        ayuda="cierre"
        seccion="/cierre"
        titulo="Cierre de mes"
        descripcion={
          <>
            Por cliente: la bolsa, lo planificado en la versión vigente y lo real, que son las horas logadas (user_log) con los
            usuarios de cada cliente, estén o no en la plantilla: lo mismo que factura operaciones por horas logadas (GH_nnnn
            para GH; los GH_nnnn_BD son de BD). En un cliente a demanda (Ávolo) solo cuenta el tiempo con su usuario: la espera
            en GH es de GH.
          </>
        }
      >
        {d ? (
          <Button variant="outline" size="sm" render={<a href={`/api/planificacion/cierre?mes=${mes}`} />}>
            <Download /> XLSX
          </Button>
        ) : null}
      </CabeceraMes>

      {!d ? (
        <p className="text-sm text-muted-foreground">{nombreMes(mes)} aún no tiene ningún día cerrado.</p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {d.cerrado ? "Mes cerrado." : `Mes en curso: datos hasta el ${fechaDiaMes(d.hasta)} (lo planificado es el del mes entero).`}{" "}
            {d.version
              ? `Plan: v${d.version.numero} ${d.version.estado === "publicada" ? "publicada" : d.version.estado}${d.version.origen === "importada" ? ", importada del Excel" : ""}.`
              : "Sin plan este mes."}
          </p>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Por cliente</CardTitle>
              <CardDescription>
                Las cifras se suman sin redondear y se redondean al final; el XLSX lleva los valores exactos.
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead className="text-right">Bolsa</TableHead>
                    <TableHead className="text-right">Planificado</TableHead>
                    <TableHead className="text-right">Real (logado)</TableHead>
                    <TableHead className="text-right">Real − bolsa</TableHead>
                    <TableHead className="text-right">Real − planificado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {d.filas.map((f) => (
                    <TableRow key={f.cliente}>
                      <TableCell>
                        <span className="inline-flex items-center gap-2">
                          <Muestra color={f.color} />
                          {f.nombre}
                          {f.cuentaComo ? <span className="text-xs text-muted-foreground">(bolsa de {f.cuentaComo})</span> : null}
                        </span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{f.bolsaH != null ? horasLegibles(f.bolsaH) : "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{horasLegibles(f.planificadoH)}</TableCell>
                      <TableCell className="text-right tabular-nums font-medium">{horasLegibles(f.realH)}</TableCell>
                      <TableCell className="text-right">
                        <Diferencia h={f.bolsaH != null && !d.grupos.some((g) => g.cabeza === f.cliente) ? f.realH - f.bolsaH : null} />
                      </TableCell>
                      <TableCell className="text-right">
                        <Diferencia h={f.planificadoH > 0 || f.realH > 0 ? f.realH - f.planificadoH : null} />
                      </TableCell>
                    </TableRow>
                  ))}
                  {d.grupos.map((g) => (
                    <TableRow key={`g-${g.cabeza}`} className="bg-muted/40">
                      <TableCell>Grupo {g.miembros.join(" + ")}</TableCell>
                      <TableCell className="text-right tabular-nums">{g.bolsaH != null ? horasLegibles(g.bolsaH) : "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{horasLegibles(g.planificadoH)}</TableCell>
                      <TableCell className="text-right tabular-nums font-medium">{horasLegibles(g.realH)}</TableCell>
                      <TableCell className="text-right">
                        <Diferencia h={g.bolsaH != null ? g.realH - g.bolsaH : null} />
                      </TableCell>
                      <TableCell className="text-right">
                        <Diferencia h={g.realH - g.planificadoH} />
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="font-semibold">
                    <TableCell>Total</TableCell>
                    <TableCell />
                    <TableCell className="text-right tabular-nums">{horasLegibles(total!.planificadoH)}</TableCell>
                    <TableCell className="text-right tabular-nums">{horasLegibles(total!.realH)}</TableCell>
                    <TableCell />
                    <TableCell className="text-right">
                      <Diferencia h={total!.realH - total!.planificadoH} />
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Por usuario</CardTitle>
              <CardDescription>Para cuadrar con el Excel de horas de operaciones, usuario a usuario.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-1">
              {d.filas
                .filter((f) => d.usuarios.some((u) => u.cliente === f.cliente))
                .map((f) => {
                  const usuarios = d.usuarios.filter((u) => u.cliente === f.cliente);
                  return (
                    <details key={f.cliente} className="rounded border px-3 py-1.5">
                      <summary className="cursor-pointer text-sm">
                        {f.nombre} · {usuarios.length} {usuarios.length === 1 ? "usuario" : "usuarios"} · {horasLegibles(f.realH)}
                      </summary>
                      <Table className="mt-2">
                        <TableHeader>
                          <TableRow>
                            <TableHead>Usuario</TableHead>
                            <TableHead className="text-right">Horas logadas</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {usuarios.map((u) => (
                            <TableRow key={u.usrName}>
                              <TableCell>{u.usrName}</TableCell>
                              <TableCell className="text-right tabular-nums">{horasLegibles(u.realH)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </details>
                  );
                })}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
