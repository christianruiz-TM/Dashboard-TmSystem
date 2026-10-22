"use client";

import { Fragment, useState } from "react";
import { ArrowDown, ArrowUp, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TarjetaKpi } from "@/components/kpi/tarjeta-kpi";
import { Tiempo } from "@/components/kpi/tiempo";
import { horasLegibles, relojDesdeSegundos, segundosLegibles } from "@/lib/fechas";
import {
  MARGEN_INDICE,
  MIN_CONTACTOS_RATIO,
  type RatiosAgente,
  type RatiosBasicos,
  type ResultadoRatios,
} from "@/lib/ratios-exito";
import { cn } from "@/lib/utils";

// ============================================================
// Ratios de rendimiento sobre los éxitos, por agente y por campaña.
// Los mismos en Supervisión «Tiempo real» y en «Histórico» y en Dirección.
// Los cálculos vienen hechos (lib/ratios-exito.ts); aquí solo se ordena y
// se pinta. Las columnas por hora usan la hora LOGADA en lo agrupado (el
// agente, el total) y la hora con el SCRIPT ABIERTO en lo separado por
// campaña (decidido 21/10/2026): la celda dice cuál en su ayuda.
// ============================================================

const DOS: Intl.NumberFormatOptions = { minimumFractionDigits: 2, maximumFractionDigits: 2 };

function pct(v: number | null): string {
  return v == null ? "—" : `${v.toLocaleString("es-ES", DOS)} %`;
}

function num2(v: number | null): string {
  return v == null ? "—" : v.toLocaleString("es-ES", DOS);
}

function entero(v: number): string {
  return v.toLocaleString("es-ES");
}

function colorIndice(indice: number | null, atenuado: boolean): string {
  if (indice == null || atenuado) return "text-muted-foreground";
  if (indice >= 100 + MARGEN_INDICE) return "font-semibold text-emerald-600";
  if (indice <= 100 - MARGEN_INDICE) return "font-semibold text-red-600";
  return "font-semibold";
}

type ClaveOrden =
  | "agente"
  | "contactos"
  | "atendidas"
  | "exitos"
  | "convContactosPct"
  | "convAtendidasPct"
  | "efectividadPct"
  | "horas"
  | "llamadasHora"
  | "exitosHora"
  | "conversacionPorExitoSeg"
  | "gestionPorExitoSeg"
  | "gestionPorNoExitoSeg"
  | "indice";

const COLUMNAS: { clave: ClaveOrden; titulo: string; ayuda: string }[] = [
  { clave: "contactos", titulo: "Contactos", ayuda: "Sesiones de script: contactos gestionados" },
  { clave: "atendidas", titulo: "Llamadas gestionadas", ayuda: "Llamadas que pasaron por el puesto del agente (antes «atendidas»)" },
  { clave: "exitos", titulo: "Éxitos", ayuda: "Sesiones marcadas como Success" },
  { clave: "convContactosPct", titulo: "Conv. contactos", ayuda: "Éxitos ÷ contactos" },
  { clave: "convAtendidasPct", titulo: "% éxito por llamada", ayuda: "Éxitos ÷ llamadas gestionadas" },
  {
    clave: "efectividadPct",
    titulo: "Efect. cierre",
    ayuda: "Éxitos ÷ (éxitos + sin éxito), solo en campañas que marcan «sin éxito»",
  },
  {
    clave: "horas",
    titulo: "Horas",
    ayuda: "Agente: horas logadas. Detalle por campaña y campañas: horas con el script abierto",
  },
  {
    clave: "llamadasHora",
    titulo: "Llamadas/h",
    ayuda: "Llamadas gestionadas por hora (logada en el agente; con script abierto por campaña)",
  },
  {
    clave: "exitosHora",
    titulo: "Éxitos/h",
    ayuda: "Éxitos por hora (logada en el agente; con script abierto por campaña)",
  },
  {
    clave: "conversacionPorExitoSeg",
    titulo: "Conv. por éxito",
    ayuda: "Conversación media de las llamadas gestionadas de cada éxito",
  },
  {
    clave: "gestionPorExitoSeg",
    titulo: "Gestión por éxito",
    ayuda: "Tiempo medio con el script abierto de cada éxito",
  },
  {
    clave: "gestionPorNoExitoSeg",
    titulo: "Gestión sin éxito",
    ayuda: "Tiempo medio con el script abierto de cada sesión que NO acabó en éxito",
  },
  { clave: "indice", titulo: "Índice", ayuda: "Éxitos reales ÷ esperados según sus campañas × 100" },
];

