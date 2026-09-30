"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Info, OctagonAlert, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  calcularMinimos,
  coberturaBase,
  construirContexto,
  generarFranjas,
  horaCorta,
  horasTexto,
  lunesDe,
  semanasDelMes,
  validarPlan,
  type AgenteMotor,
  type Aviso,
} from "@/lib/planificacion/motor";
import {
  barrasBolsa,
  bloquesPorAgenteDia,
  colorTexto,
  contarGravedades,
  diaCorto,
  fechaDiaMes,
  horasPorAgente,
  horasPorCliente,
  nombreMes,
  posicionPct,
  type BloqueTablero,
  type DatosTablero,
  type VersionTablero,
  type VistaTablero,
} from "@/lib/planificacion/tablero";
import { cn } from "@/lib/utils";
import { BarrasBolsa } from "./barras-bolsa";
import type { ClienteVista } from "./bloque";
import { FilaAgente, type ContextoCeldas, type DiaColumna, type FilaAgenteDatos } from "./fila-agente";
import { LeyendaCobertura, MapaCoberturaDia } from "./mapa-cobertura";
import { PanelIncidencias } from "./panel-incidencias";
import { VistaCliente } from "./vista-cliente";
import { VistaDia } from "./vista-dia";

const NOMBRE_VISTA: Record<VistaTablero, string> = { agente: "Agente", cliente: "Cliente", dia: "Día" };

const ESTADO_VERSION: Record<VersionTablero["estado"], { texto: string; clase: string }> = {
  borrador: { texto: "Borrador (sin publicar)", clase: "bg-amber-100 text-amber-900" },
  publicada: { texto: "Publicada", clase: "bg-emerald-100 text-emerald-900" },
  sustituida: { texto: "Sustituida", clase: "bg-muted text-muted-foreground" },
  descartada: { texto: "Descartada", clase: "bg-muted text-muted-foreground" },
  simulacion: { texto: "Simulación", clase: "bg-sky-100 text-sky-900" },
};

const VACIO: BloqueTablero[] = [];

type AgenteFila = Pick<AgenteMotor, "numero" | "contratoSemanalH" | "turnos" | "ausencias">;

/**
 * Tablero de planificación de un mes, en SOLO LECTURA (F2). Recibe la
 * versión con su foto de entrada y lo recalcula todo en el navegador con las
 * funciones puras del motor: mínimos, cobertura, validaciones, barras. Solo
 * el guardado de F3 volverá al servidor. La vista, la semana y el día viajan
 * en la URL (?vista=&semana=&dia=) sin recargar la página.
 */
