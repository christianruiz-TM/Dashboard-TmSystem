import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SelectNativo } from "@/components/admin/select-nativo";
import { CabeceraMes } from "@/components/planificacion/cabecera-mes";
import { BotonBorradorDesdePublicada } from "@/components/planificacion/dialogos-edicion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { puedeEditarPlan, requireRol, ROLES_PLAN_LECTURA } from "@/lib/auth/rbac";
import { horasLegibles } from "@/lib/fechas";
import { diaSemana, rangoCorto } from "@/lib/planificacion/motor";
import * as repo from "@/lib/planificacion/repositorio";
import { diaCorto, fechaDiaMes, nombreMes, saldoTexto } from "@/lib/planificacion/tablero";
import { datosVersionesMes, type FilaVersion } from "@/lib/planificacion/vistas";
import { crearBorradorDesdePublicadaAccion } from "../acciones";

export const metadata: Metadata = { title: "Versiones del plan" };
export const dynamic = "force-dynamic";

const ESTADO: Record<FilaVersion["estado"], string> = {
  borrador: "bg-amber-100 text-amber-900",
  publicada: "bg-emerald-100 text-emerald-900",
  sustituida: "bg-muted text-muted-foreground",
  descartada: "bg-muted text-muted-foreground",
  simulacion: "bg-sky-100 text-sky-900",
};
const ORIGEN: Record<FilaVersion["origen"], string> = {
  motor: "generada automáticamente",
  copia: "copia",
  recalculo: "regenerada respetando cambios",
  importada: "importada del Excel de supervisión",
};
const ACCION: Record<string, string> = {
  plan_generar: "Generar",
  plan_editar: "Editar",
  plan_publicar: "Publicar",
  plan_importar: "Importar Excel",
  plan_ausencia: "Ausencia",
  plan_bolsa: "Bolsa / objetivo",
  plan_saldo_ajuste: "Ajuste de saldo",
};
const MAX_CAMBIOS = 400;

function Cliente({ codigo, color }: { codigo: string | null; color: string | undefined }) {
  if (!codigo) return <span className="text-muted-foreground italic">libre</span>;
  return (
    <span className="inline-flex items-center rounded-sm border border-black/15 px-1 text-[11px] font-medium" style={{ backgroundColor: color }}>
      {codigo}
    </span>
  );
}

