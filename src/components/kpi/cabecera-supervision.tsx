import type { ReactNode } from "react";
import { TarjetaKpi } from "@/components/kpi/tarjeta-kpi";
import { horasLegibles, relojDesdeSegundos, segundosLegibles } from "@/lib/fechas";
import type { ResultadoRatios } from "@/lib/ratios-exito";
import type { KpiCampaniaHoy } from "@/lib/rdb/types";
import { sumarKpis } from "@/lib/supervision";

// ============================================================
// Cabecera de Supervisión (Tiempo real e Histórico, 22/10/2026, pedida por
// Christian): lo más importante en la primera vista, en filas con nombre.
//  - Equipo (solo Tiempo real): agentes Ready, no disponibles y conectados.
//  - Actividad: horas logadas, llamadas gestionadas, llamadas por hora
//    logada, AHT, éxitos con % éxito por llamada, éxitos por hora logada y
//    la gestión (script abierto) por éxito y sin éxito. Horas, llamadas por
//    hora y éxitos salen de los ratios de éxito (agentes humanos, regla 17).
//  - Entrantes: recibidas, % abandono, SLA y cola. Solo si el cliente ha
//    recibido llamadas en el período: Bolsas y Socios son de salida y la
//    fila salía siempre a 0 y «—».
// Sin hooks: sirve en el panel de cliente (Tiempo real) y en el de servidor.
// ============================================================

const DOS: Intl.NumberFormatOptions = { minimumFractionDigits: 2, maximumFractionDigits: 2 };

function num2(v: number | null): string {
  return v == null ? "—" : v.toLocaleString("es-ES", DOS);
}

function pct(v: number | null, decimales = 2): string {
  return v == null
    ? "—"
    : `${v.toLocaleString("es-ES", { minimumFractionDigits: decimales, maximumFractionDigits: decimales })} %`;
}

function entero(v: number): string {
  return v.toLocaleString("es-ES");
}

function Fila({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{titulo}</h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{children}</div>
    </section>
  );
}

export function CabeceraSupervision({
  kpis,
  ratios,
  umbral,
  periodo,
  equipo,
}: {
  kpis: KpiCampaniaHoy[];
  ratios: ResultadoRatios;
  /** Umbral del SLA en segundos. */
  umbral: number;
  /** «hoy» o «en el período», para los textos pequeños. */
  periodo: string;
  /** Solo Tiempo real: la plantilla ahora mismo. */
  equipo?: { ready: number; noDisponibles: number; conectados: number };
}) {
  const k = sumarKpis(kpis, "Total");
  const r = ratios.total;
  const pctAbandono = k.recibidas > 0 ? (k.abandonadasInbound / k.recibidas) * 100 : null;

  return (
    <div className="space-y-4">
      {equipo ? (
        <Fila titulo="Equipo ahora">
          <TarjetaKpi titulo="Agentes Ready" valor={entero(equipo.ready)} sub="Esperando llamada" />
          <TarjetaKpi titulo="No disponibles" valor={entero(equipo.noDisponibles)} sub="Not Ready ahora mismo" />
          <TarjetaKpi titulo="Conectados" valor={entero(equipo.conectados)} sub="Con sesión abierta ahora" />
        </Fila>
      ) : null}

      <Fila titulo="Actividad">
        <TarjetaKpi
          titulo="Horas logadas"
          valor={horasLegibles(r.horasLogadas)}
          sub={`De los agentes con actividad ${periodo}`}
        />
        <TarjetaKpi
          titulo="Llamadas gestionadas"
          valor={entero(k.atendidas)}
          sub={`${entero(k.conversaciones)} con conversación · ${entero(k.contactos)} contactos`}
        />
        <TarjetaKpi
          titulo="Llamadas por hora logada"
          valor={num2(r.llamadasHoraLogada)}
          sub="Llamadas gestionadas ÷ horas logadas"
        />
        <TarjetaKpi
          titulo="AHT"
          valor={segundosLegibles(k.ahtSeg)}
          reloj={relojDesdeSegundos(k.ahtSeg)}
          sub="Duración media de cada llamada"
        />
        <TarjetaKpi
          titulo="Éxitos"
          valor={entero(r.exitos)}
          sub={`${pct(r.convAtendidasPct)} por llamada · ${pct(r.convContactosPct)} por contacto`}
        />
        <TarjetaKpi titulo="Éxitos por hora logada" valor={num2(r.exitosHoraLogada)} />
        <TarjetaKpi
          titulo="Gestión por éxito"
          valor={segundosLegibles(r.gestionPorExitoSeg)}
          reloj={relojDesdeSegundos(r.gestionPorExitoSeg)}
          sub="Con el script abierto"
        />
        <TarjetaKpi
          titulo="Gestión sin éxito"
          valor={segundosLegibles(r.gestionPorNoExitoSeg)}
          reloj={relojDesdeSegundos(r.gestionPorNoExitoSeg)}
          sub="Sesiones que no acabaron en éxito"
        />
      </Fila>

      {k.recibidas > 0 ? (
        <Fila titulo="Entrantes">
          <TarjetaKpi titulo="Recibidas" valor={entero(k.recibidas)} sub={`${entero(k.atendidasInbound)} atendidas`} />
          <TarjetaKpi
            titulo="% abandono"
            valor={pct(pctAbandono, 1)}
            sub={`${entero(k.abandonadasInbound)} abandonadas`}
          />
          <TarjetaKpi titulo="SLA" valor={pct(k.slaPct, 1)} sub={`Objetivo: cola ≤ ${umbral} s`} />
          <TarjetaKpi
            titulo="Cola media (atendidas)"
            valor={segundosLegibles(k.colaMediaSeg)}
            reloj={relojDesdeSegundos(k.colaMediaSeg)}
            sub={`Abandonadas: ${segundosLegibles(k.esperaAbandonadasSeg)} de espera antes de colgar`}
          />
        </Fila>
      ) : null}
    </div>
  );
}