export function Tablero({
  datos,
  vistaInicial,
  semanaInicial,
  diaInicial,
  acciones,
}: {
  datos: DatosTablero;
  vistaInicial: VistaTablero;
  semanaInicial: string;
  diaInicial: string;
  /** Botones de supervisión (Generar...). Vacío en lectura. */
  acciones?: React.ReactNode;
}) {
  const { entrada, bloques, nombres, version } = datos;
  const base = entrada.clienteBase;
  const paso = entrada.pasoMin;

  const [vista, setVista] = useState<VistaTablero>(vistaInicial);
  const [semana, setSemana] = useState(semanaInicial);
  const [dia, setDia] = useState(diaInicial);
  const [resaltado, setResaltado] = useState<string | null>(null);

  // ---------- Derivados de la entrada (no cambian al navegar) ----------
  const franjas = useMemo(() => generarFranjas(entrada.inicioDiaMin, entrada.finDiaMin, paso), [entrada, paso]);
  const semanas = useMemo(() => semanasDelMes(entrada.dias), [entrada]);
  const semanaDe = useMemo(() => Object.fromEntries(entrada.dias.map((d) => [d.fecha, d.lunes])), [entrada]);
  const clientes = useMemo(
    () =>
      new Map<string, ClienteVista>(
        entrada.clientes.map((c) => [c.codigo, { codigo: c.codigo, nombre: c.nombre, color: c.color, texto: colorTexto(c.color) }]),
      ),
    [entrada],
  );
  const contexto = useMemo(() => construirContexto(entrada, calcularMinimos(entrada)), [entrada]);
  const diasColumna = useMemo<DiaColumna[]>(
    () =>
      entrada.dias.map((d) => ({
        fecha: d.fecha,
        diaSemana: d.diaSemana,
        laborable: d.laborable,
        festivo: contexto.festivos.has(d.fecha),
      })),
    [entrada, contexto],
  );
  const ctxCeldas = useMemo<ContextoCeldas>(
    () => ({
      clientes,
      clienteBase: base,
      inicioDiaMin: entrada.inicioDiaMin,
      finDiaMin: entrada.finDiaMin,
      nFranjas: franjas.length,
      tiposAusencia: datos.tiposAusencia,
    }),
    [clientes, base, entrada, franjas, datos.tiposAusencia],
  );

  // ---------- Derivados del plan (en F3 cambiarán al editar) ----------
  const incidencias = useMemo(() => validarPlan(bloques, contexto), [bloques, contexto]);
  const cobertura = useMemo(() => coberturaBase(bloques, contexto), [bloques, contexto]);
  const porAgenteDia = useMemo(() => bloquesPorAgenteDia(bloques), [bloques]);
  const horasCliente = useMemo(() => horasPorCliente(bloques, semanaDe), [bloques, semanaDe]);
  const horasAgentes = useMemo(() => horasPorAgente(bloques, semanaDe), [bloques, semanaDe]);
  const barras = useMemo(
    () => barrasBolsa(entrada.clientes, horasCliente, entrada.objetivos, entrada.bolsas),
    [entrada, horasCliente],
  );
  const planificadoH = useMemo(() => bloques.reduce((a, b) => a + (b.finMin - b.inicioMin) / 60, 0), [bloques]);
  const recuento = useMemo(
    () => contarGravedades([...incidencias, ...datos.avisosGeneracion]),
    [incidencias, datos.avisosGeneracion],
  );
  const incidenciasAgente = useMemo(() => {
    const mapa = new Map<string, { duras: number; blandas: number }>();
    for (const a of incidencias) {
      if (!a.agente || !a.fecha) continue;
      const k = `${a.agente}|${semanaDe[a.fecha] ?? lunesDe(a.fecha)}`;
      const r = mapa.get(k) ?? { duras: 0, blandas: 0 };
      if (a.gravedad === "dura") r.duras++;
      else if (a.gravedad === "blanda") r.blandas++;
      mapa.set(k, r);
    }
    return mapa;
  }, [incidencias, semanaDe]);

  // Agentes con fila: los que el motor planificó y cualquiera con bloques
  const agentes = useMemo(() => {
    const activos = new Set(datos.activos);
    const conBloques = new Set(bloques.map((b) => b.agenteNumero));
    const deEntrada: AgenteFila[] = entrada.agentes.filter((a) => activos.has(a.numero) || conBloques.has(a.numero));
    // Con bloques pero fuera de la foto (p. ej. un fijado de alguien que ya no está en plantilla)
    const extra: AgenteFila[] = [...conBloques]
      .filter((n) => !entrada.agentes.some((a) => a.numero === n))
      .map((numero) => ({ numero, contratoSemanalH: null, turnos: {}, ausencias: [] }));
    return [...deEntrada, ...extra].sort((a, b) => a.numero.localeCompare(b.numero));
  }, [datos.activos, bloques, entrada]);
  const noPlanificados = useMemo(() => {
    const conFila = new Set(agentes.map((a) => a.numero));
    return entrada.agentes
      .filter((a) => !conFila.has(a.numero))
      .map((a) => ({
        numero: a.numero,
        // Los mensajes del motor empiezan por el nº («0950: sin sesiones...»)
        motivo:
          datos.avisosGeneracion
            .find((x) => x.agente === a.numero)
            ?.mensaje.replace(`${a.numero}: `, "") ?? "sin bloques este mes",
      }));
  }, [agentes, entrada, datos.avisosGeneracion]);

  // ---------- Lo visible ----------
  // Días que se pintan: de lunes a viernes, y el fin de semana solo si hay turno o bloques
  const diaVisible = useCallback(
    (d: DiaColumna) =>
      d.diaSemana < 5 || bloques.some((b) => b.fecha === d.fecha) || agentes.some((a) => (a.turnos[d.fecha] ?? []).length > 0),
    [bloques, agentes],
  );
  // Semanas con algún día que pintar (en noviembre, la del 26/10 solo trae el domingo 01/11)
  const semanasNav = useMemo(() => {
    const conDia = new Set(diasColumna.filter(diaVisible).map((d) => semanaDe[d.fecha]));
    const lista = semanas.filter((s) => conDia.has(s.lunes));
    return lista.length > 0 ? lista : semanas;
  }, [semanas, diasColumna, diaVisible, semanaDe]);
  const semanaActual = semanasNav.find((s) => s.lunes === semana) ?? semanasNav[0];
  const diasSemana = useMemo(
    () => diasColumna.filter((d) => semanaDe[d.fecha] === semanaActual.lunes && diaVisible(d)),
    [diasColumna, semanaDe, semanaActual, diaVisible],
  );
  const diaActual = diasColumna.find((d) => d.fecha === dia) ?? diasSemana[0] ?? diasColumna[0];

  const construirFilas = useCallback(
    (dias: readonly DiaColumna[]): FilaAgenteDatos[] =>
      agentes.map((a) => {
        const bloquesDia: Record<string, BloqueTablero[]> = {};
        const turnos: FilaAgenteDatos["turnos"] = {};
        const ausencias: FilaAgenteDatos["ausencias"] = {};
        for (const d of dias) {
          bloquesDia[d.fecha] = porAgenteDia.get(`${a.numero}|${d.fecha}`) ?? VACIO;
          turnos[d.fecha] = d.festivo ? [] : (a.turnos[d.fecha] ?? []);
          ausencias[d.fecha] = a.ausencias.filter((x) => x.fecha === d.fecha);
        }
        const lunes = semanaDe[dias[0]?.fecha] ?? "";
        const incid = incidenciasAgente.get(`${a.numero}|${lunes}`);
        return {
          numero: a.numero,
          nombre: nombres[a.numero] ?? "",
          contratoSemanalH: a.contratoSemanalH,
          horasSemana: horasAgentes.semana.get(`${a.numero}|${lunes}`) ?? 0,
          horasMes: horasAgentes.mes.get(a.numero) ?? 0,
          bloques: bloquesDia,
          turnos,
          ausencias,
          duras: incid?.duras ?? 0,
          blandas: incid?.blandas ?? 0,
        };
      }),
    [agentes, porAgenteDia, semanaDe, incidenciasAgente, nombres, horasAgentes],
  );
  const filasSemana = useMemo(() => construirFilas(diasSemana), [construirFilas, diasSemana]);
  const filasDia = useMemo(() => (diaActual ? construirFilas([diaActual]) : []), [construirFilas, diaActual]);

  // ---------- URL: vista, semana y día sin recargar ----------
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    p.set("vista", vista);
    p.set("semana", vista === "dia" && diaActual ? semanaDe[diaActual.fecha] : semanaActual.lunes);
    if (vista === "dia" && diaActual) p.set("dia", diaActual.fecha);
    else p.delete("dia");
    window.history.replaceState(null, "", `${window.location.pathname}?${p.toString()}`);
  }, [vista, semanaActual, diaActual, semanaDe]);

  useEffect(() => {
    if (resaltado) document.getElementById(`fila-${resaltado}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [resaltado, semana, vista]);

  // ---------- Navegación ----------
  const iSemana = semanasNav.findIndex((s) => s.lunes === semanaActual.lunes);
  const irSemana = (delta: number) => {
    const s = semanasNav[iSemana + delta];
    if (s) setSemana(s.lunes);
  };
  const laborables = diasColumna.filter((d) => d.laborable || bloques.some((b) => b.fecha === d.fecha));
  const iDia = laborables.findIndex((d) => d.fecha === diaActual?.fecha);
  const irDia = (fecha: string) => {
    setDia(fecha);
    setSemana(semanaDe[fecha]);
  };
  const irAviso = useCallback(
    (a: Aviso) => {
      if (a.fecha) {
        const lunes = semanaDe[a.fecha] ?? lunesDe(a.fecha);
        if (semanas.some((s) => s.lunes === lunes)) setSemana(lunes);
        if (semanaDe[a.fecha]) setDia(a.fecha);
      }
      if (a.agente) {
        setVista((v) => (v === "cliente" ? "agente" : v));
        setResaltado(a.agente);
      }
    },
    [semanaDe, semanas],
  );

  const estado = ESTADO_VERSION[version.estado];
  const vigente = datos.versiones.find((v) => v.estado === "borrador") ?? datos.versiones.find((v) => v.estado === "publicada");
  const ticks = franjas.filter((f) => (f - entrada.inicioDiaMin) % 240 === 0);

  return (
    <TooltipProvider delay={150}>
      <div className="space-y-4">
        {/* Cabecera */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="text-sm text-muted-foreground">
              <Link href="/planificacion" className="hover:underline">
                Planificación
              </Link>{" "}
              /
            </div>
            <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold">
              {nombreMes(version.mes)}
              <Badge className={estado.clase}>
                {estado.texto} · v{version.numero}
              </Badge>
            </h1>
            <p className="text-xs text-muted-foreground">
              Generada el {version.creadaAt} por {version.creadaPor ?? "—"} con datos hasta el{" "}
              {fechaDiaMes(entrada.fechaDatos)}/{entrada.fechaDatos.slice(0, 4)} · {horasTexto(planificadoH)} planificadas
              {datos.capacidadH != null ? ` de ${horasTexto(datos.capacidadH)} de capacidad` : ""} · {bloques.length} bloques
            </p>
            {datos.versiones.length > 1 ? (
              <p className="text-xs text-muted-foreground">
                Versiones:{" "}
                {datos.versiones.map((v, i) => (
                  <span key={v.id}>
                    {i > 0 ? " · " : ""}
                    {v.id === version.id ? (
                      <span className="font-medium text-foreground">v{v.numero}</span>
                    ) : (
                      <Link href={`/planificacion/${version.mes}?version=${v.id}`} className="underline">
                        v{v.numero}
                      </Link>
                    )}{" "}
                    ({v.estado === "simulacion" ? "simulación" : v.estado})
                  </span>
                ))}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-start gap-2">{acciones}</div>
        </div>

        {vigente && vigente.id !== version.id ? (
          <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Estás viendo una versión {estado.texto.toLowerCase()}. La vigente es la{" "}
            <Link href={`/planificacion/${version.mes}`} className="font-medium underline">
              v{vigente.numero}
            </Link>
            .
          </div>
        ) : null}

        {/* Controles */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex gap-1 rounded-lg bg-muted p-1" role="tablist" aria-label="Vista del tablero">
            {(Object.keys(NOMBRE_VISTA) as VistaTablero[]).map((v) => (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={vista === v}
                onClick={() => setVista(v)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  vista === v ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {NOMBRE_VISTA[v]}
              </button>
            ))}
          </div>

          {vista === "dia" && diaActual ? (
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon-sm"
                aria-label="Día anterior"
                disabled={iDia <= 0}
                onClick={() => irDia(laborables[iDia - 1].fecha)}
              >
                <ChevronLeft />
              </Button>
              <span className="min-w-44 text-center text-sm font-medium">
                {diaCorto(diaActual.diaSemana)} {fechaDiaMes(diaActual.fecha)} · semana {semanas.find((s) => s.lunes === semanaDe[diaActual.fecha])?.rotacion}
                {diaActual.festivo ? " · festivo" : ""}
              </span>
              <Button
                variant="outline"
                size="icon-sm"
                aria-label="Día siguiente"
                disabled={iDia < 0 || iDia >= laborables.length - 1}
                onClick={() => irDia(laborables[iDia + 1].fecha)}
              >
                <ChevronRight />
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon-sm" aria-label="Semana anterior" disabled={iSemana <= 0} onClick={() => irSemana(-1)}>
                <ChevronLeft />
              </Button>
              <span className="min-w-44 text-center text-sm font-medium">
                Semana {fechaDiaMes(semanaActual.fechas[0])}–{fechaDiaMes(semanaActual.fechas[semanaActual.fechas.length - 1])} ·{" "}
                {semanaActual.rotacion}
              </span>
              <Button
                variant="outline"
                size="icon-sm"
                aria-label="Semana siguiente"
                disabled={iSemana >= semanasNav.length - 1}
                onClick={() => irSemana(1)}
              >
                <ChevronRight />
              </Button>
            </div>
          )}

          <a href="#incidencias" className="flex items-center gap-3 text-sm hover:underline">
            <span className="inline-flex items-center gap-1">
              <OctagonAlert className="size-4 text-destructive" /> {recuento.dura} duras
            </span>
            <span className="inline-flex items-center gap-1">
              <TriangleAlert className="size-4 text-amber-600" /> {recuento.blanda} blandas
            </span>
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <Info className="size-4" /> {recuento.info}
            </span>
          </a>
        </div>

        {/* Bolsas y objetivos del mes */}
        <Card size="sm">
          <CardHeader>
            <CardTitle className="text-sm">Horas del mes frente a bolsas y objetivos</CardTitle>
          </CardHeader>
          <CardContent>
            <BarrasBolsa barras={barras} clientes={clientes} semanas={semanas} horasCliente={horasCliente} />
          </CardContent>
        </Card>

        {/* Vista */}
        {vista === "agente" ? (
          <div className="overflow-x-auto rounded-lg border bg-card">
            <div
              className="grid min-w-[900px]"
              style={{ gridTemplateColumns: `12rem repeat(${diasSemana.length}, minmax(0, 1fr))` }}
            >
              <div className="sticky left-0 z-10 bg-card px-2 py-1 text-xs font-medium text-muted-foreground">Agente</div>
              {diasSemana.map((d) => (
                <div key={d.fecha} className="border-l px-1 pt-1">
                  <button
                    type="button"
                    className="text-xs font-medium hover:underline"
                    onClick={() => {
                      setDia(d.fecha);
                      setVista("dia");
                    }}
                    title="Ver el día"
                  >
                    {diaCorto(d.diaSemana)} {fechaDiaMes(d.fecha)}
                  </button>
                  {d.festivo ? <span className="ml-1 text-[10px] text-muted-foreground">festivo</span> : null}
                  <div className="relative h-3 text-[9px] text-muted-foreground" aria-hidden>
                    {ticks.map((f) => (
                      <span
                        key={f}
                        className="absolute"
                        style={{ left: `${posicionPct(f, f + paso, entrada.inicioDiaMin, entrada.finDiaMin).left}%` }}
                      >
                        {horaCorta(f)}
                      </span>
                    ))}
                    <span className="absolute right-0">{horaCorta(entrada.finDiaMin)}</span>
                  </div>
                </div>
              ))}

              <div className="sticky left-0 z-10 flex items-center border-t border-r bg-card px-2 text-xs font-medium">
                {base} / mínimo
              </div>
              {diasSemana.map((d) => (
                <MapaCoberturaDia
                  key={d.fecha}
                  fecha={d.fecha}
                  diaSemana={d.diaSemana}
                  franjas={franjas}
                  pasoMin={paso}
                  cobertura={cobertura[d.fecha]}
                  minimos={contexto.minimos[d.fecha]}
                  clienteBase={base}
                />
              ))}

              {filasSemana.map((f) => (
                <FilaAgente key={f.numero} fila={f} dias={diasSemana} ctx={ctxCeldas} resaltado={resaltado === f.numero} />
              ))}
            </div>
          </div>
        ) : vista === "cliente" ? (
          <VistaCliente
            clientes={entrada.clientes.map((c) => ({ ...clientes.get(c.codigo)!, modo: c.modo }))}
            dias={diasSemana}
            franjas={franjas}
            pasoMin={paso}
            clienteBase={base}
            bloques={bloques}
            cobertura={cobertura}
            minimos={contexto.minimos}
            nombres={nombres}
          />
        ) : diaActual ? (
          <VistaDia
            dia={diaActual}
            filas={filasDia}
            franjas={franjas}
            pasoMin={paso}
            clienteBase={base}
            cobertura={cobertura[diaActual.fecha]}
            minimos={contexto.minimos[diaActual.fecha]}
            ctx={ctxCeldas}
            resaltado={resaltado}
          />
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <LeyendaCobertura clienteBase={base} />
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-2.5 w-5 rounded-sm bg-muted-foreground/15" aria-hidden /> turno sin bloque
            </span>
            {[...clientes.values()].map((c) => (
              <span key={c.codigo} className="inline-flex items-center gap-1">
                <span
                  className="inline-block h-2.5 w-5 rounded-sm border border-black/15"
                  style={{ backgroundColor: c.color }}
                  aria-hidden
                />
                {c.codigo}
              </span>
            ))}
          </div>
        </div>

        {noPlanificados.length > 0 ? (
          <Card size="sm">
            <CardHeader>
              <CardTitle className="text-sm">Sin planificar este mes</CardTitle>
              <CardDescription>Agentes de la plantilla que el motor dejó fuera.</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-0.5 text-xs text-muted-foreground">
                {noPlanificados.map((a) => (
                  <li key={a.numero}>
                    <span className="font-medium text-foreground">
                      {a.numero} {nombres[a.numero] ?? ""}
                    </span>
                    : {a.motivo}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : null}

        <PanelIncidencias
          incidencias={incidencias}
          avisosGeneracion={datos.avisosGeneracion}
          nombres={nombres}
          onIr={irAviso}
        />
      </div>
    </TooltipProvider>
  );
}