export default async function PaginaVersiones({
  params,
  searchParams,
}: {
  params: Promise<{ mes: string }>;
  searchParams: Promise<{ a?: string; b?: string }>;
}) {
  const usuario = await requireRol(...ROLES_PLAN_LECTURA);
  const { mes } = await params;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) notFound();
  const sp = await searchParams;
  const id = (v: string | undefined) => (v != null && /^\d+$/.test(v) ? Number(v) : undefined);
  const editar = puedeEditarPlan(usuario.rol);
  const { versiones, diff, historial } = datosVersionesMes(mes, id(sp.a), id(sp.b));
  const colores = new Map(repo.leerClientesTodos().map((c) => [c.codigo, c.color]));
  const numero = (versionId: number) => versiones.find((v) => v.id === versionId)?.numero;
  const publicada = versiones.find((v) => v.estado === "publicada");
  const hayBorrador = versiones.some((v) => v.estado === "borrador");

  // Cambios agrupados por día
  const porDia = new Map<string, NonNullable<typeof diff>["cambios"]>();
  for (const c of diff?.cambios.slice(0, MAX_CAMBIOS) ?? []) porDia.set(c.fecha, [...(porDia.get(c.fecha) ?? []), c]);

  return (
    <div className="space-y-6">
      <CabeceraMes
        mes={mes}
        nombreMes={nombreMes(mes)}
        ayuda="versiones"
        seccion="/versiones"
        titulo="Versiones y cambios"
        descripcion="Ciclo de una versión: borrador → publicada → sustituida (cuando se publica otra). Regenerar deja el borrador anterior como «descartada». Una publicada no se edita: se crea un borrador nuevo a partir de ella."
      >
        {editar && publicada && !hayBorrador ? (
          <BotonBorradorDesdePublicada accion={crearBorradorDesdePublicadaAccion} versionId={publicada.id} numero={publicada.numero} />
        ) : null}
      </CabeceraMes>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Versiones ({versiones.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {versiones.length === 0 ? (
            <p className="text-sm text-muted-foreground">Este mes aún no tiene plan.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Versión</TableHead>
                  <TableHead>Origen</TableHead>
                  <TableHead>Creada</TableHead>
                  <TableHead>Publicada</TableHead>
                  <TableHead className="text-right">Planificado</TableHead>
                  <TableHead className="text-right">Bloques</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {versiones.map((v) => (
                  <TableRow key={v.id}>
                    <TableCell>
                      <div className="flex items-center gap-2 font-medium">
                        v{v.numero}
                        <Badge className={ESTADO[v.estado]}>{v.estado === "simulacion" ? "simulación" : v.estado}</Badge>
                      </div>
                      {v.estado === "borrador" ? (
                        <div className="text-xs text-muted-foreground">
                          {v.revision === 0 ? "sin cambios guardados" : `${v.revision} ${v.revision === 1 ? "guardado" : "guardados"}`}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-sm">
                      {ORIGEN[v.origen]}
                      {v.basadaEn != null ? <span className="text-muted-foreground"> de la v{v.basadaEn}</span> : null}
                    </TableCell>
                    <TableCell className="text-xs">
                      {v.creadaAt}
                      <div className="text-muted-foreground">{v.creadaPor ?? "—"}</div>
                    </TableCell>
                    <TableCell className="max-w-xs text-xs">
                      {v.publicadaAt ? (
                        <>
                          {v.publicadaAt} · {v.publicadaPor ?? "—"}
                          {v.motivoPublicacion ? (
                            <div className="text-muted-foreground" title={v.motivoPublicacion}>
                              Motivo: «{v.motivoPublicacion}»
                            </div>
                          ) : null}
                        </>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{horasLegibles(v.planificadoH)}</TableCell>
                    <TableCell className="text-right tabular-nums">{v.bloques}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap justify-end gap-1">
                        <Button variant="outline" size="xs" render={<Link href={`/planificacion/${mes}?version=${v.id}`} />}>
                          Ver
                        </Button>
                        {publicada && publicada.id !== v.id ? (
                          <Button variant="ghost" size="xs" render={<Link href={`?a=${publicada.id}&b=${v.id}`} />}>
                            Frente a la publicada
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {versiones.length > 1 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Cambios
              {diff ? ` de la v${numero(diff.a)} a la v${numero(diff.b)}` : ""}
            </CardTitle>
            <CardDescription>
              Tramo a tramo, por agente y día: dividir o unir bloques no es un cambio; mover un bloque de una agente a otra son dos
              (uno en cada fila). «Libre» es turno o franja sin bloque.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form className="flex flex-wrap items-end gap-2" method="get">
              <div className="grid gap-1">
                <label htmlFor="comparar-a" className="text-xs font-medium">
                  Antes
                </label>
                <SelectNativo id="comparar-a" name="a" defaultValue={diff?.a} className="w-56">
                  {versiones.map((v) => (
                    <option key={v.id} value={v.id}>
                      v{v.numero} ({v.estado})
                    </option>
                  ))}
                </SelectNativo>
              </div>
              <div className="grid gap-1">
                <label htmlFor="comparar-b" className="text-xs font-medium">
                  Después
                </label>
                <SelectNativo id="comparar-b" name="b" defaultValue={diff?.b} className="w-56">
                  {versiones.map((v) => (
                    <option key={v.id} value={v.id}>
                      v{v.numero} ({v.estado})
                    </option>
                  ))}
                </SelectNativo>
              </div>
              <Button type="submit" size="sm" variant="outline">
                Comparar
              </Button>
            </form>

            {!diff ? (
              <p className="text-sm text-muted-foreground">Elige dos versiones distintas.</p>
            ) : diff.cambios.length === 0 ? (
              <p className="text-sm">Sin cambios: las dos versiones asignan lo mismo a cada agente y hora.</p>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                  <span className="font-medium">
                    {diff.cambios.length} {diff.cambios.length === 1 ? "tramo cambiado" : "tramos cambiados"}
                  </span>
                  {Object.entries(diff.balance)
                    .sort(([x], [y]) => x.localeCompare(y))
                    .map(([codigo, h]) => (
                      <span key={codigo} className="inline-flex items-center gap-1 tabular-nums">
                        <Cliente codigo={codigo} color={colores.get(codigo)} /> {saldoTexto(h)}
                      </span>
                    ))}
                </div>
                <div className="space-y-3">
                  {[...porDia].map(([fecha, lista]) => (
                    <div key={fecha}>
                      <h3 className="text-sm font-medium">
                        {diaCorto(diaSemana(fecha))} {fechaDiaMes(fecha)}
                      </h3>
                      <ul className="mt-1 space-y-0.5 text-sm">
                        {lista.map((c, i) => (
                          <li key={i} className="flex flex-wrap items-center gap-1.5">
                            <span className="min-w-40 font-medium">
                              {c.agenteNumero} {c.nombre ?? ""}
                            </span>
                            <span className="w-16 tabular-nums">{rangoCorto(c.inicioMin, c.finMin)}</span>
                            <Cliente codigo={c.antes} color={c.antes ? colores.get(c.antes) : undefined} />
                            <span aria-label="pasa a">→</span>
                            <Cliente codigo={c.despues} color={c.despues ? colores.get(c.despues) : undefined} />
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                  {diff.cambios.length > MAX_CAMBIOS ? (
                    <p className="text-xs text-muted-foreground">… y {diff.cambios.length - MAX_CAMBIOS} tramos más.</p>
                  ) : null}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Historial</CardTitle>
          <CardDescription>Lo que ha quedado en la auditoría sobre el plan de este mes (lo más reciente primero).</CardDescription>
        </CardHeader>
        <CardContent>
          {historial.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin registros.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cuándo</TableHead>
                  <TableHead>Quién</TableHead>
                  <TableHead>Qué</TableHead>
                  <TableHead>Detalle</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {historial.map((h) => (
                  <TableRow key={h.id}>
                    <TableCell className="text-xs whitespace-nowrap">{h.ts}</TableCell>
                    <TableCell className="text-xs">{h.username ?? "—"}</TableCell>
                    <TableCell className="text-xs">{ACCION[h.accion] ?? h.accion}</TableCell>
                    <TableCell className="max-w-2xl text-xs break-words whitespace-normal">{h.detalle}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
