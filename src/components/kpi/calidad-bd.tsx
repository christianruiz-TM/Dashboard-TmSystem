import { Fragment } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { GraficaLineas } from "@/components/graficas/grafica-lineas";
import type { CalidadBd, ResultadoCalidadBd } from "@/lib/calidad-bd";
import { cn } from "@/lib/utils";

// ============================================================
// «Calidad de la base de datos» (21/10/2026): cómo acaban los intentos
// salientes, como el informe de Altitude (sin preparaciones). Lo usan Supervisión
// (Tiempo real e Histórico) y Dirección. Sin hooks: sirve en el panel de
// cliente y en los de servidor (la gráfica es su propio componente cliente).
// Barras horizontales en vez de un donut: con 6-10 resultados se comparan
// mejor y caben las cifras.
// ============================================================

const entero = (n: number) => n.toLocaleString("es-ES");
const pct = (n: number | null) => (n == null ? "—" : `${n.toLocaleString("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`);
const dec = (n: number | null) => (n == null ? "—" : n.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

function Cifra({ titulo, valor, sub }: { titulo: string; valor: string; sub: string }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{titulo}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{valor}</div>
      <div className="text-xs text-muted-foreground">{sub}</div>
    </div>
  );
}

/** Reparto por resultado: una barra por resultado, de un solo color (es magnitud, no identidad). */
function Reparto({ c }: { c: CalidadBd }) {
  const max = Math.max(...c.porResultado.map((r) => r.pct), 1);
  return (
    <table className="w-full text-sm">
      <caption className="sr-only">Intentos salientes por resultado</caption>
      <tbody>
        {c.porResultado.map((r) => (
          <tr key={r.nombre} title={`${r.nombre}: ${entero(r.intentos)} intentos (${pct(r.pct)})`}>
            <td className="w-44 py-1 pr-2 align-middle">{r.nombre}</td>
            <td className="py-1 align-middle">
              <div className="h-3 w-full">
                <div
                  className="h-3 rounded-r-[4px] bg-[var(--chart-1)]"
                  style={{ width: `${Math.max((r.pct / max) * 100, 0.8)}%` }}
                />
              </div>
            </td>
            <td className="w-20 py-1 pl-2 text-right align-middle tabular-nums">{entero(r.intentos)}</td>
            <td className="w-16 py-1 pl-2 text-right align-middle tabular-nums text-muted-foreground">{pct(r.pct)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Celdas({ c }: { c: CalidadBd }) {
  return (
    <>
      <TableCell className="text-right tabular-nums">{entero(c.intentos)}</TableCell>
      <TableCell className="text-right tabular-nums">{pct(c.pctContactable)}</TableCell>
      <TableCell className="text-right tabular-nums">{pct(c.pctReintentable)}</TableCell>
      <TableCell className={cn("text-right tabular-nums", (c.pctNoUtil ?? 0) >= 10 && "font-semibold text-red-600")}>
        {pct(c.pctNoUtil)}
      </TableCell>
      <TableCell className="text-right tabular-nums">{pct(c.pctRechazo)}</TableCell>
      <TableCell className="text-right tabular-nums">{pct(c.pctRed)}</TableCell>
      <TableCell className="text-right tabular-nums">{dec(c.intentosPorContacto)}</TableCell>
    </>
  );
}

const COLUMNAS = 8;

export function CalidadBaseDatos({ datos, periodo }: { datos: ResultadoCalidadBd; periodo: string }) {
  const t = datos.total;
  const agrupada = datos.grupos.some((g) => g.nombre != null);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Calidad de la base de datos · llamadas salientes {periodo}</CardTitle>
        <CardDescription>
          Cómo acaban los intentos de llamada, como el informe de Altitude. No cuentan las preparaciones de las llamadas manuales ni los que se quedan sin
          resultado, las abandonadas ni las redirigidas.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {t.intentos === 0 ? (
          <p className="text-sm text-muted-foreground">Sin llamadas salientes {periodo}.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              <Cifra titulo="Intentos" valor={entero(t.intentos)} sub={`a ${entero(t.contactos)} contactos`} />
              <Cifra titulo="Contactable" valor={pct(t.pctContactable)} sub="gestionadas ÷ intentos" />
              <Cifra titulo="Para reintentar" valor={pct(t.pctReintentable)} sub="ocupado, sin respuesta, contestador" />
              <Cifra titulo="Números que no sirven" valor={pct(t.pctNoUtil)} sub="inválidos, fax y módem" />
              <Cifra titulo="Intentos por contacto" valor={dec(t.intentosPorContacto)} sub="llamadas a cada contacto" />
            </div>

            <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
              <div>
                <h3 className="mb-2 text-sm font-medium">Por resultado</h3>
                <Reparto c={t} />
              </div>
              {datos.dias.length >= 2 ? (
                <div>
                  <h3 className="mb-2 text-sm font-medium">Evolución por día</h3>
                  <GraficaLineas
                    datos={datos.dias.map((d) => ({
                      dia: `${d.dia.slice(8, 10)}/${d.dia.slice(5, 7)}`,
                      reintentar: d.pctReintentable,
                      noSirven: d.pctNoUtil,
                    }))}
                    ejeX="dia"
                    series={[
                      { clave: "reintentar", nombre: "% para reintentar", color: "var(--chart-1)" },
                      { clave: "noSirven", nombre: "% números que no sirven", color: "var(--chart-4)", discontinua: true },
                    ]}
                    alto={220}
                    sufijo=" %"
                  />
                </div>
              ) : null}
            </div>

            <div>
              <h3 className="mb-2 text-sm font-medium">Por campaña</h3>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Campaña</TableHead>
                    <TableHead className="text-right">Intentos</TableHead>
                    <TableHead className="text-right" title="Gestionadas ÷ intentos">
                      Contactable
                    </TableHead>
                    <TableHead className="text-right" title="Ocupado, sin respuesta y contestador ÷ intentos">
                      Para reintentar
                    </TableHead>
                    <TableHead className="text-right" title="Números inválidos, fax y módem ÷ intentos">
                      No sirven
                    </TableHead>
                    <TableHead className="text-right" title="Rechazadas y molestia ÷ intentos">
                      Rechazo
                    </TableHead>
                    <TableHead className="text-right" title="Sin líneas troncales y desbordadas ÷ intentos: problema de red, no de la base de datos">
                      Red
                    </TableHead>
                    <TableHead className="text-right">Intentos / contacto</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {datos.grupos.map((g) => (
                    <Fragment key={g.nombre ?? "todas"}>
                      {agrupada ? (
                        <TableRow className="bg-muted/40 hover:bg-muted/40">
                          <TableCell colSpan={COLUMNAS} className="text-xs font-semibold uppercase tracking-wide">
                            {g.nombre} · {g.campanias.length} {g.campanias.length === 1 ? "campaña" : "campañas"}
                          </TableCell>
                        </TableRow>
                      ) : null}
                      {g.campanias.map((c) => (
                        <TableRow key={c.campania}>
                          <TableCell className={cn("font-medium", agrupada && "pl-4")}>{c.campania}</TableCell>
                          <Celdas c={c} />
                        </TableRow>
                      ))}
                      {agrupada ? (
                        <TableRow className="border-b-2 font-semibold">
                          <TableCell>Total {g.nombre}</TableCell>
                          <Celdas c={g.total} />
                        </TableRow>
                      ) : null}
                    </Fragment>
                  ))}
                  {datos.grupos.length > 1 || (!agrupada && (datos.grupos[0]?.campanias.length ?? 0) > 1) ? (
                    <TableRow className="font-semibold">
                      <TableCell>Total</TableCell>
                      <Celdas c={t} />
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
