import { TarjetaKpi } from "@/components/kpi/tarjeta-kpi";
import { Tiempo } from "@/components/kpi/tiempo";
import { BuscadorPersonas } from "@/components/rrhh/controles";
import { FilaDesplegable } from "@/components/rrhh/fila-desplegable";
import { CabeceraOrdenable, FilasOrdenables, TablaOrdenable } from "@/components/tabla-ordenable";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { horasLegibles, relojDesdeHoras } from "@/lib/fechas";
import { valoresOrden } from "@/lib/orden";
import type { ApuntadaPeriodo, ResumenPeriodoPersona } from "@/lib/rrhh/periodo";
import type { DatosPeriodo } from "@/lib/rrhh/servidor";

// ============================================================
// Panel de RRHH → «Por agente» (16/11/2026, pedido por Christian): de un
// periodo, cada persona con su tiempo conectado y su tiempo ausente (SOLO
// las pausas con motivo de ausencia), que se despliega por motivo con el
// tiempo acumulado y el número de veces. Las ausencias apuntadas (VAC,
// IT...) van aparte, sin sumar. Cálculo en lib/rrhh/periodo.ts.
// ============================================================

const COLUMNAS = 7;
const pct = (parte: number, total: number) =>
  total > 0 ? `${((parte / total) * 100).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %` : "—";

function Horas({ min }: { min: number }) {
  if (min < 0.005) return <span className="text-muted-foreground">—</span>;
  return <Tiempo horas={min / 60} />;
}

/** «2 VAC · 1 IT» para la fila; el detalle va al desplegar. */
function textoApuntadas(apuntadas: readonly ApuntadaPeriodo[]): string {
  return apuntadas.map((a) => `${a.veces} ${a.tipoCodigo}`).join(" · ");
}

