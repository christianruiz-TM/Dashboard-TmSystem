"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TarjetaKpi } from "@/components/kpi/tarjeta-kpi";
import { Tiempo } from "@/components/kpi/tiempo";
import { horasLegibles, segundosLegibles } from "@/lib/fechas";
import { ayudaDe } from "@/lib/glosario";
import type { FilaSalientes, ResultadoSalientes } from "@/lib/salientes";
import { cn } from "@/lib/utils";

// ============================================================
// Salientes (22/10/2026, pedido por Christian): ocupación, contactabilidad
// por franja, contactos alcanzados, rellamadas, conversión por intento,
// tiempo esperando llamada y preparación, global, por campaña y por agente.
// En Supervisión (Tiempo real e Histórico) y en Dirección. Los cálculos
// vienen hechos (lib/salientes.ts); aquí solo se pinta.
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

/** Minutos → «8 h 14 min», «1 d 3 h» o «23 min»: es un dato aproximado, sin segundos. */
function minutos(v: number | null): string {
  if (v == null) return "—";
  const m = Math.round(v);
  if (m >= 24 * 60) return `${Math.floor(m / 1440)} d ${Math.floor((m % 1440) / 60)} h`;
  if (m >= 60) return `${Math.floor(m / 60)} h ${m % 60} min`;
  return `${m} min`;
}

function hora(h: number): string {
  return `${String(h).padStart(2, "0")}-${String(h + 1).padStart(2, "0")} h`;
}

const ETIQUETAS_INTENTO = ["Sin llamada", "1.º", "2.º", "3.º", "4.º", "5.º o más"];

/** Columnas comunes de las tablas por campaña y por agente. */
const COLUMNAS: { titulo: string; ayuda: string; celda: (f: FilaSalientes) => React.ReactNode }[] = [
  { titulo: "Intentos", ayuda: "Intentos de llamada con número", celda: (f) => entero(f.intentos) },
  { titulo: "Contactabilidad", ayuda: ayudaDe("contactabilidadFranja") ?? "", celda: (f) => pct(f.contactabilidadPct) },
  {
    titulo: "Mejor franja",
    ayuda: "La hora con más % contestado (con al menos 20 intentos)",
    celda: (f) => (f.mejorFranja ? `${hora(f.mejorFranja.hora)} · ${pct(f.mejorFranja.pct)}` : "—"),
  },
  { titulo: "Contactos", ayuda: "Contactos llamados en el período", celda: (f) => entero(f.contactos) },
  { titulo: "Alcanzados", ayuda: ayudaDe("contactosAlcanzados") ?? "", celda: (f) => pct(f.alcanzadosPct) },
  { titulo: "Intentos hasta hablar", ayuda: ayudaDe("contactosAlcanzados") ?? "", celda: (f) => num2(f.intentosHastaHablar) },
  { titulo: "Rellamadas agendadas", ayuda: ayudaDe("rellamadas") ?? "", celda: (f) => entero(f.agendadas) },
  { titulo: "Hechas", ayuda: ayudaDe("rellamadas") ?? "", celda: (f) => pct(f.hechasPct) },
  { titulo: "Vencidas ahora", ayuda: ayudaDe("rellamadas") ?? "", celda: (f) => entero(f.vencidas) },
  { titulo: "Retraso (aprox.)", ayuda: ayudaDe("rellamadas") ?? "", celda: (f) => minutos(f.retrasoMedioMin) },
  { titulo: "Éxito al 1.er intento", ayuda: ayudaDe("conversionIntento") ?? "", celda: (f) => pct(f.exitoPrimerIntentoPct) },
  { titulo: "Intentos hasta el éxito", ayuda: ayudaDe("conversionIntento") ?? "", celda: (f) => num2(f.intentosMediosHastaExito) },
  {
    titulo: "Preparación",
    ayuda: ayudaDe("preparacion") ?? "",
    celda: (f) => (f.preparaciones > 0 ? <Tiempo segundos={f.preparacionSeg} acumulado /> : "—"),
  },
];

