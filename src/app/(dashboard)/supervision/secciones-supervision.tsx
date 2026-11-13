import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Glosario } from "@/components/glosario";
import { CabeceraSupervision } from "@/components/kpi/cabecera-supervision";
import { CalidadBaseDatos } from "@/components/kpi/calidad-bd";
import { Callback } from "@/components/kpi/callback";
import { ComparadorCampanias } from "@/components/kpi/comparador-campanias";
import { RatiosExito } from "@/components/kpi/ratios-exito";
import { Salientes } from "@/components/kpi/salientes";
import { TablaAgentesSupervision } from "@/components/kpi/tabla-agentes-supervision";
import { TablaKpisCampania } from "@/components/kpi/tabla-kpis-campania";
import { TarjetaIvr } from "@/components/kpi/tarjeta-ivr";
import type { TipoCampania } from "@/lib/resultados-actividad";
import { METRICAS_SUPERVISION, agruparKpisPorTipo, filasCampaniaSupervision } from "@/lib/supervision";
import { GLOSARIO_SECCION, type SeccionSupervision } from "@/lib/supervision-secciones";
import type { DatosSupervisionPeriodo } from "@/lib/supervision-servidor";

// ============================================================
// El contenido de cada sección de Supervisión (12/11/2026), el mismo en
// Tiempo real (hoy, panel de cliente con refresco) y en Histórico (rango,
// de servidor). Sin hooks. Solo pinta la sección abierta, con los datos que
// pidió (lo demás llega a null), y debajo su glosario, con solo los términos
// que salen en ella.
// ============================================================

/** Mensaje en lugar de una sección sin datos. */
function SinDatos({ texto }: { texto: string }) {
  return <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">{texto}</p>;
}

export function SeccionPeriodo({
  seccion,
  datos,
  periodo,
  enVivo = false,
  tipos,
  servicioDe,
  titulo,
  claveComparador,
}: {
  seccion: SeccionSupervision;
  datos: DatosSupervisionPeriodo;
  /** «hoy» o «en el período»: va detrás de los títulos. */
  periodo: string;
  /** Tiempo real: el callback enseña los pendientes de ahora. */
  enVivo?: boolean;
  /** Tipos de campaña del cliente (Bolsas: cartera; GH: BBDD): agrupan la tabla de campañas. */
  tipos: TipoCampania[];
  /** Cliente de cada campaña (para el comparador sin cliente elegido). */
  servicioDe: Record<string, string>;
  /** Título del glosario. */
  titulo: string;
  /** Remonta el comparador al cambiar de cliente o de rango: las campañas elegidas pueden no estar. */
  claveComparador: string;
}) {
  const sinActividad = enVivo ? "Sin actividad registrada hoy" : "Sin actividad en el período seleccionado";
  return (
    <>
      {seccion === "resumen" ? (
        datos.kpis && datos.ratios ? (
          <CabeceraSupervision
            kpis={datos.kpis}
            ratios={datos.ratios}
            resultados={datos.resultados}
            umbral={datos.umbral}
            sinEntrantes={enVivo}
          />
        ) : null
      ) : null}

      {seccion === "agentes" && datos.top ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Productividad de agentes {periodo}</CardTitle>
          </CardHeader>
          <CardContent>
            <TablaAgentesSupervision
              agentes={datos.top}
              vacio={enVivo ? "Sin llamadas gestionadas todavía" : "Sin llamadas gestionadas en el período"}
            />
          </CardContent>
        </Card>
      ) : null}

      {seccion === "campanias" && datos.kpis && datos.ratios ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Campañas {periodo}</CardTitle>
            </CardHeader>
            <CardContent>
              <TablaKpisCampania grupos={agruparKpisPorTipo(datos.kpis, tipos)} vacio={sinActividad} />
            </CardContent>
          </Card>
          {/* En Tiempo real se recalcula con cada refresco; las campañas elegidas se mantienen */}
          <ComparadorCampanias
            key={claveComparador}
            filas={filasCampaniaSupervision(datos.kpis, datos.ratios.campanias, servicioDe)}
            metricas={METRICAS_SUPERVISION}
          />
        </>
      ) : null}

      {seccion === "exitos" && datos.ratios ? <RatiosExito ratios={datos.ratios} periodo={periodo} sinTarjetas /> : null}

      {seccion === "salientes" ? (
        <>
          {datos.salientes ? (
            <Salientes datos={datos.salientes} periodo={periodo} />
          ) : (
            <SinDatos texto={`Sin llamadas de salida ${periodo}.`} />
          )}
          {datos.calidad ? <CalidadBaseDatos datos={datos.calidad} periodo={periodo} /> : null}
        </>
      ) : null}

      {seccion === "entrantes" ? (
        <>
          {datos.ivr ? <TarjetaIvr ivr={datos.ivr} /> : null}
          {/* Solo los clientes con callback (Administración → Callback); si no hay, no sale */}
          <Callback callback={datos.callback} enVivo={enVivo} />
        </>
      ) : null}

      <Glosario titulo={titulo} claves={GLOSARIO_SECCION[seccion]} />
    </>
  );
}
