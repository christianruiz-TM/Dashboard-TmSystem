import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CabeceraMes } from "@/components/planificacion/cabecera-mes";
import { PuntoAyuda } from "@/components/planificacion/punto-ayuda";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireRol, ROLES_PLAN_LECTURA } from "@/lib/auth/rbac";
import { horasLegibles } from "@/lib/fechas";
import {
  periodosHoras,
  resumenMesHoras,
  sumaPeriodo,
  sumarFilas,
  VISTAS_HORAS,
  type DiaHorasLike,
  type PeriodoHoras,
  type SumaHoras,
  type VistaHoras,
} from "@/lib/planificacion/horas";
import { horasMes } from "@/lib/planificacion/seguimiento";
import { fechaDiaMes, nombreMes, saldoTexto } from "@/lib/planificacion/tablero";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Horas" };
export const dynamic = "force-dynamic";

const NOMBRE_VISTA: Record<VistaHoras, string> = { dia: "Por día", semana: "Por semana", mes: "Mes" };
const dos = (h: number) => h.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** Color de la diferencia: en rojo lo que falta, en verde lo que sobra (como en Saldos). */
const colorDiferencia = (h: number) => {
  const r = Math.round(h * 100);
  return r < 0 ? "text-red-600" : r > 0 ? "text-emerald-700" : "text-muted-foreground";
};

/** Celda de un periodo: horas logadas y, debajo, el contrato y la diferencia. */
function CeldaHoras({ s, compacta, ausencias = [] }: { s: SumaHoras; compacta: boolean; ausencias?: string[] }) {
  if (!s.conDatos) {
    return <TableCell className="text-center text-xs text-muted-foreground">{ausencias.join(" ")}</TableCell>;
  }
  return (
    <TableCell className={cn("text-right tabular-nums", s.previsto && "italic")}>
      <div className="font-medium">{compacta ? dos(s.logadas) : horasLegibles(s.logadas)}</div>
      <div className="text-[11px] leading-tight text-muted-foreground">
        de {compacta ? dos(s.contrato) : horasLegibles(s.contrato)}
        {compacta ? null : (
          <>
            {" · "}
            <span className={colorDiferencia(s.diferencia)}>{saldoTexto(s.diferencia)}</span>
          </>
        )}
      </div>
      {compacta && Math.round(s.diferencia * 100) !== 0 ? (
        <div className={cn("text-[11px] leading-tight", colorDiferencia(s.diferencia))}>{saldoTexto(s.diferencia).replace(" h", "")}</div>
      ) : null}
      {ausencias.length > 0 ? <div className="text-[10px] font-medium text-muted-foreground">{ausencias.join(" ")}</div> : null}
    </TableCell>
  );
}

/** Celdas del mes: hasta ayer y previsto a fin de mes. */
function CeldasMes({ dias }: { dias: readonly DiaHorasLike[] }) {
  const { real, previsto } = resumenMesHoras(dias);
  return (
    <>
      <TableCell className="text-right tabular-nums">{horasLegibles(real.contrato)}</TableCell>
      <TableCell className="text-right tabular-nums">{horasLegibles(real.logadas)}</TableCell>
      <TableCell className={cn("text-right tabular-nums font-medium", colorDiferencia(real.diferencia))}>{saldoTexto(real.diferencia)}</TableCell>
      <TableCell className="text-right tabular-nums">{horasLegibles(previsto.contrato)}</TableCell>
      <TableCell className={cn("text-right tabular-nums", previsto.previsto && "italic")}>{horasLegibles(previsto.logadas)}</TableCell>
      <TableCell className={cn("text-right tabular-nums font-medium", previsto.previsto && "italic", colorDiferencia(previsto.diferencia))}>
        {saldoTexto(previsto.diferencia)}
      </TableCell>
    </>
  );
}

function CabecerasPeriodos({ periodos }: { periodos: PeriodoHoras[] }) {
  return (
    <>
      {periodos.map((p) => (
        <TableHead key={p.clave} className="text-right align-bottom">
          {p.etiqueta}
          {p.detalle ? <div className="text-[10px] font-normal text-muted-foreground">{p.detalle}</div> : null}
        </TableHead>
      ))}
    </>
  );
}