function TablaSalientes({
  filas,
  primera,
  extras,
  vacio,
}: {
  filas: FilaSalientes[];
  primera: string;
  extras: { titulo: string; ayuda: string; celda: (f: FilaSalientes) => React.ReactNode }[];
  vacio: string;
}) {
  const columnas = [...extras, ...COLUMNAS];
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="align-bottom">{primera}</TableHead>
          {columnas.map((c) => (
            <TableHead key={c.titulo} className="whitespace-normal text-right align-bottom" title={c.ayuda}>
              {c.titulo}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {filas.length === 0 ? (
          <TableRow>
            <TableCell colSpan={columnas.length + 1} className="text-center text-muted-foreground">
              {vacio}
            </TableCell>
          </TableRow>
        ) : (
          filas.map((f) => (
            <TableRow key={f.clave}>
              <TableCell>
                <div className="font-medium">{f.nombre}</div>
                {f.nombre !== f.clave ? <div className="text-xs text-muted-foreground">{f.clave}</div> : null}
              </TableCell>
              {columnas.map((c) => (
                <TableCell key={c.titulo} className="text-right tabular-nums">
                  {c.celda(f)}
                </TableCell>
              ))}
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}

/** Tabla de % contestado por hora: una fila por campaña o agente, color de un solo tono. */
function TablaFranjas({ filas }: { filas: FilaSalientes[] }) {
  const horas = [...new Set(filas.flatMap((f) => f.franjas.map((x) => x.hora)))].sort((a, b) => a - b);
  if (horas.length === 0) return <p className="py-6 text-center text-sm text-muted-foreground">Sin intentos de llamada</p>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead />
          {horas.map((h) => (
            <TableHead key={h} className="text-center text-xs">
              {String(h).padStart(2, "0")} h
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {filas.map((f) => (
          <TableRow key={f.clave}>
            <TableCell className="font-medium whitespace-nowrap">{f.nombre}</TableCell>
            {horas.map((h) => {
              const x = f.franjas.find((y) => y.hora === h);
              const poca = x != null && x.intentos < 5;
              return (
                <TableCell
                  key={h}
                  className={cn("text-center text-xs tabular-nums", poca && "text-muted-foreground")}
                  title={x ? `${hora(h)}: ${entero(x.contestados)} contestados de ${entero(x.intentos)} intentos` : undefined}
                  style={
                    x?.pct != null && !poca
                      ? { background: `color-mix(in oklab, var(--chart-1) ${Math.round(x.pct * 0.6)}%, transparent)` }
                      : undefined
                  }
                >
                  {x?.pct != null ? `${Math.round(x.pct)} %` : ""}
                </TableCell>
              );
            })}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/** Éxitos por número de intento: % de los éxitos con llamada en cada intento. */
function TablaIntentos({ filas }: { filas: FilaSalientes[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead />
          {ETIQUETAS_INTENTO.map((e) => (
            <TableHead key={e} className="text-right" title={ayudaDe("conversionIntento")}>
              {e}
            </TableHead>
          ))}
          <TableHead className="text-right">Intentos de media</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {filas.map((f) => {
          const conLlamada = f.exitosPorIntento.slice(1).reduce((s, n) => s + n, 0);
          return (
            <TableRow key={f.clave}>
              <TableCell className="font-medium whitespace-nowrap">{f.nombre}</TableCell>
              {f.exitosPorIntento.map((n, i) => (
                <TableCell key={i} className={cn("text-right tabular-nums", i === 0 && "text-muted-foreground")}>
                  {entero(n)}
                  {i > 0 && conLlamada > 0 ? (
                    <span className="ml-1 text-xs text-muted-foreground">({Math.round((n / conLlamada) * 100)} %)</span>
                  ) : null}
                </TableCell>
              ))}
              <TableCell className="text-right tabular-nums">{num2(f.intentosMediosHastaExito)}</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

export function Salientes({ datos, periodo }: { datos: ResultadoSalientes; periodo: string }) {
  const [verPor, setVerPor] = useState<"campanias" | "agentes">("campanias");
  const t = datos.total;
  const filasDetalle = [t, ...(verPor === "campanias" ? datos.campanias : datos.agentes)];
  const conIntentos = (l: FilaSalientes[]) => l.filter((f) => f.intentos > 0 || f.agendadas > 0 || f.exitosPorIntento.some((n) => n > 0));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Salientes {periodo}</CardTitle>
        <p className="text-sm text-muted-foreground">
          Cómo se trabaja la llamada de salida: ocupación, a qué horas contestan, a cuántos contactos se llega,
          rellamadas, en qué intento llega el éxito, tiempo esperando y preparación. Pasa el ratón por cada título
          para ver qué es.
        </p>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="global">
          <TabsList className="flex-wrap">
            <TabsTrigger value="global">Global</TabsTrigger>
            <TabsTrigger value="campanias">Por campaña ({conIntentos(datos.campanias).length})</TabsTrigger>
            <TabsTrigger value="agentes">Por agente ({conIntentos(datos.agentes).length})</TabsTrigger>
            <TabsTrigger value="franjas">Franjas horarias</TabsTrigger>
            <TabsTrigger value="intentos">Por intento</TabsTrigger>
          </TabsList>

          <TabsContent value="global">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
              <TarjetaKpi
                titulo="Ocupación"
                valor={pct(t.ocupacionPct)}
                sub={`${horasLegibles(t.horasGuion)} con ficha de ${horasLegibles(t.horasLogadas)} logadas`}
                ayuda={ayudaDe("ocupacion")}
              />
              <TarjetaKpi
                titulo="Tiempo esperando llamada"
                valor={horasLegibles(t.horasEsperando)}
                sub={t.esperandoPct != null ? `${pct(t.esperandoPct)} de las horas logadas` : undefined}
                ayuda={ayudaDe("tiempoEsperando")}
              />
              <TarjetaKpi
                titulo="Contactabilidad"
                valor={pct(t.contactabilidadPct)}
                sub={t.mejorFranja ? `Mejor franja: ${hora(t.mejorFranja.hora)} (${pct(t.mejorFranja.pct)})` : `${entero(t.intentos)} intentos`}
                ayuda={ayudaDe("contactabilidadFranja")}
              />
              <TarjetaKpi
                titulo="Contactos alcanzados"
                valor={pct(t.alcanzadosPct)}
                sub={`${entero(t.alcanzados)} de ${entero(t.contactos)} contactos llamados`}
                ayuda={ayudaDe("contactosAlcanzados")}
              />
              <TarjetaKpi
                titulo="Intentos hasta hablar"
                valor={num2(t.intentosHastaHablar)}
                sub="De media, hasta la primera conversación"
                ayuda={ayudaDe("contactosAlcanzados")}
              />
              <TarjetaKpi
                titulo="Preparación"
                valor={horasLegibles(t.preparacionSeg / 3600)}
                sub={t.preparaciones > 0 ? `${entero(t.preparaciones)} veces · ${segundosLegibles(t.preparacionMediaSeg)} de media` : undefined}
                ayuda={ayudaDe("preparacion")}
              />
              <TarjetaKpi
                titulo="Rellamadas hechas"
                valor={pct(t.hechasPct)}
                sub={`${entero(t.hechas)} de ${entero(t.agendadas)} agendadas`}
                ayuda={ayudaDe("rellamadas")}
              />
              <TarjetaKpi
                titulo="Rellamadas vencidas ahora"
                valor={entero(t.vencidas)}
                sub="Cita pasada y sin llamar"
                ayuda={ayudaDe("rellamadas")}
              />
              <TarjetaKpi
                titulo="Retraso medio (aprox.)"
                valor={minutos(t.retrasoMedioMin)}
                sub="Desde la cita hasta la llamada"
                ayuda={ayudaDe("rellamadas")}
              />
              <TarjetaKpi
                titulo="Éxito al 1.er intento"
                valor={pct(t.exitoPrimerIntentoPct)}
                sub="De los éxitos con llamada de salida"
                ayuda={ayudaDe("conversionIntento")}
              />
              <TarjetaKpi
                titulo="Intentos hasta el éxito"
                valor={num2(t.intentosMediosHastaExito)}
                sub="De media"
                ayuda={ayudaDe("conversionIntento")}
              />
            </div>
          </TabsContent>

          <TabsContent value="campanias">
            <TablaSalientes
              filas={conIntentos(datos.campanias)}
              primera="Campaña"
              vacio={`Sin llamadas de salida ${periodo}`}
              extras={[
                { titulo: "Horas con ficha", ayuda: ayudaDe("ocupacion") ?? "", celda: (f) => <Tiempo horas={f.horasGuion} /> },
                { titulo: "Peso", ayuda: ayudaDe("ocupacion") ?? "", celda: (f) => pct(f.pesoGuionPct) },
              ]}
            />
          </TabsContent>

          <TabsContent value="agentes">
            <TablaSalientes
              filas={conIntentos(datos.agentes)}
              primera="Agente"
              vacio={`Sin llamadas de salida ${periodo}`}
              extras={[
                {
                  titulo: "Horas logadas",
                  ayuda: ayudaDe("kpiHorasLogadas") ?? "",
                  celda: (f) => (f.horasLogadas == null ? "—" : <Tiempo horas={f.horasLogadas} />),
                },
                { titulo: "Ocupación", ayuda: ayudaDe("ocupacion") ?? "", celda: (f) => pct(f.ocupacionPct) },
                {
                  titulo: "Esperando llamada",
                  ayuda: ayudaDe("tiempoEsperando") ?? "",
                  celda: (f) => (f.horasEsperando == null ? "—" : <Tiempo horas={f.horasEsperando} />),
                },
              ]}
            />
          </TabsContent>

          <TabsContent value="franjas" className="space-y-2">
            <SelectorVer valor={verPor} cambiar={setVerPor} />
            <p className="text-xs text-muted-foreground">
              % de intentos contestados en cada hora. Cuanto más intenso el color, más contestan; en gris, menos de 5
              intentos. Pasa el ratón por una celda para ver las cifras.
            </p>
            <TablaFranjas filas={filasDetalle} />
          </TabsContent>

          <TabsContent value="intentos" className="space-y-2">
            <SelectorVer valor={verPor} cambiar={setVerPor} />
            <p className="text-xs text-muted-foreground">
              Éxitos según el intento en que llegaron, y entre paréntesis qué parte de los éxitos con llamada es.
            </p>
            <TablaIntentos filas={filasDetalle} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function SelectorVer({ valor, cambiar }: { valor: "campanias" | "agentes"; cambiar: (v: "campanias" | "agentes") => void }) {
  return (
    <div className="inline-flex gap-1 rounded-lg bg-muted p-1 text-sm">
      {(["campanias", "agentes"] as const).map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => cambiar(v)}
          aria-pressed={valor === v}
          className={cn(
            "rounded-md px-3 py-1 font-medium",
            valor === v ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {v === "campanias" ? "Por campaña" : "Por agente"}
        </button>
      ))}
    </div>
  );
}
