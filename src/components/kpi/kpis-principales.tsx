import type { ReactNode } from "react";
import { TarjetaKpi } from "@/components/kpi/tarjeta-kpi";
import { horasLegibles, relojDesdeSegundos, segundosLegibles } from "@/lib/fechas";
import { ayudaDe } from "@/lib/glosario";
import type { ResultadoRatios } from "@/lib/ratios-exito";
import type { ResultadoResultados } from "@/lib/resultados-actividad";

// ============================================================
// Las 12 cajas principales, en el orden que fijó Christian el 22/10/2026,
// las MISMAS en todas las vistas de Supervisión (Tiempo real, Histórico,
// Resultados) y en Dirección:
//   1 horas logadas · 2 llamadas · 3 finalizados · 4 éxitos ·
//   5 llamadas por hora · 6 llamadas por éxito · 7 finalizados por hora ·
//   8 finalizados por éxito · 9 aprovechamiento bruto · 10 neto ·
//   11 duración de las llamadas sin éxito · 12 de las de éxito.
// Dos fuentes (y así lo dice la ayuda de cada caja):
//  - actividad (ratios de éxito, regla 17): horas logadas de user_log,
//    llamadas gestionadas sin preparaciones, éxitos de las sesiones de
//    script por el día de la llamada y duración de las llamadas.
//  - resultados (regla 18): contactos cerrados por un agente, por el día del
//    cierre; aprovechamiento, finalizados por hora y por éxito.
// Sin hooks: sirve en paneles de cliente y de servidor.
// ============================================================

const DOS: Intl.NumberFormatOptions = { minimumFractionDigits: 2, maximumFractionDigits: 2 };

function num2(v: number | null | undefined): string {
  return v == null ? "—" : v.toLocaleString("es-ES", DOS);
}

function pct(v: number | null | undefined): string {
  return v == null ? "—" : `${v.toLocaleString("es-ES", DOS)} %`;
}

function entero(v: number | null | undefined): string {
  return v == null ? "—" : v.toLocaleString("es-ES");
}

/** Variación relativa en % frente al período anterior (null sin base). */
function variacion(actual: number | null | undefined, anterior: number | null | undefined): number | null {
  if (actual == null || anterior == null || anterior === 0) return null;
  return ((actual - anterior) / anterior) * 100;
}

type TotalRatios = ResultadoRatios["total"];
type TotalResultados = ResultadoResultados["total"];

