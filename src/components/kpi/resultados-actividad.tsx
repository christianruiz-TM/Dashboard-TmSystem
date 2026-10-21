"use client";

import { Fragment, useState } from "react";
import { ArrowDown, ArrowUp, ChevronRight, CircleCheck, CircleX, Flag, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
import { GraficaLineas, type ReferenciaLinea } from "@/components/graficas/grafica-lineas";
import { TarjetaKpi } from "@/components/kpi/tarjeta-kpi";
import { Tiempo } from "@/components/kpi/tiempo";
import {
  MIN_FINALIZADOS,
  UMBRAL_DESVIACION_PP,
  type ColorSemaforo,
  type NodoDesglose,
  type RatiosAgenteRes,
  type RatiosResultado,
  type ResultadoResultados,
} from "@/lib/resultados-actividad";
import { cn } from "@/lib/utils";

// ============================================================
// Supervisión → Resultados: aprovechamiento (bruto) y ratio neto de los
// contactos cerrados, por agente, campaña y fecha, con el desglose de la
// tipificación (regla 18), y desde el 21/10/2026 finalizados por éxito,
// llamadas por éxito y finalizados por hora (logada en el agente y el
// total; con el script abierto por campaña). Los cálculos vienen hechos
// (lib/resultados-actividad.ts); aquí solo se ordena y se pinta.
// ============================================================

const DOS: Intl.NumberFormatOptions = { minimumFractionDigits: 2, maximumFractionDigits: 2 };

function pct(v: number | null): string {
  return v == null ? "—" : `${v.toLocaleString("es-ES", DOS)} %`;
}

function pp(v: number | null): string {
  if (v == null) return "—";
  return `${v > 0 ? "+" : ""}${v.toLocaleString("es-ES", DOS)} p.p.`;
}

function entero(v: number): string {
  return v.toLocaleString("es-ES");
}

function num2(v: number | null): string {
  return v == null ? "—" : v.toLocaleString("es-ES", DOS);
}

function fechaCortaSinAnio(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

const TEXTO_SEMAFORO: Record<ColorSemaforo, string> = {
  verde: "Cumple el objetivo",
  ambar: "Cerca del objetivo (a menos del 10 %)",
  rojo: "No llega al objetivo",
};

/** Icono del semáforo, con el texto en el título y para lectores de pantalla. */
function Semaforo({ color, objetivo }: { color: ColorSemaforo | null; objetivo?: string }) {
  if (!color) return null;
  const Icono = color === "verde" ? CircleCheck : color === "ambar" ? TriangleAlert : CircleX;
  const texto = `${TEXTO_SEMAFORO[color]}${objetivo ? ` (${objetivo})` : ""}`;
  return (
    <span
      className={cn(
        "ml-1 inline-flex align-[-2px]",
        color === "verde" && "text-emerald-600",
        color === "ambar" && "text-amber-600",
        color === "rojo" && "text-red-600",
      )}
      title={texto}
    >
      <Icono className="h-3.5 w-3.5" aria-hidden />
      <span className="sr-only">{texto}</span>
    </span>
  );
}

/** Texto visible del semáforo de una tarjeta: «Cumple el objetivo (≥ 30 %)». */
function SemaforoTarjeta({ color, objetivo }: { color: ColorSemaforo | null; objetivo: string | null }) {
  if (!objetivo) return null;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      {color ? <Semaforo color={color} /> : null}
      {color ? TEXTO_SEMAFORO[color] : "Objetivo"} ({objetivo})
    </span>
  );
}

const objMin = (v: number | null | undefined) => (v == null ? null : `≥ ${v.toLocaleString("es-ES")} %`);
const objMax = (v: number | null | undefined) => (v == null ? null : `≤ ${v.toLocaleString("es-ES")} %`);

/** Celdas de ratios comunes a agente, agente×campaña y campaña. */
function CeldasRatios({ r, baseHoras }: { r: RatiosResultado; baseHoras: "logada" | "guion" }) {
  const at = r.muestraPequenia;
  const o = r.objetivo;
  const ayudaHoras = baseHoras === "logada" ? "Horas logadas en el período" : "Horas con el script abierto en la campaña";
  return (
    <>
      <TableCell className="text-right tabular-nums">{entero(r.finalizados)}</TableCell>
      <TableCell className="text-right tabular-nums">{entero(r.exitos)}</TableCell>
      <TableCell className="text-right tabular-nums">
        {r.finalizadosConfigurados > 0 ? entero(r.noValidos) : "—"}
      </TableCell>
      <TableCell className={cn("text-right tabular-nums whitespace-nowrap", at && "text-muted-foreground")}>
        {pct(r.brutoPct)}
        <Semaforo color={r.semaforo.bruto} objetivo={objMin(o?.brutoMin) ?? undefined} />
      </TableCell>
      <TableCell className={cn("text-right tabular-nums whitespace-nowrap", at && "text-muted-foreground")}>
        {pct(r.netoPct)}
        <Semaforo color={r.semaforo.neto} objetivo={objMin(o?.netoMin) ?? undefined} />
      </TableCell>
      <TableCell className={cn("text-right tabular-nums whitespace-nowrap", at && "text-muted-foreground")}>
        {pct(r.noValidosPct)}
        <Semaforo color={r.semaforo.noValidos} objetivo={objMax(o?.maxPctNoValidos) ?? undefined} />
      </TableCell>
      <TableCell className={cn("text-right tabular-nums", at && "text-muted-foreground")}>
        {num2(r.finalizadosPorExito)}
      </TableCell>
      <TableCell className={cn("text-right tabular-nums", at && "text-muted-foreground")}>
        {num2(r.llamadasPorExito)}
      </TableCell>
      <TableCell className="text-right tabular-nums" title={ayudaHoras}>
        {r.horas == null ? "—" : <Tiempo horas={r.horas} />}
      </TableCell>
      <TableCell className={cn("text-right tabular-nums", at && "text-muted-foreground")} title={ayudaHoras}>
        {num2(r.finalizadosHora)}
      </TableCell>
    </>
  );
}

type ClaveOrden =
  | "nombre"
  | "finalizados"
  | "exitos"
  | "noValidos"
  | "brutoPct"
  | "netoPct"
  | "noValidosPct"
  | "finalizadosPorExito"
  | "llamadasPorExito"
  | "horas"
  | "finalizadosHora";

const COLUMNAS: { clave: ClaveOrden; titulo: string; ayuda: string }[] = [
  { clave: "finalizados", titulo: "Finalizados", ayuda: "Contactos cerrados que tipificó el agente" },
  { clave: "exitos", titulo: "Éxitos", ayuda: "Contactos cerrados con éxito" },
  { clave: "noValidos", titulo: "No válidos", ayuda: "Finalizados con un resultado marcado como no válido" },
  { clave: "brutoPct", titulo: "Aprovechamiento (bruto)", ayuda: "Éxitos ÷ finalizados" },
  { clave: "netoPct", titulo: "Ratio neto", ayuda: "Éxitos ÷ (finalizados − no válidos)" },
  { clave: "noValidosPct", titulo: "% no válidos", ayuda: "No válidos ÷ finalizados" },
  {
    clave: "finalizadosPorExito",
    titulo: "Finalizados por éxito",
    ayuda: "Finalizados ÷ éxitos: cuántos contactos se cierran para conseguir un éxito",
  },
  {
    clave: "llamadasPorExito",
    titulo: "Llamadas por éxito",
    ayuda: "Llamadas de media a cada contacto que acabó en éxito (intentos de salida en los 90 días antes de cerrarlo)",
  },
  {
    clave: "horas",
    titulo: "Horas",
    ayuda: "Agente: horas logadas en el período. Detalle por campaña y campañas: horas con el script abierto",
  },
  {
    clave: "finalizadosHora",
    titulo: "Finalizados/h",
    ayuda: "Finalizados por hora (logada en el agente; con script abierto por campaña)",
  },
];

// ------------------------------------------------------------
// Vistas
// ------------------------------------------------------------

function VistaAgentes({ agentes, periodo }: { agentes: RatiosAgenteRes[]; periodo: string }) {
  const [orden, setOrden] = useState<{ clave: ClaveOrden; desc: boolean } | null>(null);
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());

  const lista = orden
    ? [...agentes].sort((a, b) => {
        // La muestra pequeña siempre al final; los «—» detrás de los valores
        if (a.muestraPequenia !== b.muestraPequenia) return a.muestraPequenia ? 1 : -1;
        const va = a[orden.clave];
        const vb = b[orden.clave];
        if (va == null || vb == null) return va == null ? (vb == null ? 0 : 1) : -1;
        const c = typeof va === "string" ? va.localeCompare(String(vb)) : va - Number(vb);
        return orden.desc ? -c : c;
      })
    : agentes; // por defecto: muestra suficiente y más finalizados primero

  const ordenarPor = (clave: ClaveOrden) =>
    setOrden((o) => (o?.clave === clave ? { clave, desc: !o.desc } : { clave, desc: clave !== "nombre" }));

  const alternar = (agente: string) =>
    setAbiertos((s) => {
      const n = new Set(s);
      if (n.has(agente)) n.delete(agente);
      else n.add(agente);
      return n;
    });

  const cabecera = ({ clave, titulo, ayuda }: { clave: ClaveOrden; titulo: string; ayuda: string }) => {
    const activa = orden?.clave === clave || (!orden && clave === "finalizados");
    const desc = orden ? orden.desc : true;
    return (
      <TableHead key={clave} className={cn("whitespace-normal align-bottom", clave !== "nombre" && "text-right")} title={ayuda}>
        <button
          type="button"
          onClick={() => ordenarPor(clave)}
          className={cn(
            "inline-flex items-end gap-1 text-balance hover:text-foreground",
            clave !== "nombre" && "text-right",
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
    <>
      <p className="mb-2 text-xs text-muted-foreground">
        Pulsa en un agente para ver su detalle por campaña. Pulsa en una columna para ordenar.
      </p>
      <Table>
        <TableHeader>
          <TableRow>
            {cabecera({ clave: "nombre", titulo: "Agente", ayuda: "Nombre y usuario de Altitude" })}
            {COLUMNAS.map(cabecera)}
          </TableRow>
        </TableHeader>
        <TableBody>
          {lista.length === 0 ? (
            <TableRow>
              <TableCell colSpan={COLUMNAS.length + 1} className="text-center text-muted-foreground">
                Sin contactos finalizados {periodo}
              </TableCell>
            </TableRow>
          ) : (
            lista.map((a) => {
              const abierto = abiertos.has(a.agente);
              return (
                <Fragment key={a.agente}>
                  <TableRow className="cursor-pointer" onClick={() => alternar(a.agente)} aria-expanded={abierto}>
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
                    <CeldasRatios r={a} baseHoras="logada" />
                  </TableRow>
                  {abierto
                    ? a.campanias.map((c) => (
                        <TableRow key={`${a.agente}|${c.campania}`} className="bg-muted/40 text-xs">
                          <TableCell className="pl-10">{c.campania}</TableCell>
                          <CeldasRatios r={c} baseHoras="guion" />
                        </TableRow>
                      ))
                    : null}
                </Fragment>
              );
            })
          )}
        </TableBody>
      </Table>
    </>
  );
}

function VistaCampanias({ r, periodo }: { r: ResultadoResultados; periodo: string }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Campaña</TableHead>
          <TableHead className="text-right" title="Contactos cerrados en el período">
            Cerrados
          </TableHead>
          <TableHead className="text-right" title="Cerrados sin que ningún agente hablara con ellos">
            Sin tocar
          </TableHead>
          <TableHead className="text-right" title="Listas cerradas en bloque: tipificados hace más de 90 días">
            Cierres admin.
          </TableHead>
          {COLUMNAS.map((c) => (
            <TableHead key={c.clave} className="whitespace-normal text-right align-bottom" title={c.ayuda}>
              {c.titulo}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {r.campanias.length === 0 ? (
          <TableRow>
            <TableCell colSpan={COLUMNAS.length + 4} className="text-center text-muted-foreground">
              Sin contactos cerrados {periodo}
            </TableCell>
          </TableRow>
        ) : (
          r.campanias.map((c) => (
            <TableRow key={c.campania}>
              <TableCell>
                <div className="font-medium">{c.campania}</div>
                <div className="text-xs text-muted-foreground">
                  {c.servicio ?? "Sin servicio"}
                  {c.configurado ? "" : " · sin configurar"}
                  {c.muestraPequenia && c.finalizados > 0 ? " · muestra pequeña" : ""}
                </div>
              </TableCell>
              <TableCell className="text-right tabular-nums">{entero(c.cerrados)}</TableCell>
              <TableCell className="text-right tabular-nums text-muted-foreground">{entero(c.sinTocar)}</TableCell>
              <TableCell className="text-right tabular-nums text-muted-foreground">
                {entero(c.administrativos)}
              </TableCell>
              <CeldasRatios r={c} baseHoras="guion" />
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}

function FilaNodo({ n, nivel, abiertos, alternar, ruta }: {
  n: NodoDesglose;
  nivel: number;
  abiertos: Set<string>;
  alternar: (k: string) => void;
  ruta: string;
}) {
  const clave = `${ruta}/${n.codigo ?? "null"}`;
  const tieneHijos = n.hijos.length > 0;
  const abierto = abiertos.has(clave);
  const todoNoValido = n.contactos > 0 && n.noValidos === n.contactos;
  return (
    <>
      <TableRow
        className={cn(tieneHijos && "cursor-pointer", nivel > 0 && "bg-muted/40 text-xs")}
        onClick={tieneHijos ? () => alternar(clave) : undefined}
        aria-expanded={tieneHijos ? abierto : undefined}
      >
        <TableCell style={{ paddingLeft: `${0.5 + nivel * 1.75}rem` }}>
          <div className="flex items-center gap-1">
            {tieneHijos ? (
              <ChevronRight
                className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", abierto && "rotate-90")}
              />
            ) : (
              <span className="inline-block w-4" />
            )}
            <span className={cn(nivel === 0 && "font-medium")}>{n.nombre}</span>
            {todoNoValido ? (
              <Badge variant="outline" className="ml-1 text-[10px]">
                No válido
              </Badge>
            ) : n.noValidos > 0 ? (
              <Badge variant="outline" className="ml-1 text-[10px]">
                {entero(n.noValidos)} no válidos
              </Badge>
            ) : null}
          </div>
        </TableCell>
        <TableCell className="text-right tabular-nums">{entero(n.contactos)}</TableCell>
        <TableCell className="w-[30%] min-w-32">
          <div className="flex items-center gap-2">
            <div className="h-2 flex-1 rounded-full bg-muted">
              <div
                className="h-2 rounded-full"
                style={{ width: `${Math.min(100, n.pct ?? 0)}%`, background: "var(--chart-1)" }}
              />
            </div>
            <span className="w-16 text-right tabular-nums">{pct(n.pct)}</span>
          </div>
        </TableCell>
        <TableCell className="text-right tabular-nums">{entero(n.exitos)}</TableCell>
      </TableRow>
      {abierto
        ? n.hijos.map((h) => (
            <FilaNodo key={`${clave}/${h.codigo ?? "null"}`} n={h} nivel={nivel + 1} abiertos={abiertos} alternar={alternar} ruta={clave} />
          ))
        : null}
    </>
  );
}

function VistaDesglose({ r }: { r: ResultadoResultados }) {
  const [clave, setClave] = useState(r.desgloses[0]?.clave ?? "");
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());
  const d = r.desgloses.find((x) => x.clave === clave) ?? r.desgloses[0];
  if (!d) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        No hay desglose: ningún servicio del alcance tiene los resultados configurados.
      </p>
    );
  }
  const alternar = (k: string) =>
    setAbiertos((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <label htmlFor="ambito-desglose" className="text-muted-foreground">
          Ver
        </label>
        <select
          id="ambito-desglose"
          value={d.clave}
          onChange={(e) => {
            setClave(e.target.value);
            setAbiertos(new Set());
          }}
          className="h-8 rounded-md border bg-background px-2 text-sm"
        >
          {r.desgloses.map((x) => (
            <option key={x.clave} value={x.clave}>
              {x.clave.startsWith("svc:") ? x.etiqueta : `   ${x.etiqueta}`} ({entero(x.finalizados)})
            </option>
          ))}
        </select>
        <span className="text-xs text-muted-foreground">
          Niveles: {d.niveles.join(" → ")}. Pulsa en un resultado para ver su detalle.
        </span>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{d.niveles[0] ?? "Resultado"}</TableHead>
            <TableHead className="text-right">Finalizados</TableHead>
            <TableHead className="text-right">% sobre {entero(d.finalizados)}</TableHead>
            <TableHead className="text-right">Éxitos</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {d.nodos.map((n) => (
            <FilaNodo key={n.codigo ?? "null"} n={n} nivel={0} abiertos={abiertos} alternar={alternar} ruta={d.clave} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function VistaComparacion({ r }: { r: ResultadoResultados }) {
  const marcados = r.comparaciones.filter((c) => c.marcado).length;
  const [soloMarcados, setSoloMarcados] = useState(marcados > 0);
  const lista = soloMarcados ? r.comparaciones.filter((c) => c.marcado) : r.comparaciones;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Cada agente frente al RESTO de agentes de la misma campaña. Se marca{" "}
          <Flag className="inline h-3 w-3 text-red-600" aria-hidden /> cuando su % de no válidos o
          el de algún resultado se separa {UMBRAL_DESVIACION_PP} puntos o más: puede ser una
          tipificación distinta a la del resto (marcar «no válido» de más sube su ratio neto). Solo
          aparecen agentes y campañas con al menos {MIN_FINALIZADOS} finalizados.
        </p>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={soloMarcados} onChange={(e) => setSoloMarcados(e.target.checked)} />
          Solo marcados ({marcados})
        </label>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Agente</TableHead>
            <TableHead>Campaña</TableHead>
            <TableHead className="text-right">Finalizados</TableHead>
            <TableHead className="text-right" title="% de no válidos del agente / del resto">
              % no válidos
            </TableHead>
            <TableHead className="text-right">Diferencia</TableHead>
            <TableHead className="text-right" title="Aprovechamiento (bruto) del agente / del resto">
              Aprovechamiento
            </TableHead>
            <TableHead className="text-right">Diferencia</TableHead>
            <TableHead title="El resultado (primer nivel) en el que más se separa del resto">
              Resultado más distinto
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lista.length === 0 ? (
            <TableRow>
              <TableCell colSpan={8} className="text-center text-muted-foreground">
                {soloMarcados ? "Ningún agente se separa del resto de su campaña" : "Sin muestra suficiente para comparar"}
              </TableCell>
            </TableRow>
          ) : (
            lista.map((c) => (
              <TableRow key={`${c.agente}|${c.campania}`}>
                <TableCell>
                  <div className="flex items-center gap-1 font-medium">
                    {c.marcado ? <Flag className="h-3.5 w-3.5 text-red-600" aria-label="Marcado" /> : null}
                    {c.nombre}
                  </div>
                  <div className="text-xs text-muted-foreground">{c.agente}</div>
                </TableCell>
                <TableCell>{c.campania}</TableCell>
                <TableCell className="text-right tabular-nums">{entero(c.finalizados)}</TableCell>
                <TableCell className="text-right tabular-nums whitespace-nowrap">
                  {pct(c.noValidosPct)}
                  <span className="text-muted-foreground"> / {pct(c.noValidosRestoPct)}</span>
                </TableCell>
                <TableCell
                  className={cn(
                    "text-right tabular-nums whitespace-nowrap",
                    Math.abs(c.difNoValidosPp ?? 0) >= UMBRAL_DESVIACION_PP && "font-semibold",
                  )}
                >
                  {pp(c.difNoValidosPp)}
                </TableCell>
                <TableCell className="text-right tabular-nums whitespace-nowrap">
                  {pct(c.brutoPct)}
                  <span className="text-muted-foreground"> / {pct(c.brutoRestoPct)}</span>
                </TableCell>
                <TableCell className="text-right tabular-nums whitespace-nowrap">{pp(c.difBrutoPp)}</TableCell>
                <TableCell className="text-sm">
                  {c.resultadoDesviado ? (
                    <>
                      <span className="font-medium">{c.resultadoDesviado.nombre}</span>
                      <span
                        className={cn(
                          "ml-1 tabular-nums",
                          Math.abs(c.resultadoDesviado.difPp) >= UMBRAL_DESVIACION_PP && "font-semibold",
                        )}
                      >
                        {pp(c.resultadoDesviado.difPp)}
                      </span>
                      <div className="text-xs text-muted-foreground">
                        {pct(c.resultadoDesviado.pct)} frente a {pct(c.resultadoDesviado.restoPct)}
                      </div>
                    </>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function VistaEvolucion({ r }: { r: ResultadoResultados }) {
  const semanal = r.serie.granularidad === "semana";
  const datos = r.serie.puntos.map((p) => ({
    periodo: semanal ? `sem. ${fechaCortaSinAnio(p.periodo)}` : fechaCortaSinAnio(p.periodo),
    bruto: p.brutoPct,
    neto: p.netoPct,
    noValidos: p.noValidosPct,
  }));
  const o = r.total.objetivo;
  const referencias: ReferenciaLinea[] = [];
  if (o?.brutoMin != null) referencias.push({ valor: o.brutoMin, etiqueta: `Objetivo aprovechamiento ${o.brutoMin} %`, color: "var(--chart-1)" });
  if (o?.netoMin != null) referencias.push({ valor: o.netoMin, etiqueta: `Objetivo neto ${o.netoMin} %`, color: "var(--chart-3)" });
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {semanal ? "Por semanas (lunes a domingo): el rango pasa de 62 días." : "Por día de cierre."} Los días
        sin cierres quedan en blanco. El neto y el % de no válidos solo cuentan los servicios
        configurados.
      </p>
      <GraficaLineas
        datos={datos}
        ejeX="periodo"
        sufijo=" %"
        referencias={referencias}
        series={[
          { clave: "bruto", nombre: "Aprovechamiento (bruto)", color: "var(--chart-1)" },
          { clave: "neto", nombre: "Ratio neto", color: "var(--chart-3)" },
          { clave: "noValidos", nombre: "% no válidos", color: "var(--chart-4)", discontinua: true },
        ]}
      />
      <details className="text-sm">
        <summary className="cursor-pointer text-muted-foreground">Ver los datos en tabla</summary>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{semanal ? "Semana del" : "Día"}</TableHead>
              <TableHead className="text-right">Finalizados</TableHead>
              <TableHead className="text-right">Éxitos</TableHead>
              <TableHead className="text-right">No válidos</TableHead>
              <TableHead className="text-right">Aprovechamiento</TableHead>
              <TableHead className="text-right">Ratio neto</TableHead>
              <TableHead className="text-right">% no válidos</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {r.serie.puntos.map((p) => (
              <TableRow key={p.periodo}>
                <TableCell>{p.periodo.split("-").reverse().join("/")}</TableCell>
                <TableCell className="text-right tabular-nums">{entero(p.finalizados)}</TableCell>
                <TableCell className="text-right tabular-nums">{entero(p.exitos)}</TableCell>
                <TableCell className="text-right tabular-nums">{entero(p.noValidos)}</TableCell>
                <TableCell className="text-right tabular-nums">{pct(p.brutoPct)}</TableCell>
                <TableCell className="text-right tabular-nums">{pct(p.netoPct)}</TableCell>
                <TableCell className="text-right tabular-nums">{pct(p.noValidosPct)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </details>
    </div>
  );
}

// ------------------------------------------------------------
// Componente principal
// ------------------------------------------------------------

export function ResultadosActividad({ r, periodo }: { r: ResultadoResultados; periodo: string }) {
  const t = r.total;
  const o = t.objetivo;
  const parcial = r.serviciosSinConfigurar.length > 0 && t.finalizadosConfigurados > 0;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        <TarjetaKpi
          titulo="Finalizados"
          valor={entero(t.finalizados)}
          sub={`${entero(t.cerrados)} cerrados · ${entero(t.sinTocar)} sin tocar · ${entero(t.administrativos)} cierres admin.`}
        />
        <TarjetaKpi
          titulo="Aprovechamiento (bruto)"
          valor={pct(t.brutoPct)}
          sub={`${entero(t.exitos)} éxitos de ${entero(t.finalizados)} finalizados`}
          extra={<SemaforoTarjeta color={t.semaforo.bruto} objetivo={objMin(o?.brutoMin)} />}
        />
        <TarjetaKpi
          titulo="Ratio neto"
          valor={pct(t.netoPct)}
          sub={
            t.finalizadosConfigurados === 0
              ? "Sin servicios configurados"
              : `Sin los no válidos${parcial ? " · solo servicios configurados" : ""}`
          }
          extra={<SemaforoTarjeta color={t.semaforo.neto} objetivo={objMin(o?.netoMin)} />}
        />
        <TarjetaKpi
          titulo="% no válidos"
          valor={pct(t.noValidosPct)}
          sub={`${entero(t.noValidos)} contactos no válidos`}
          extra={<SemaforoTarjeta color={t.semaforo.noValidos} objetivo={objMax(o?.maxPctNoValidos)} />}
        />
        <TarjetaKpi
          titulo="Finalizados por éxito"
          valor={num2(t.finalizadosPorExito)}
          sub="Contactos cerrados por cada éxito"
        />
        <TarjetaKpi
          titulo="Llamadas por éxito"
          valor={num2(t.llamadasPorExito)}
          sub="De media, a cada contacto que acabó en éxito"
        />
        <TarjetaKpi
          titulo="Finalizados por hora logada"
          valor={num2(t.finalizadosHora)}
          sub={t.horas == null ? "Sin horas logadas" : `${num2(t.horas)} h logadas`}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Resultados de actividad {periodo}</CardTitle>
          <p className="text-sm text-muted-foreground">
            Contactos cerrados que tipificó un agente, por la fecha de cierre y del agente que lo
            cerró. Aprovechamiento (bruto) = éxitos ÷ finalizados; ratio neto = éxitos ÷
            (finalizados − no válidos). Finalizados por hora: el agente y el total, por hora
            logada; por campaña, por hora con el script abierto. Con menos de {MIN_FINALIZADOS}{" "}
            finalizados los ratios salen en gris: la muestra es pequeña.
          </p>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="agentes">
            <TabsList className="flex-wrap">
              <TabsTrigger value="agentes">Por agente ({r.agentes.length})</TabsTrigger>
              <TabsTrigger value="campanias">Por campaña ({r.campanias.length})</TabsTrigger>
              <TabsTrigger value="desglose">Desglose de resultados</TabsTrigger>
              <TabsTrigger value="comparacion">
                Agente frente a campaña ({r.comparaciones.filter((c) => c.marcado).length})
              </TabsTrigger>
              <TabsTrigger value="evolucion">Evolución</TabsTrigger>
            </TabsList>
            <TabsContent value="agentes">
              <VistaAgentes agentes={r.agentes} periodo={periodo} />
            </TabsContent>
            <TabsContent value="campanias">
              <VistaCampanias r={r} periodo={periodo} />
            </TabsContent>
            <TabsContent value="desglose">
              <VistaDesglose r={r} />
            </TabsContent>
            <TabsContent value="comparacion">
              <VistaComparacion r={r} />
            </TabsContent>
            <TabsContent value="evolucion">
              <VistaEvolucion r={r} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
