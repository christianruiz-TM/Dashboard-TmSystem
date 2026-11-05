import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { TarjetaKpi } from "@/components/kpi/tarjeta-kpi";
import { CabeceraMes } from "@/components/planificacion/cabecera-mes";
import { PuntoAyuda } from "@/components/planificacion/punto-ayuda";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRol, ROLES_PLAN_LECTURA } from "@/lib/auth/rbac";
import { horasLegibles, hoyISO } from "@/lib/fechas";
import {
  escalaHoras,
  periodoInicial,
  periodosHoras,
  resumenHoras,
  sumarFilas,
  VISTAS_HORAS,
  type ResumenHoras,
  type VistaHoras,
} from "@/lib/planificacion/horas";
import { horasMes } from "@/lib/planificacion/seguimiento";
import { fechaDiaMes, nombreMes, saldoTexto } from "@/lib/planificacion/tablero";
import { cn } from "@/lib/utils";

// ============================================================
// «Horas» del mes: panel con el contrato, las horas planificadas y las
// efectivas (conectada de verdad) de un día, una semana o el mes, para el
// equipo (tres cajas) y por persona y cliente (una barra cada uno). Pedido
// por supervisión el 04/11/2026; panel desde el 05/11. Cálculo en
// lib/planificacion/horas.ts (puro) y seguimiento.ts::horasMes.
// ============================================================

export const metadata: Metadata = { title: "Horas" };
export const dynamic = "force-dynamic";

const NOMBRE_VISTA: Record<VistaHoras, string> = { dia: "Día", semana: "Semana", mes: "Mes" };
const pct = (parte: number, total: number) =>
  total > 0 ? `${Math.round((parte / total) * 100).toLocaleString("es-ES")} %` : "—";

/** En rojo lo que falta, en verde lo que sobra (el signo también lo dice). */
const colorDiferencia = (h: number) => {
  const r = Math.round(h * 100);
  return r < 0 ? "text-red-600 dark:text-red-400" : r > 0 ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground";
};

// Un tono, dos intensidades: lo planificado claro, lo efectivo oscuro; el contrato, una raya de tinta
const CLASE_PLAN = "bg-chart-1/35";
const CLASE_EFECTIVAS = "bg-sky-700 dark:bg-sky-300";

/**
 * Barra de una fila: lo planificado (claro), encima lo efectivo (oscuro) y
 * una raya donde cae el contrato. Todas las filas con el mismo fondo
 * (`escala`), para poder compararlas.
 */
function BarraHoras({ r, escala, conContrato, etiqueta }: { r: ResumenHoras; escala: number; conContrato: boolean; etiqueta: string }) {
  const ancho = (h: number) => `${Math.min(100, Math.max(0, (h / escala) * 100))}%`;
  const texto =
    `${etiqueta}: ${conContrato ? `contrato ${horasLegibles(r.contrato)}, ` : ""}planificadas ${horasLegibles(r.planificadas)}, ` +
    (r.empezado ? `efectivas ${horasLegibles(r.efectivas)}` : "aún sin efectivas");
  return (
    <div className="relative h-7 min-w-40 border-l border-border" role="img" aria-label={texto} title={texto}>
      <div className={cn("absolute inset-y-[6px] left-0 rounded-r-[4px]", CLASE_PLAN)} style={{ width: ancho(r.planificadas) }} />
      {r.empezado ? (
        <div className={cn("absolute inset-y-[10px] left-0 rounded-r-[4px]", CLASE_EFECTIVAS)} style={{ width: ancho(r.efectivas) }} />
      ) : null}
      {conContrato && r.contrato > 0 ? (
        <div className="absolute inset-y-[2px] w-[2px] rounded-full bg-foreground" style={{ left: `calc(${ancho(r.contrato)} - 1px)` }} />
      ) : null}
    </div>
  );
}

function Cifra({ h, className }: { h: number; className?: string }) {
  return <div className={cn("text-right text-sm tabular-nums whitespace-nowrap", className)}>{horasLegibles(h)}</div>;
}

function Diferencia({ r }: { r: ResumenHoras }) {
  if (!r.empezado) return <div className="text-right text-sm text-muted-foreground">—</div>;
  return (
    <div className={cn("text-right text-sm font-medium tabular-nums whitespace-nowrap", colorDiferencia(r.diferencia))}>
      {saldoTexto(r.diferencia)}
    </div>
  );
}