export default async function PaginaHoras({
  params,
  searchParams,
}: {
  params: Promise<{ mes: string }>;
  searchParams: Promise<{ ver?: string }>;
}) {
  await requireRol(...ROLES_PLAN_LECTURA);
  const { mes } = await params;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) notFound();
  const { ver } = await searchParams;
  const vista: VistaHoras = (VISTAS_HORAS as readonly string[]).includes(ver ?? "") ? (ver as VistaHoras) : "semana";
  const d = await horasMes(mes);
  const compacta = vista === "dia";
  const total = d ? sumarFilas(d.agentes.map((a) => a.dias)) : [];
  const totalCliente = d
    ? sumarFilas(d.clientes.map((c) => c.dias.map((x) => ({ fecha: x.fecha, cerrado: x.cerrado, contrato: 0, logadas: x.horas }))))
    : [];
  // Por día, sin los días en que nadie tiene contrato ni horas (los fines de semana, casi siempre)
  const periodos = (d ? periodosHoras(vista, d.fechas, d.semanas) : []).filter(
    (p) => !compacta || sumaPeriodo(total, p.fechas).conDatos || sumaPeriodo(totalCliente, p.fechas).conDatos,
  );

  return (
    <div className="space-y-6">
      <CabeceraMes
        mes={mes}
        nombreMes={nombreMes(mes)}
        ayuda="horas"
        seccion="/horas"
        titulo="Horas"
        descripcion={
          <>
            Horas de contrato de cada persona frente a las horas que estuvo conectada. Hasta ayer, las horas conectadas de
            verdad; de hoy en adelante, las planificadas (en cursiva). Las vacaciones y libranzas no suman aquí: el saldo con
            ellas está en Saldos.
          </>
        }
      />

      {!d ? (
        <p className="text-sm text-muted-foreground">{nombreMes(mes)} no tiene versión publicada ni borrador: no hay plan del que sacar las horas.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <nav className="inline-flex gap-1 rounded-lg bg-muted p-1" aria-label="Ver por">
              {VISTAS_HORAS.map((v) => (
                <Link
                  key={v}
                  href={`/planificacion/${mes}/horas?ver=${v}`}
                  aria-current={v === vista ? "page" : undefined}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                    v === vista ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {NOMBRE_VISTA[v]}
                </Link>
              ))}
            </nav>
            <p className="text-sm text-muted-foreground">
              Plan: v{d.version.numero} {d.version.estado === "publicada" ? "publicada" : "en borrador"} · conectadas hasta el{" "}
              {fechaDiaMes(d.fechaDatos)}
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Por persona
                <PuntoAyuda id="horas-contrato" />
              </CardTitle>
              <CardDescription>
                {vista === "mes"
                  ? "Hasta ayer: contrato y horas conectadas de los días que ya han pasado. Mes completo: con lo planificado del resto del mes."
                  : "En cada casilla, las horas conectadas y, debajo, las de contrato y la diferencia (en rojo, las que faltan; en verde, las que sobran)."}{" "}
                Solo personas con contrato.
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  {vista === "mes" ? (
                    <>
                      <TableRow>
                        <TableHead rowSpan={2} className="align-bottom">
                          Agente
                        </TableHead>
                        <TableHead rowSpan={2} className="text-right align-bottom">
                          Contrato
                        </TableHead>
                        <TableHead colSpan={3} className="border-l text-center">
                          Hasta ayer
                        </TableHead>
                        <TableHead colSpan={3} className="border-l text-center">
                          Mes completo (con lo planificado)
                        </TableHead>
                      </TableRow>
                      <TableRow>
                        <TableHead className="border-l text-right">Contrato</TableHead>
                        <TableHead className="text-right">Conectadas</TableHead>
                        <TableHead className="text-right">Diferencia</TableHead>
                        <TableHead className="border-l text-right">Contrato</TableHead>
                        <TableHead className="text-right">Conectadas + plan</TableHead>
                        <TableHead className="text-right">Diferencia</TableHead>
                      </TableRow>
                    </>
                  ) : (
                    <TableRow>
                      <TableHead className="align-bottom">Agente</TableHead>
                      <TableHead className="text-right align-bottom">Contrato</TableHead>
                      <CabecerasPeriodos periodos={periodos} />
                      <TableHead className="border-l text-right align-bottom">Mes</TableHead>
                    </TableRow>
                  )}
                </TableHeader>
                <TableBody>
                  {d.agentes.map((a) => (
                    <TableRow key={a.numero}>
                      <TableCell className="whitespace-nowrap">
                        {a.numero}
                        {a.nombre ? ` ${a.nombre}` : ""}
                      </TableCell>
                      <TableCell className="text-right tabular-nums whitespace-nowrap text-muted-foreground">{horasLegibles(a.contratoSemanalH)}/sem</TableCell>
                      {vista === "mes" ? (
                        <CeldasMes dias={a.dias} />
                      ) : (
                        <>
                          {periodos.map((p) => (
                            <CeldaHoras
                              key={p.clave}
                              s={sumaPeriodo(a.dias, p.fechas)}
                              compacta={compacta}
                              ausencias={compacta ? a.dias.find((x) => x.fecha === p.clave)?.ausencias : undefined}
                            />
                          ))}
                          <CeldaHoras s={sumaPeriodo(a.dias, d.fechas)} compacta={false} />
                        </>
                      )}
                    </TableRow>
                  ))}
                  <TableRow className="border-t-2 font-semibold">
                    <TableCell>Total</TableCell>
                    <TableCell />
                    {vista === "mes" ? (
                      <CeldasMes dias={total} />
                    ) : (
                      <>
                        {periodos.map((p) => (
                          <CeldaHoras key={p.clave} s={sumaPeriodo(total, p.fechas)} compacta={compacta} />
                        ))}
                        <CeldaHoras s={sumaPeriodo(total, d.fechas)} compacta={false} />
                      </>
                    )}
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Por cliente
                <PuntoAyuda id="horas-cliente" />
              </CardTitle>
              <CardDescription>
                Horas conectadas con los usuarios de cada cliente (GH_…, UGR_…), de toda la empresa, como en Cierre; de hoy en
                adelante, las planificadas. El contrato es de cada persona, no del cliente. Quien está conectada con dos
                usuarios a la vez cuenta en los dos clientes: la suma puede pasar de la de las personas.
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="align-bottom">Cliente</TableHead>
                    {vista === "mes" ? (
                      <>
                        <TableHead className="text-right">Hasta ayer</TableHead>
                        <TableHead className="text-right">Mes completo (con lo planificado)</TableHead>
                      </>
                    ) : (
                      <>
                        <CabecerasPeriodos periodos={periodos} />
                        <TableHead className="border-l text-right align-bottom">Mes</TableHead>
                      </>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...d.clientes.map((c) => ({ ...c, total: false })), { codigo: "", nombre: "Total", color: "", dias: [], total: true }].map((c) => {
                    const dias = c.total ? totalCliente : c.dias.map((x) => ({ fecha: x.fecha, cerrado: x.cerrado, contrato: 0, logadas: x.horas }));
                    const celda = (fechas: readonly string[], clave: string, claseExtra?: string) => {
                      const s = sumaPeriodo(dias, fechas);
                      return (
                        <TableCell key={clave} className={cn("text-right tabular-nums", s.previsto && "italic", claseExtra)}>
                          {s.conDatos ? (compacta && clave !== "total" ? dos(s.logadas) : horasLegibles(s.logadas)) : ""}
                        </TableCell>
                      );
                    };
                    const { real, previsto } = resumenMesHoras(dias);
                    return (
                      <TableRow key={c.codigo || "total"} className={c.total ? "border-t-2 font-semibold" : undefined}>
                        <TableCell className="whitespace-nowrap">
                          {c.total ? null : (
                            <span className="mr-1.5 inline-block size-2.5 rounded-sm border border-black/15 align-middle" style={{ backgroundColor: c.color }} aria-hidden />
                          )}
                          {c.nombre}
                        </TableCell>
                        {vista === "mes" ? (
                          <>
                            <TableCell className="text-right tabular-nums">{horasLegibles(real.logadas)}</TableCell>
                            <TableCell className={cn("text-right tabular-nums", previsto.previsto && "italic")}>{horasLegibles(previsto.logadas)}</TableCell>
                          </>
                        ) : (
                          <>
                            {periodos.map((p) => celda(p.fechas, p.clave))}
                            {celda(d.fechas, "total", "border-l font-medium")}
                          </>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