/** Horas de la fila y sus ratios por hora: logadas (agente) o con script abierto (campaña). */
interface PorHora {
  horas: number | null;
  llamadas: number | null;
  exitos: number | null;
  base: "logada" | "guion";
}

function porHoraLogada(a: RatiosAgente): PorHora {
  return { horas: a.horasLogadas, llamadas: a.llamadasHoraLogada, exitos: a.exitosHoraLogada, base: "logada" };
}

function porHoraGuion(r: RatiosBasicos): PorHora {
  return { horas: r.horasGuion, llamadas: r.llamadasHoraGuion, exitos: r.exitosHoraGuion, base: "guion" };
}

/** Celdas de ratios comunes a agente, agente×campaña y campaña (sin índice en campaña). */
function CeldasRatios({
  r,
  hora,
  indice,
  efectividadAyuda,
}: {
  r: RatiosBasicos;
  hora: PorHora;
  /** undefined = sin columna de índice (tabla de campañas). */
  indice?: number | null;
  efectividadAyuda?: string;
}) {
  const at = r.muestraPequenia;
  const ayudaHora = hora.base === "logada" ? "Por hora logada" : "Por hora con el script abierto";
  return (
    <>
      <TableCell className="text-right tabular-nums">{entero(r.contactos)}</TableCell>
      <TableCell className="text-right tabular-nums">{entero(r.atendidas)}</TableCell>
      <TableCell className="text-right tabular-nums text-emerald-700">{entero(r.exitos)}</TableCell>
      <TableCell className={cn("text-right tabular-nums", at && "text-muted-foreground")}>
        {pct(r.convContactosPct)}
      </TableCell>
      <TableCell className={cn("text-right tabular-nums", at && "text-muted-foreground")}>
        {pct(r.convAtendidasPct)}
      </TableCell>
      <TableCell className={cn("text-right tabular-nums", at && "text-muted-foreground")} title={efectividadAyuda}>
        {pct(r.efectividadPct)}
      </TableCell>
      <TableCell
        className="text-right tabular-nums"
        title={hora.base === "logada" ? "Horas logadas" : "Horas con el script abierto"}
      >
        {hora.horas == null ? "—" : <Tiempo horas={hora.horas} />}
      </TableCell>
      <TableCell className={cn("text-right tabular-nums", at && "text-muted-foreground")} title={ayudaHora}>
        {num2(hora.llamadas)}
      </TableCell>
      <TableCell className={cn("text-right tabular-nums", at && "text-muted-foreground")} title={ayudaHora}>
        {num2(hora.exitos)}
      </TableCell>
      <TableCell className={cn("text-right tabular-nums", at && "text-muted-foreground")}>
        <Tiempo segundos={r.conversacionPorExitoSeg} />
      </TableCell>
      <TableCell className={cn("text-right tabular-nums", at && "text-muted-foreground")}>
        <Tiempo segundos={r.gestionPorExitoSeg} />
      </TableCell>
      <TableCell className={cn("text-right tabular-nums", at && "text-muted-foreground")}>
        <Tiempo segundos={r.gestionPorNoExitoSeg} />
      </TableCell>
      {indice === undefined ? null : (
        <TableCell className={cn("text-right tabular-nums", colorIndice(indice, at))}>
          {indice == null ? "—" : Math.round(indice).toLocaleString("es-ES")}
        </TableCell>
      )}
    </>
  );
}

function valorOrden(a: RatiosAgente, clave: ClaveOrden): number | string | null {
  if (clave === "agente") return a.nombre;
  if (clave === "horas") return a.horasLogadas;
  if (clave === "llamadasHora") return a.llamadasHoraLogada;
  if (clave === "exitosHora") return a.exitosHoraLogada;
  return a[clave];
}

/** Variación relativa en % (null sin base), como el resto de tarjetas de Dirección. */
function variacion(actual: number | null, anterior: number | null | undefined): number | null {
  if (actual == null || anterior == null || anterior === 0) return null;
  return ((actual - anterior) / anterior) * 100;
}