function Leyenda({ conContrato }: { conContrato: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      <span className="inline-flex items-center gap-1.5">
        <span className={cn("inline-block h-3 w-6 rounded-r-[3px]", CLASE_PLAN)} aria-hidden /> Planificadas
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className={cn("inline-block h-1.5 w-6 rounded-r-[3px]", CLASE_EFECTIVAS)} aria-hidden /> Efectivas
      </span>
      {conContrato ? (
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3.5 w-[2px] rounded-full bg-foreground" aria-hidden /> Contrato
        </span>
      ) : null}
    </div>
  );
}

/**
 * Por qué la barra clara puede quedarse antes de la raya del contrato
 * (05/11/2026): el contrato cuenta los festivos, las vacaciones y las
 * libranzas, y esos días no se suelen planificar. Algunos festivos sí se
 * trabajan con algún cliente: entonces sí hay plan.
 */
function NotaContrato({ festivos }: { festivos: readonly string[] }) {
  const fechas = festivos.map(fechaDiaMes);
  const lista = fechas.length > 1 ? `${fechas.slice(0, -1).join(", ")} y ${fechas.at(-1)}` : fechas[0];
  return (
    <p className="rounded-md border border-amber-300/70 bg-amber-50 px-3 py-2 text-xs text-amber-950 dark:border-amber-700/60 dark:bg-amber-950/30 dark:text-amber-100">
      <strong className="font-semibold">Ojo con el contrato:</strong> la raya cuenta también los festivos, las vacaciones y las
      libranzas. Esos días no se suele planificar, salvo los festivos que se trabajan con algún cliente, así que la barra clara
      puede quedarse antes de la raya sin que falte nada.
      {fechas.length > 0 ? ` En este periodo ${fechas.length === 1 ? "es festivo el" : "son festivos el"} ${lista}.` : ""}
    </p>
  );
}

const COLUMNAS_PERSONA = "grid-cols-[minmax(9rem,13rem)_minmax(10rem,1fr)_repeat(4,minmax(5.5rem,auto))]";
const COLUMNAS_CLIENTE = "grid-cols-[minmax(9rem,13rem)_minmax(10rem,1fr)_repeat(3,minmax(5.5rem,auto))]";