export function KpisPrincipales({
  ratios,
  resultados,
  anterior,
  extras,
}: {
  ratios: TotalRatios;
  /** null: no se pudo calcular (o no hay contactos cerrados en el alcance). */
  resultados: TotalResultados | null;
  /** Dirección: totales del período comparable anterior, para la variación. */
  anterior?: { ratios: TotalRatios; resultados: TotalResultados | null };
  /** Resultados: el semáforo contra el objetivo en las cajas del aprovechamiento. */
  extras?: { bruto?: ReactNode; neto?: ReactNode };
}) {
  const r = ratios;
  const res = resultados;
  const ra = anterior?.ratios;
  const resa = anterior?.resultados;
  const sinResultados = "Sin contactos cerrados";

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
      <TarjetaKpi
        titulo="Horas logadas"
        valor={horasLegibles(r.horasLogadas)}
        variacionPct={variacion(r.horasLogadas, ra?.horasLogadas)}
        ayuda={ayudaDe("kpiHorasLogadas")}
      />
      <TarjetaKpi
        titulo="Llamadas"
        valor={entero(r.atendidas)}
        variacionPct={variacion(r.atendidas, ra?.atendidas)}
        sub={`${entero(r.contactos)} contactos trabajados`}
        ayuda={ayudaDe("kpiLlamadas")}
      />
      <TarjetaKpi
        titulo="Finalizados"
        valor={entero(res?.finalizados)}
        variacionPct={variacion(res?.finalizados, resa?.finalizados)}
        sub={
          res
            ? `${entero(res.cerrados)} cerrados · ${entero(res.sinTocar)} sin tocar · ${entero(res.administrativos)} cierres admin.`
            : sinResultados
        }
        ayuda={ayudaDe("kpiFinalizados")}
      />
      <TarjetaKpi
        titulo="Éxitos"
        valor={entero(r.exitos)}
        variacionPct={variacion(r.exitos, ra?.exitos)}
        sub={`${pct(r.convAtendidasPct)} de las llamadas`}
        ayuda={ayudaDe("kpiExitos")}
      />
      <TarjetaKpi
        titulo="Llamadas por hora"
        valor={num2(r.llamadasHoraLogada)}
        variacionPct={variacion(r.llamadasHoraLogada, ra?.llamadasHoraLogada)}
        sub="Por hora logada"
        ayuda={ayudaDe("kpiLlamadasHora")}
      />
      <TarjetaKpi
        titulo="Llamadas por éxito"
        valor={num2(r.llamadasPorExito)}
        variacionPct={variacion(r.llamadasPorExito, ra?.llamadasPorExito)}
        invertirColor
        sub={`${pct(r.convAtendidasPct)} acaban en éxito`}
        ayuda={ayudaDe("kpiLlamadasPorExito")}
      />
      <TarjetaKpi
        titulo="Finalizados por hora"
        valor={num2(res?.finalizadosHora)}
        variacionPct={variacion(res?.finalizadosHora, resa?.finalizadosHora)}
        sub={res ? "Por hora logada" : sinResultados}
        ayuda={ayudaDe("kpiFinalizadosHora")}
      />
      <TarjetaKpi
        titulo="Finalizados por éxito"
        valor={num2(res?.finalizadosPorExito)}
        variacionPct={variacion(res?.finalizadosPorExito, resa?.finalizadosPorExito)}
        invertirColor
        sub={res ? `${entero(res.exitos)} éxitos cerrados` : sinResultados}
        ayuda={ayudaDe("kpiFinalizadosPorExito")}
      />
      <TarjetaKpi
        titulo="Aprovechamiento (bruto)"
        valor={pct(res?.brutoPct)}
        variacionPct={variacion(res?.brutoPct, resa?.brutoPct)}
        sub={res ? `${entero(res.exitos)} éxitos de ${entero(res.finalizados)} finalizados` : sinResultados}
        extra={extras?.bruto}
        ayuda={ayudaDe("ratioBruto")}
      />
      <TarjetaKpi
        titulo="Aprovechamiento (neto)"
        valor={pct(res?.netoPct)}
        variacionPct={variacion(res?.netoPct, resa?.netoPct)}
        sub={
          !res
            ? sinResultados
            : res.finalizadosConfigurados === 0
              ? "Sin «no válidos» configurados"
              : "Sin contar los no válidos"
        }
        extra={extras?.neto}
        ayuda={ayudaDe("ratioNeto")}
      />
      <TarjetaKpi
        titulo="Duración llamadas sin éxito"
        valor={segundosLegibles(r.duracionLlamadaNoExitoSeg)}
        reloj={relojDesdeSegundos(r.duracionLlamadaNoExitoSeg)}
        variacionPct={variacion(r.duracionLlamadaNoExitoSeg, ra?.duracionLlamadaNoExitoSeg)}
        ayuda={ayudaDe("kpiDuracionNoExito")}
      />
      <TarjetaKpi
        titulo="Duración llamadas de éxito"
        valor={segundosLegibles(r.duracionLlamadaExitoSeg)}
        reloj={relojDesdeSegundos(r.duracionLlamadaExitoSeg)}
        variacionPct={variacion(r.duracionLlamadaExitoSeg, ra?.duracionLlamadaExitoSeg)}
        ayuda={ayudaDe("kpiDuracionExito")}
      />
    </div>
  );
}