export function RatiosExito({
  ratios,
  periodo,
  anterior,
  sinTarjetas = false,
}: {
  ratios: ResultadoRatios;
  periodo: string;
  /** Totales del período comparable anterior (Dirección): pinta la variación. */
  anterior?: ResultadoRatios["total"];
  /** Supervisión: los totales ya están en la cabecera de la pestaña (22/10/2026). */
  sinTarjetas?: boolean;
}) {
  const [orden, setOrden] = useState<{ clave: ClaveOrden; desc: boolean } | null>(null);
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());
  const t = ratios.total;

  const agentes = orden
    ? [...ratios.agentes].sort((a, b) => {
        // La muestra pequeña siempre al final; los «—» detrás de los valores
        if (a.muestraPequenia !== b.muestraPequenia) return a.muestraPequenia ? 1 : -1;
        const va = valorOrden(a, orden.clave);
        const vb = valorOrden(b, orden.clave);
        if (va == null || vb == null) return va == null ? (vb == null ? 0 : 1) : -1;
        const c = typeof va === "string" ? va.localeCompare(String(vb)) : va - Number(vb);
        return orden.desc ? -c : c;
      })
    : ratios.agentes; // por defecto: ranking por índice (lib/ratios-exito.ts)

  const ordenarPor = (clave: ClaveOrden) =>
    setOrden((o) => (o?.clave === clave ? { clave, desc: !o.desc } : { clave, desc: clave !== "agente" }));

  const alternar = (agente: string) =>
    setAbiertos((s) => {
      const n = new Set(s);
      if (n.has(agente)) n.delete(agente);
      else n.add(agente);
      return n;
    });

  const cabecera = ({ clave, titulo, ayuda }: { clave: ClaveOrden; titulo: string; ayuda: string }) => {
    const activa = orden?.clave === clave || (!orden && clave === "indice");
    const desc = orden ? orden.desc : true;
    return (
      <TableHead key={clave} className={cn("whitespace-normal align-bottom", clave !== "agente" && "text-right")} title={ayuda}>
        <button
          type="button"
          onClick={() => ordenarPor(clave)}
          className={cn(
            "inline-flex items-end gap-1 text-balance hover:text-foreground",
            clave !== "agente" && "text-right",
            activa && "text-foreground",
          )}
        >
          {titulo}
          {activa ? desc ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" /> : null}
        </button>
      </TableHead>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Rendimiento por éxitos {periodo}</CardTitle>
        <p className="text-sm text-muted-foreground">
          Éxito = sesión de script marcada como Success, el día de la llamada (los contactos
          cerrados y el aprovechamiento están en Supervisión → Resultados). Por hora: el agente
          y el total, por hora logada; por campaña, por hora con el script abierto. El índice
          compara a cada agente con la media de las campañas en las que ha trabajado (100 = la
          media). Con menos de {MIN_CONTACTOS_RATIO} contactos los ratios salen en gris: la
          muestra es pequeña.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className={cn("grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7", sinTarjetas && "hidden")}>
          <TarjetaKpi
            titulo="Conversión (contactos)"
            valor={pct(t.convContactosPct)}
            variacionPct={variacion(t.convContactosPct, anterior?.convContactosPct)}
            sub={`${entero(t.exitos)} éxitos de ${entero(t.contactos)} contactos`}
          />
          <TarjetaKpi
            titulo="% éxito por llamada"
            valor={pct(t.convAtendidasPct)}
            variacionPct={variacion(t.convAtendidasPct, anterior?.convAtendidasPct)}
            sub={`sobre ${entero(t.atendidas)} llamadas gestionadas`}
          />
          <TarjetaKpi
            titulo="Llamadas por hora logada"
            valor={num2(t.llamadasHoraLogada)}
            variacionPct={variacion(t.llamadasHoraLogada, anterior?.llamadasHoraLogada)}
            sub={`${horasLegibles(t.horasLogadas)} logadas`}
          />
          <TarjetaKpi
            titulo="Éxitos por hora logada"
            valor={num2(t.exitosHoraLogada)}
            variacionPct={variacion(t.exitosHoraLogada, anterior?.exitosHoraLogada)}
            sub={`${horasLegibles(t.horasLogadas)} logadas`}
          />
          <TarjetaKpi
            titulo="Conversación por éxito"
            valor={segundosLegibles(t.conversacionPorExitoSeg)}
            reloj={relojDesdeSegundos(t.conversacionPorExitoSeg)}
            variacionPct={variacion(t.conversacionPorExitoSeg, anterior?.conversacionPorExitoSeg)}
            sub="Llamadas gestionadas de cada éxito"
          />
          <TarjetaKpi
            titulo="Gestión por éxito"
            valor={segundosLegibles(t.gestionPorExitoSeg)}
            reloj={relojDesdeSegundos(t.gestionPorExitoSeg)}
            variacionPct={variacion(t.gestionPorExitoSeg, anterior?.gestionPorExitoSeg)}
            sub="Con el script abierto"
          />
          <TarjetaKpi
            titulo="Gestión sin éxito"
            valor={segundosLegibles(t.gestionPorNoExitoSeg)}
            reloj={relojDesdeSegundos(t.gestionPorNoExitoSeg)}
            variacionPct={variacion(t.gestionPorNoExitoSeg, anterior?.gestionPorNoExitoSeg)}
            sub="Sesiones que no acabaron en éxito"
          />
        </div>

        <Tabs defaultValue="agentes">
          <TabsList>
            <TabsTrigger value="agentes">Por agente ({ratios.agentes.length})</TabsTrigger>
            <TabsTrigger value="campanias">Por campaña ({ratios.campanias.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="agentes">
            <p className="mb-2 text-xs text-muted-foreground">
              Pulsa en un agente para ver su detalle por campaña. Pulsa en una columna para ordenar.
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  {cabecera({ clave: "agente", titulo: "Agente", ayuda: "Nombre y usuario de Altitude" })}
                  {COLUMNAS.map(cabecera)}
                </TableRow>
              </TableHeader>
              <TableBody>
                {agentes.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={COLUMNAS.length + 1} className="text-center text-muted-foreground">
                      Sin contactos gestionados {periodo}
                    </TableCell>
                  </TableRow>
                ) : (
                  agentes.map((a) => {
                    const abierto = abiertos.has(a.agente);
                    return (
                      <Fragment key={a.agente}>
                        <TableRow
                          className="cursor-pointer"
                          onClick={() => alternar(a.agente)}
                          aria-expanded={abierto}
                        >
                          <TableCell>
                            <div className="flex items-start gap-1">
                              <ChevronRight
                                className={cn(
                                  "mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                                  abierto && "rotate-90",
                                )}
                              />
                              <div>
                                <div className="font-medium">{a.nombre}</div>
                                <div className="text-xs text-muted-foreground">
                                  {a.agente}
                                  {a.muestraPequenia ? " · muestra pequeña" : ""}
                                </div>
                              </div>
                            </div>
                          </TableCell>
                          <CeldasRatios r={a} hora={porHoraLogada(a)} indice={a.indice} />
                        </TableRow>
                        {abierto
                          ? a.campanias.map((c) => (
                              <TableRow key={`${a.agente}|${c.campania}`} className="bg-muted/40 text-xs">
                                <TableCell className="pl-10">{c.campania}</TableCell>
                                {/* Por campaña no hay horas logadas (regla 11): script abierto */}
                                <CeldasRatios r={c} hora={porHoraGuion(c)} indice={c.indice} />
                              </TableRow>
                            ))
                          : null}
                      </Fragment>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </TabsContent>

          <TabsContent value="campanias">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campaña</TableHead>
                  {COLUMNAS.filter((c) => c.clave !== "indice").map((c) => (
                    <TableHead key={c.clave} className="whitespace-normal text-right align-bottom" title={c.ayuda}>
                      {c.titulo}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {ratios.campanias.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={COLUMNAS.length} className="text-center text-muted-foreground">
                      Sin contactos gestionados {periodo}
                    </TableCell>
                  </TableRow>
                ) : (
                  ratios.campanias.map((c) => {
                    const at = c.muestraPequenia;
                    return (
                      <TableRow key={c.campania}>
                        <TableCell className="font-medium">
                          {c.campania}
                          {at ? <span className="ml-1 text-xs text-muted-foreground">· muestra pequeña</span> : null}
                        </TableCell>
                        <CeldasRatios
                          r={c}
                          hora={porHoraGuion(c)}
                          efectividadAyuda={c.marcaSinExito ? undefined : "Esta campaña no marca «sin éxito»"}
                        />
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