export default async function PaginaHoras({
  params,
  searchParams,
}: {
  params: Promise<{ mes: string }>;
  searchParams: Promise<{ ver?: string; p?: string }>;
}) {
  await requireRol(...ROLES_PLAN_LECTURA);
  const { mes } = await params;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) notFound();
  const { ver, p } = await searchParams;
  const hoy = hoyISO();
  // Por defecto, la semana de hoy si el mes está en curso; si no, el mes entero
  const vista: VistaHoras = (VISTAS_HORAS as readonly string[]).includes(ver ?? "")
    ? (ver as VistaHoras)
    : hoy.slice(0, 7) === mes
      ? "semana"
      : "mes";
  const d = await horasMes(mes);

  const cabecera = (
    <CabeceraMes
      mes={mes}
      nombreMes={nombreMes(mes)}
      ayuda="horas"
      seccion="/horas"
      titulo="Horas"
      descripcion="Contrato, horas planificadas y horas efectivas (las que estuvo conectada de verdad) del equipo y de cada persona. Las efectivas llegan hasta ayer."
    />
  );
  if (!d) {
    return (
      <div className="space-y-6">
        {cabecera}
        <p className="text-sm text-muted-foreground">{nombreMes(mes)} no tiene versión publicada ni borrador: no hay plan del que sacar las horas.</p>
      </div>
    );
  }

  const total = sumarFilas(d.agentes.map((a) => a.dias));
  // Por día, solo los días en que alguien tiene contrato o plan (fuera los fines de semana vacíos)
  const periodos = periodosHoras(vista, d.fechas, d.semanas).filter((x) => vista !== "dia" || resumenHoras(total, x.fechas).conDatos);
  const periodo = periodos.find((x) => x.clave === p) ?? periodoInicial(periodos, hoy);
  const i = periodos.indexOf(periodo);
  const enlace = (v: VistaHoras, clave?: string) => `/planificacion/${mes}/horas?ver=${v}${clave ? `&p=${clave}` : ""}`;

  const equipo = resumenHoras(total, periodo.fechas);
  const personas = d.agentes.map((a) => ({
    a,
    r: resumenHoras(a.dias, periodo.fechas),
    ausencias: vista === "dia" ? (a.dias.find((x) => x.fecha === periodo.clave)?.ausencias ?? []) : [],
  }));
  const clientes = d.clientes
    .map((c) => ({ c, r: resumenHoras(c.dias.map((x) => ({ ...x, contrato: 0 })), periodo.fechas) }))
    .filter((x) => x.r.conDatos);
  const escala = escalaHoras(personas.map((x) => x.r));
  const escalaClientes = escalaHoras(clientes.map((x) => x.r));
  const hastaAyer = equipo.terminado ? "" : " hasta ayer";
  // Festivos del periodo: su parte del contrato cuenta aunque ese día no se planifique (05/11/2026)
  const festivosPeriodo = d.festivos.filter((f) => periodo.fechas.includes(f));
  const etiquetaPeriodo = vista === "dia" && festivosPeriodo.length > 0 ? `${periodo.etiqueta} · festivo` : periodo.etiqueta;

  return (
    <div className="space-y-6">
      {cabecera}

      {/* Periodo: día, semana o mes, y moverse entre ellos */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <nav className="inline-flex gap-1 rounded-lg bg-muted p-1" aria-label="Ver por">
            {VISTAS_HORAS.map((v) => (
              <Link
                key={v}
                href={enlace(v)}
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
          {vista !== "mes" ? (
            <div className="flex items-center gap-1">
              {i > 0 ? (
                <Link
                  href={enlace(vista, periodos[i - 1].clave)}
                  className="rounded-md border p-1.5 hover:bg-accent"
                  aria-label={`${vista === "dia" ? "Día" : "Semana"} anterior`}
                >
                  <ChevronLeft className="size-4" />
                </Link>
              ) : (
                <span className="rounded-md border p-1.5 opacity-40" aria-hidden>
                  <ChevronLeft className="size-4" />
                </span>
              )}
              <span className="min-w-44 text-center text-sm font-medium">{etiquetaPeriodo}</span>
              {i < periodos.length - 1 ? (
                <Link
                  href={enlace(vista, periodos[i + 1].clave)}
                  className="rounded-md border p-1.5 hover:bg-accent"
                  aria-label={`${vista === "dia" ? "Día" : "Semana"} siguiente`}
                >
                  <ChevronRight className="size-4" />
                </Link>
              ) : (
                <span className="rounded-md border p-1.5 opacity-40" aria-hidden>
                  <ChevronRight className="size-4" />
                </span>
              )}
            </div>
          ) : (
            <span className="text-sm font-medium">{nombreMes(mes)}</span>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          Plan v{d.version.numero} {d.version.estado === "publicada" ? "publicada" : "en borrador"} · efectivas hasta el {fechaDiaMes(d.fechaDatos)}
        </p>
      </div>

      {/* Las tres cifras del equipo */}
      <div className="grid gap-4 sm:grid-cols-3">
        <TarjetaKpi
          titulo="Contrato"
          valor={horasLegibles(equipo.contrato)}
          sub={equipo.terminado || !equipo.empezado ? "Lo que pide el contrato de todos" : `${horasLegibles(equipo.contratoHastaAyer)} hasta ayer`}
          ayuda="La parte del contrato semanal de cada persona que toca en esos días, según su turno. Cuenta también los festivos, las vacaciones y las libranzas, aunque esos días no se trabajen."
        />
        <TarjetaKpi
          titulo="Planificadas"
          valor={horasLegibles(equipo.planificadas)}
          sub={equipo.contrato > 0 ? `${pct(equipo.planificadas, equipo.contrato)} del contrato` : undefined}
          ayuda="Las horas del plan del mes (el publicado; si no hay, el borrador). Las vacaciones y libranzas no se planifican."
        />
        <TarjetaKpi
          titulo={`Efectivas${hastaAyer}`}
          valor={equipo.empezado ? horasLegibles(equipo.efectivas) : "—"}
          sub={
            equipo.empezado
              ? `${pct(equipo.efectivas, equipo.planificadasHastaAyer)} de lo planificado${hastaAyer} (${saldoTexto(equipo.diferencia)})`
              : "Este periodo aún no ha empezado"
          }
          ayuda="Las horas que estuvo conectada de verdad, con cualquiera de sus usuarios. Solo de los días que ya han pasado."
        />
      </div>

      {/* Por persona */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Por persona
            <PuntoAyuda id="horas-contrato" />
          </CardTitle>
          <CardDescription>
            La barra clara es lo planificado; la oscura, lo que hizo de verdad; la raya, su contrato.
            {equipo.terminado ? "" : " Las efectivas se comparan con lo planificado hasta ayer."}
          </CardDescription>
          <Leyenda conContrato />
          <NotaContrato festivos={festivosPeriodo} />
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <div className={cn("grid min-w-[44rem] items-center", COLUMNAS_PERSONA)}>
            <div className="border-b px-2 pb-1.5 text-xs font-medium text-muted-foreground">Persona</div>
            <div className="border-b px-2 pb-1.5" />
            <div className="border-b px-2 pb-1.5 text-right text-xs font-medium text-muted-foreground">Contrato</div>
            <div className="border-b px-2 pb-1.5 text-right text-xs font-medium text-muted-foreground">Planificadas</div>
            <div className="border-b px-2 pb-1.5 text-right text-xs font-medium text-muted-foreground">Efectivas{hastaAyer}</div>
            <div className="border-b px-2 pb-1.5 text-right text-xs font-medium text-muted-foreground" title="Efectivas menos lo planificado de los mismos días">
              Efectivas − plan
            </div>
            {personas.map(({ a, r, ausencias }) => {
              const etiqueta = `${a.numero}${a.nombre ? ` ${a.nombre}` : ""}`;
              return (
                <div key={a.numero} className="contents">
                  <div className="truncate border-b px-2 py-1.5 text-sm" title={etiqueta}>
                    {etiqueta}
                    {ausencias.length > 0 ? (
                      <span className="ml-1.5 rounded bg-muted px-1 py-0.5 text-[10px] font-medium text-muted-foreground">{ausencias.join(" ")}</span>
                    ) : null}
                  </div>
                  <div className="border-b px-2 py-1">
                    <BarraHoras r={r} escala={escala} conContrato etiqueta={etiqueta} />
                  </div>
                  <div className="border-b px-2 py-1.5">
                    <Cifra h={r.contrato} className="text-muted-foreground" />
                  </div>
                  <div className="border-b px-2 py-1.5">
                    <Cifra h={r.planificadas} />
                  </div>
                  <div className="border-b px-2 py-1.5">
                    {r.empezado ? <Cifra h={r.efectivas} className="font-medium" /> : <div className="text-right text-sm text-muted-foreground">—</div>}
                  </div>
                  <div className="border-b px-2 py-1.5">
                    <Diferencia r={r} />
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Por cliente */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Por cliente
            <PuntoAyuda id="horas-cliente" />
          </CardTitle>
          <CardDescription>
            Planificadas en cada cliente y efectivas con sus usuarios (GH_…, UGR_…), de toda la empresa, como en Cierre. El contrato
            es de cada persona, no del cliente.
          </CardDescription>
          <Leyenda conContrato={false} />
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {clientes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ningún cliente con horas en este periodo.</p>
          ) : (
            <div className={cn("grid min-w-[38rem] items-center", COLUMNAS_CLIENTE)}>
              <div className="border-b px-2 pb-1.5 text-xs font-medium text-muted-foreground">Cliente</div>
              <div className="border-b px-2 pb-1.5" />
              <div className="border-b px-2 pb-1.5 text-right text-xs font-medium text-muted-foreground">Planificadas</div>
              <div className="border-b px-2 pb-1.5 text-right text-xs font-medium text-muted-foreground">Efectivas{hastaAyer}</div>
              <div className="border-b px-2 pb-1.5 text-right text-xs font-medium text-muted-foreground">Efectivas − plan</div>
              {clientes.map(({ c, r }) => (
                <div key={c.codigo} className="contents">
                  <div className="truncate border-b px-2 py-1.5 text-sm" title={c.nombre}>
                    <span className="mr-1.5 inline-block size-2.5 rounded-sm border border-black/15 align-middle" style={{ backgroundColor: c.color }} aria-hidden />
                    {c.nombre}
                  </div>
                  <div className="border-b px-2 py-1">
                    <BarraHoras r={r} escala={escalaClientes} conContrato={false} etiqueta={c.nombre} />
                  </div>
                  <div className="border-b px-2 py-1.5">
                    <Cifra h={r.planificadas} />
                  </div>
                  <div className="border-b px-2 py-1.5">
                    {r.empezado ? <Cifra h={r.efectivas} className="font-medium" /> : <div className="text-right text-sm text-muted-foreground">—</div>}
                  </div>
                  <div className="border-b px-2 py-1.5">
                    <Diferencia r={r} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