function Detalle({ resumen, apuntadas }: { resumen: ResumenPeriodoPersona; apuntadas: readonly ApuntadaPeriodo[] | null }) {
  return (
    <div className="grid gap-6 xl:grid-cols-[3fr_2fr]">
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Tiempo ausente por motivo</h3>
        {resumen.motivos.length === 0 ? (
          <p className="text-sm text-muted-foreground">Ninguna pausa de ausencia en el periodo.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Motivo</TableHead>
                <TableHead className="text-right">Veces</TableHead>
                <TableHead className="text-right">Tiempo acumulado</TableHead>
                <TableHead className="text-right">Media por vez</TableHead>
                <TableHead className="text-right">% del ausente</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {resumen.motivos.map((m) => (
                <TableRow key={m.motivo}>
                  <TableCell className="font-medium">{m.motivo}</TableCell>
                  <TableCell className="text-right tabular-nums">{m.veces.toLocaleString("es-ES")}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    <Tiempo horas={m.minutos / 60} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    <Tiempo segundos={(m.minutos * 60) / m.veces} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{pct(m.minutos, resumen.ausenteMin)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
      {apuntadas ? (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Ausencias apuntadas</h3>
          <p className="text-xs text-muted-foreground">Aparte: no suman al tiempo ausente.</p>
          {apuntadas.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ninguna en el periodo.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Veces</TableHead>
                  <TableHead className="text-right">Días completos</TableHead>
                  <TableHead className="text-right">Horas sueltas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {apuntadas.map((a) => (
                  <TableRow key={a.tipoCodigo}>
                    <TableCell>
                      <span className="inline-flex items-center gap-1.5">
                        <span aria-hidden className="size-2.5 rounded-full" style={{ background: a.color }} />
                        {a.tipoNombre}
                      </span>
                      {a.computaComoTrabajada ? <span className="block text-xs text-muted-foreground">cuenta como trabajada</span> : null}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{a.veces}</TableCell>
                    <TableCell className="text-right tabular-nums">{a.dias > 0 ? a.dias : "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{a.horas > 0 ? horasLegibles(a.horas) : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      ) : null}
    </div>
  );
}

export function VistaAgentes({ datos }: { datos: DatosPeriodo }) {
  const t = datos.total;
  const masTiempo = t.motivos[0];
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <TarjetaKpi titulo="Personas" valor={String(datos.filas.length)} sub="con conexión o ausencias apuntadas" />
        <TarjetaKpi
          titulo="Tiempo conectado"
          valor={horasLegibles(t.conectadaMin / 60)}
          reloj={relojDesdeHoras(t.conectadaMin / 60)}
          ayuda="Tiempo con sesión abierta en Altitude (user_log) de todas las personas, con todos sus usuarios."
        />
        <TarjetaKpi
          titulo="Tiempo ausente"
          valor={horasLegibles(t.ausenteMin / 60)}
          sub={`${pct(t.ausenteMin, t.conectadaMin)} del tiempo conectado`}
          ayuda="Pausas con un motivo que es ausencia (Descanso, Servicio, Fin de Jornada...), de 1 minuto o más. No incluye el tiempo sin conectar ni las ausencias apuntadas. Qué motivo es ausencia se cambia en Configuración."
        />
        <TarjetaKpi
          titulo="Número de ausencias"
          valor={t.ausencias.toLocaleString("es-ES")}
          sub={masTiempo ? `más tiempo: ${masTiempo.motivo} (${horasLegibles(masTiempo.minutos / 60)})` : undefined}
          ayuda="Pausas de ausencia de 1 minuto o más en el periodo (las más cortas son casi siempre «Fin de Jornada» al cambiar de usuario de Altitude). Al desplegar una persona salen por motivo."
        />
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base">Cada persona</CardTitle>
              <CardDescription>Pulsa una persona para ver su tiempo ausente por motivo y sus ausencias apuntadas.</CardDescription>
            </div>
            <BuscadorPersonas contenedor="rrhh-agentes" />
          </div>
        </CardHeader>
        <CardContent id="rrhh-agentes" className="overflow-x-auto">
          {datos.filas.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nadie se conectó ni tuvo ausencias apuntadas en el periodo.</p>
          ) : (
            <TablaOrdenable>
              <Table>
                <TableHeader>
                  <TableRow>
                    <CabeceraOrdenable col={0}>Persona</CabeceraOrdenable>
                    <CabeceraOrdenable col={1} numerica className="text-right">
                      Días conectada
                    </CabeceraOrdenable>
                    <CabeceraOrdenable col={2} numerica className="text-right">
                      Tiempo conectado
                    </CabeceraOrdenable>
                    <CabeceraOrdenable col={3} numerica className="text-right" title="Pausas con motivo de ausencia">
                      Tiempo ausente
                    </CabeceraOrdenable>
                    <CabeceraOrdenable col={4} numerica className="text-right" title="Tiempo ausente ÷ tiempo conectado">
                      % ausente
                    </CabeceraOrdenable>
                    <CabeceraOrdenable col={5} numerica className="text-right">
                      Nº de ausencias
                    </CabeceraOrdenable>
                    <TableHead>Ausencias apuntadas</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <FilasOrdenables>
                    {datos.filas.map((f) => {
                      const r = f.resumen;
                      const p = f.persona;
                      return (
                        <FilaDesplegable
                          key={p.numero}
                          data-orden={valoresOrden(
                            p.codigo,
                            r.diasConectada,
                            r.conectadaMin,
                            r.ausenteMin,
                            r.conectadaMin > 0 ? r.ausenteMin / r.conectadaMin : null,
                            r.ausencias,
                          )}
                          data-buscar={`${p.codigo} ${p.nombre ?? ""} ${p.usuarios.join(" ")} ${p.numero}`}
                          columnas={COLUMNAS}
                          etiqueta={`Ver motivos de ${p.codigo}`}
                          primera={
                            <>
                              <span className="font-medium">{p.codigo}</span>
                              {p.nombre ? <span className="block text-xs text-muted-foreground">{p.nombre}</span> : null}
                            </>
                          }
                          celdas={
                            <>
                              <TableCell className="text-right tabular-nums">{r.diasConectada || "—"}</TableCell>
                              <TableCell className="text-right tabular-nums">
                                <Horas min={r.conectadaMin} />
                              </TableCell>
                              <TableCell className="text-right font-semibold tabular-nums">
                                <Horas min={r.ausenteMin} />
                              </TableCell>
                              <TableCell className="text-right tabular-nums">{pct(r.ausenteMin, r.conectadaMin)}</TableCell>
                              <TableCell className="text-right tabular-nums">{r.ausencias ? r.ausencias.toLocaleString("es-ES") : "—"}</TableCell>
                              <TableCell className="text-xs">{textoApuntadas(f.apuntadas) || <span className="text-muted-foreground">—</span>}</TableCell>
                            </>
                          }
                          detalle={<Detalle resumen={r} apuntadas={f.apuntadas} />}
                        />
                      );
                    })}
                  </FilasOrdenables>
                  <TableRow data-sin-resultados hidden>
                    <TableCell colSpan={COLUMNAS} className="text-center text-sm text-muted-foreground">
                      Nadie con ese nombre en el periodo.
                    </TableCell>
                  </TableRow>
                  <FilaDesplegable
                    className="border-t-2 font-semibold"
                    columnas={COLUMNAS}
                    etiqueta="Ver el total por motivo"
                    primera="Total"
                    celdas={
                      <>
                        <TableCell className="text-right tabular-nums">{t.diasConectada}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          <Horas min={t.conectadaMin} />
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          <Horas min={t.ausenteMin} />
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{pct(t.ausenteMin, t.conectadaMin)}</TableCell>
                        <TableCell className="text-right tabular-nums">{t.ausencias.toLocaleString("es-ES")}</TableCell>
                        <TableCell />
                      </>
                    }
                    detalle={<Detalle resumen={t} apuntadas={null} />}
                  />
                </TableBody>
              </Table>
            </TablaOrdenable>
          )}
        </CardContent>
      </Card>
    </>
  );
}
