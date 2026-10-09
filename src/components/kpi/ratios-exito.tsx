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
import { horasLegibles, segundosLegibles } from "@/lib/fechas";
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
// Los mismos en Supervisión «Tiempo real» y en «Histórico». Los cálculos
// vienen hechos (lib/ratios-exito.ts); aquí solo se ordena y se pinta.
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
  | "exitosHoraLogada"
  | "exitosHoraProductiva"
  | "segPorExito"
  | "indice";

const COLUMNAS: { clave: ClaveOrden; titulo: string; ayuda: string }[] = [
  { clave: "contactos", titulo: "Contactos", ayuda: "Sesiones de script: contactos gestionados" },
  { clave: "atendidas", titulo: "Atendidas", ayuda: "Llamadas atendidas" },
  { clave: "exitos", titulo: "Éxitos", ayuda: "Sesiones marcadas como Success" },
  { clave: "convContactosPct", titulo: "Conv. contactos", ayuda: "Éxitos ÷ contactos" },
  { clave: "convAtendidasPct", titulo: "Conv. atendidas", ayuda: "Éxitos ÷ atendidas" },
  {
    clave: "efectividadPct",
    titulo: "Efect. cierre",
    ayuda: "Éxitos ÷ (éxitos + sin éxito), solo en campañas que marcan «sin éxito»",
  },
  { clave: "exitosHoraLogada", titulo: "Éx./h logada", ayuda: "Éxitos por hora logada" },
  { clave: "exitosHoraProductiva", titulo: "Éx./h productiva", ayuda: "Éxitos por hora de gestión" },
  { clave: "segPorExito", titulo: "Tiempo por éxito", ayuda: "Gestión de las atendidas ÷ éxitos" },
  { clave: "indice", titulo: "Índice", ayuda: "Éxitos reales ÷ esperados según sus campañas × 100" },
];

/** Celdas de ratios comunes a agente, agente×campaña y campaña. */
function CeldasRatios({
  r,
  exitosHoraLogada,
  indice,
}: {
  r: RatiosBasicos;
  exitosHoraLogada: number | null | undefined;
  indice: number | null | undefined;
}) {
  const at = r.muestraPequenia;
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
      <TableCell className={cn("text-right tabular-nums", at && "text-muted-foreground")}>
        {pct(r.efectividadPct)}
      </TableCell>
      <TableCell className={cn("text-right tabular-nums", at && "text-muted-foreground")}>
        {exitosHoraLogada === undefined ? "—" : num2(exitosHoraLogada)}
      </TableCell>
      <TableCell className={cn("text-right tabular-nums", at && "text-muted-foreground")}>
        {num2(r.exitosHoraProductiva)}
      </TableCell>
      <TableCell className={cn("text-right tabular-nums", at && "text-muted-foreground")}>
        {segundosLegibles(r.segPorExito)}
      </TableCell>
      <TableCell className={cn("text-right tabular-nums", colorIndice(indice ?? null, at))}>
        {indice == null ? "—" : Math.round(indice).toLocaleString("es-ES")}
      </TableCell>
    </>
  );
}

function valorOrden(a: RatiosAgente, clave: ClaveOrden): number | string | null {
  return clave === "agente" ? a.nombre : a[clave];
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
}: {
  ratios: ResultadoRatios;
  periodo: string;
  /** Totales del período comparable anterior (Dirección): pinta la variación. */
  anterior?: ResultadoRatios["total"];
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
      <TableHead key={clave} className={cn(clave !== "agente" && "text-right")} title={ayuda}>
        <button
          type="button"
          onClick={() => ordenarPor(clave)}
          className={cn(
            "inline-flex items-center gap-1 whitespace-nowrap hover:text-foreground",
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
          Éxito = sesión de script marcada como Success. El índice compara a cada agente con la
          media de las campañas en las que ha trabajado (100 = la media). Con menos de{" "}
          {MIN_CONTACTOS_RATIO} contactos los ratios salen en gris: la muestra es pequeña.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <TarjetaKpi
            titulo="Conversión (contactos)"
            valor={pct(t.convContactosPct)}
            variacionPct={variacion(t.convContactosPct, anterior?.convContactosPct)}
            sub={`${entero(t.exitos)} éxitos de ${entero(t.contactos)} contactos`}
          />
          <TarjetaKpi
            titulo="Conversión (atendidas)"
            valor={pct(t.convAtendidasPct)}
            variacionPct={variacion(t.convAtendidasPct, anterior?.convAtendidasPct)}
            sub={`sobre ${entero(t.atendidas)} atendidas`}
          />
          <TarjetaKpi
            titulo="Éxitos por hora logada"
            valor={num2(t.exitosHoraLogada)}
            variacionPct={variacion(t.exitosHoraLogada, anterior?.exitosHoraLogada)}
            sub={`${horasLegibles(t.horasLogadas)} logadas`}
          />
          <TarjetaKpi
            titulo="Éxitos por hora productiva"
            valor={num2(t.exitosHoraProductiva)}
            variacionPct={variacion(t.exitosHoraProductiva, anterior?.exitosHoraProductiva)}
            sub={`Tiempo por éxito: ${segundosLegibles(t.segPorExito)}`}
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
                          <CeldasRatios r={a} exitosHoraLogada={a.exitosHoraLogada} indice={a.indice} />
                        </TableRow>
                        {abierto
                          ? a.campanias.map((c) => (
                              <TableRow key={`${a.agente}|${c.campania}`} className="bg-muted/40 text-xs">
                                <TableCell className="pl-10">{c.campania}</TableCell>
                                {/* Por campaña no hay horas logadas (regla 11) */}
                                <CeldasRatios r={c} exitosHoraLogada={undefined} indice={c.indice} />
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
                  {COLUMNAS.filter((c) => c.clave !== "exitosHoraLogada" && c.clave !== "indice").map((c) => (
                    <TableHead key={c.clave} className="text-right" title={c.ayuda}>
                      {c.titulo}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {ratios.campanias.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground">
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
                        <TableCell className="text-right tabular-nums">{entero(c.contactos)}</TableCell>
                        <TableCell className="text-right tabular-nums">{entero(c.atendidas)}</TableCell>
                        <TableCell className="text-right tabular-nums text-emerald-700">{entero(c.exitos)}</TableCell>
                        <TableCell className={cn("text-right tabular-nums", at && "text-muted-foreground")}>
                          {pct(c.convContactosPct)}
                        </TableCell>
                        <TableCell className={cn("text-right tabular-nums", at && "text-muted-foreground")}>
                          {pct(c.convAtendidasPct)}
                        </TableCell>
                        <TableCell
                          className={cn("text-right tabular-nums", at && "text-muted-foreground")}
                          title={c.marcaSinExito ? undefined : "Esta campaña no marca «sin éxito»"}
                        >
                          {pct(c.efectividadPct)}
                        </TableCell>
                        <TableCell className={cn("text-right tabular-nums", at && "text-muted-foreground")}>
                          {num2(c.exitosHoraProductiva)}
                        </TableCell>
                        <TableCell className={cn("text-right tabular-nums", at && "text-muted-foreground")}>
                          {segundosLegibles(c.segPorExito)}
                        </TableCell>
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
