import Link from "next/link";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { horasLegibles } from "@/lib/fechas";
import type { HorarioMes } from "@/lib/planificacion/horario-agentes";
import { rangoCorto } from "@/lib/planificacion/motor/franjas";
import { cn } from "@/lib/utils";

// ============================================================
// Panel de RRHH → «Turnos» (17/11/2026, decidido con Christian): el último
// plan PUBLICADO del mes, por persona y día, sin cliente: lo mismo que la
// «Copia para las agentes» (vistas.ts::horarioPublicado; las ausencias de
// ahora ya descontadas). Nunca un borrador. Cada día que ya ha pasado
// enlaza con su detalle en la pestaña «Día». Solo sale la plantilla de
// Planificación (GH): Bolsas y Socios no se planifican.
// ============================================================

const INICIAL = ["L", "M", "X", "J", "V", "S", "D"];

export function VistaTurnos({
  horario,
  mes,
  hoy,
  soloOtroGrupo,
  enlaceDia,
}: {
  horario: HorarioMes | null;
  mes: string;
  hoy: string;
  /** El filtro es Bolsas o Socios: no tienen plan. */
  soloOtroGrupo: boolean;
  enlaceDia: (fecha: string, numero: string) => string;
}) {
  if (soloOtroGrupo) {
    return (
      <Alert>
        <AlertDescription>
          Bolsas y Socios no se planifican en Planificación: su horario es el de RRHH → Configuración. En «Turnos» solo sale el grupo GH.
        </AlertDescription>
      </Alert>
    );
  }
  if (!horario) {
    return (
      <Alert>
        <AlertDescription>{mes} no tiene ningún plan publicado en Planificación.</AlertDescription>
      </Alert>
    );
  }
  const publicada = horario.version.publicadaAt ? ` el ${horario.version.publicadaAt}` : "";
  return (
    <Card>
      <CardHeader className="gap-2">
        <CardTitle className="text-base first-letter:uppercase">
          {horario.mesTexto} · plan publicado v{horario.version.numero}
        </CardTitle>
        <CardDescription>
          Publicado{publicada}. Es lo mismo que reciben las agentes: sus horas, sin cliente, y sus ausencias. Pulsa un día ya pasado para
          compararlo con lo que hizo.
        </CardDescription>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {horario.tipos.map((t) => (
            <li key={t.codigo} className="inline-flex items-center gap-1.5">
              <span aria-hidden className="inline-block size-3 rounded-sm" style={{ background: t.color }} />
              {t.codigo} · {t.nombre}
            </li>
          ))}
          {horario.hayFestivos ? (
            <li className="inline-flex items-center gap-1.5">
              <span aria-hidden className="inline-block size-3 rounded-sm bg-muted" />F · Festivo
            </li>
          ) : null}
        </ul>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full border-collapse text-[11px] tabular-nums">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-card px-2 py-1 text-left text-xs font-medium">Persona</th>
              {horario.columnas.map((c) => (
                <th
                  key={c.fecha}
                  className={cn(
                    "min-w-11 px-0.5 py-1 text-center font-medium",
                    (c.finDeSemana || c.festivo) && "bg-muted/60",
                    c.empiezaSemana && "border-l-2 border-border",
                    c.fecha === hoy && "text-foreground underline underline-offset-4",
                  )}
                >
                  <span className="block text-muted-foreground">{INICIAL[c.diaSemana]}</span>
                  {c.dia}
                </th>
              ))}
              <th className="px-2 py-1 text-right text-xs font-medium">Horas</th>
            </tr>
          </thead>
          <tbody>
            {horario.filas.map((f) => (
              <tr key={f.numero} className="border-t">
                <th scope="row" className="sticky left-0 z-10 bg-card px-2 py-1 text-left font-normal whitespace-nowrap">
                  <span className="text-xs font-medium">{f.codigo}</span>
                  <span className="block text-muted-foreground">{f.nombre}</span>
                </th>
                {f.dias.map((d, i) => {
                  const c = horario.columnas[i];
                  const tipo = d.ausencia ? horario.tipos.find((t) => t.codigo === d.ausencia) : undefined;
                  const contenido =
                    d.estado === "trabaja" ? (
                      d.tramos.map((t) => (
                        <span key={t.inicioMin} className="block whitespace-nowrap">
                          {rangoCorto(t.inicioMin, t.finMin)}
                        </span>
                      ))
                    ) : d.estado === "ausencia" ? (
                      <span
                        className="inline-block rounded px-1 font-semibold text-black"
                        style={{ background: tipo?.color ?? "#BFBFBF" }}
                        title={tipo?.nombre ?? d.ausencia ?? ""}
                      >
                        {d.ausencia}
                      </span>
                    ) : d.estado === "festivo" ? (
                      <span className="text-muted-foreground">F</span>
                    ) : null;
                  const pasado = d.fecha <= hoy;
                  return (
                    <td
                      key={d.fecha}
                      className={cn(
                        "px-0.5 py-1 text-center align-middle",
                        (c?.finDeSemana || c?.festivo) && "bg-muted/60",
                        c?.empiezaSemana && "border-l-2 border-border",
                      )}
                    >
                      {pasado && contenido ? (
                        <Link
                          href={enlaceDia(d.fecha, f.numero)}
                          className="block rounded hover:bg-muted"
                          title={`Ver el ${d.fecha.slice(8)}/${d.fecha.slice(5, 7)} de ${f.codigo}`}
                        >
                          {contenido}
                        </Link>
                      ) : (
                        contenido
                      )}
                    </td>
                  );
                })}
                <td className="px-2 py-1 text-right whitespace-nowrap">{horasLegibles(f.dias.reduce((s, d) => s + d.minutos, 0) / 60)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
