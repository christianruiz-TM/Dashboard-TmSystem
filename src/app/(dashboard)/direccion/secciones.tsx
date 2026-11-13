import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GraficaBarras } from "@/components/graficas/grafica-barras";
import { GraficaLineas } from "@/components/graficas/grafica-lineas";
import { CalidadBaseDatos } from "@/components/kpi/calidad-bd";
import { Callback } from "@/components/kpi/callback";
import { ComparadorCampanias } from "@/components/kpi/comparador-campanias";
import { KpisPrincipales } from "@/components/kpi/kpis-principales";
import { RatiosExito } from "@/components/kpi/ratios-exito";
import { Salientes } from "@/components/kpi/salientes";
import { TarjetaKpi } from "@/components/kpi/tarjeta-kpi";
import { calidadBaseDatos } from "@/lib/calidad-bd";
import { estadoAgregados, tendenciaConversionMensual, tendenciaMensual } from "@/lib/db/agregados";
import { METRICAS_COMPARACION, agruparPorTipo, resumenPorCliente, sumarCampanias } from "@/lib/direccion";
import { segundosLegibles } from "@/lib/fechas";
import { ayudaDe } from "@/lib/glosario";
import type { TipoCampania } from "@/lib/resultados-actividad";
import type { CargaDireccion } from "./datos";
import { TablaCampanias, TablaClientes } from "./tablas";

// ============================================================
// Bloques de Dirección (12/11/2026). Cada uno es un componente de servidor
// asíncrono que espera SOLO a sus datos (datos.ts) y va en su <Suspense> en
// la página: lo que llega antes sale antes.
// ============================================================

/** Variación porcentual entre dos valores (null si no hay base). */
function variacion(actual: number, anterior: number): number | null {
  if (anterior === 0) return null;
  return ((actual - anterior) / anterior) * 100;
}

const suma = <T,>(filas: T[], f: (x: T) => number) => filas.reduce((acc, x) => acc + f(x), 0);

/** Las 12 cajas principales (22/10/2026), las mismas que en Supervisión, con la variación. */
export async function CajasDireccion({ datos }: { datos: CargaDireccion }) {
  const [ratios, ratiosAnt, resultados, resultadosAnt] = await Promise.all([
    datos.ratios(),
    datos.ratiosAnterior(),
    datos.resultados(),
    datos.resultadosAnterior(),
  ]);
  return (
    <KpisPrincipales
      ratios={ratios.total}
      resultados={resultados}
      anterior={{ ratios: ratiosAnt.total, resultados: resultadosAnt }}
    />
  );
}

/** Interacciones, % de abandono de entrantes y AHT, con la variación. */
export async function VolumenDireccion({ datos }: { datos: CargaDireccion }) {
  const [campanias, campaniasAnt, filas] = await Promise.all([datos.volumen(), datos.volumenAnterior(), datos.filas()]);
  const total = suma(campanias, (c) => c.total);
  const totalAnt = suma(campaniasAnt, (c) => c.total);
  // % abandono SOLO de entrantes, en numerador y denominador (regla 6.b)
  const inbound = suma(campanias, (c) => c.inbound);
  const pctAbandono = inbound > 0 ? (suma(campanias, (c) => c.abandonadasInbound) / inbound) * 100 : null;
  const inboundAnt = suma(campaniasAnt, (c) => c.inbound);
  const pctAbandonoAnt = inboundAnt > 0 ? (suma(campaniasAnt, (c) => c.abandonadasInbound) / inboundAnt) * 100 : null;
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <TarjetaKpi
        titulo="Interacciones"
        valor={total.toLocaleString("es-ES")}
        variacionPct={variacion(total, totalAnt)}
        ayuda={ayudaDe("interacciones")}
      />
      <TarjetaKpi
        titulo="% Abandono inbound"
        valor={pctAbandono != null ? `${pctAbandono.toFixed(1)} %` : "—"}
        variacionPct={
          pctAbandono != null && pctAbandonoAnt != null && pctAbandonoAnt > 0 ? variacion(pctAbandono, pctAbandonoAnt) : null
        }
        invertirColor
        ayuda={ayudaDe("abandono")}
      />
      <TarjetaKpi
        titulo="AHT medio"
        valor={segundosLegibles(sumarCampanias(filas).ahtSeg)}
        invertirColor
        ayuda={ayudaDe("aht")}
      />
    </div>
  );
}

/** Visión por cliente (sin cliente elegido): una fila por cliente con su enlace. */
export async function ClientesDireccion({
  datos,
  hrefCliente,
}: {
  datos: CargaDireccion;
  hrefCliente: (servicio: string) => string;
}) {
  const [campanias, filas, horasPorServicio, unidades, ratios, horasReales] = await Promise.all([
    datos.volumen(),
    datos.filas(),
    datos.horasPorServicio(),
    datos.unidades(),
    datos.ratios(),
    datos.horasReales(),
  ]);
  const inbound = suma(campanias, (c) => c.inbound);
  const abandonadasIn = suma(campanias, (c) => c.abandonadasInbound);
  return (
    <TablaClientes
      filas={resumenPorCliente(filas, horasPorServicio)}
      total={{
        interacciones: suma(campanias, (c) => c.total),
        inbound,
        outbound: suma(filas, (f) => f.outbound),
        atendidas: suma(campanias, (c) => c.atendidas),
        abandonadasInbound: abandonadasIn,
        pctAbandono: inbound > 0 ? (abandonadasIn / inbound) * 100 : null,
        ahtSeg: sumarCampanias(filas).ahtSeg,
        horasProductivas: suma(filas, (f) => f.horasProductivas),
        // Contactos cerrados: los «contactos finalizados» de facturación
        finalizados: suma(unidades, (u) => u.leadsFinalizados),
        contactos: ratios.total.contactos,
        exitos: ratios.total.exitos,
        convContactosPct: ratios.total.convContactosPct,
        // Horas logadas REALES: no se suman por cliente (un agente en dos clientes cuenta en los dos)
        horasLogadas: horasReales.horasLogadas,
      }}
      hrefCliente={hrefCliente}
    />
  );
}

/** Tendencias de 12 meses (agregados de SQLite, sin RDBv2). */
export function TendenciasDireccion({ campanias }: { campanias: string[] | undefined }) {
  const tendencia = tendenciaMensual(12, campanias);
  // Conversión mensual desde agg_daily_agent_campaign (hasta ayer)
  const tendenciaConversion = tendenciaConversionMensual(12, campanias);
  const agregados = estadoAgregados();
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tendencia 12 meses</CardTitle>
          <CardDescription>
            {tendencia.length === 0
              ? "Sin agregados todavía: ejecuta «npm run agregados» (o espera a la tarea nocturna) para rellenar el histórico."
              : `Datos agregados hasta ${agregados.ultimaFecha ?? "—"}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <GraficaLineas
            datos={tendencia.map((t) => ({ ...t }))}
            ejeX="mes"
            series={[
              { clave: "interacciones", nombre: "Interacciones", color: "var(--chart-1)" },
              { clave: "atendidas", nombre: "Llamadas gestionadas", color: "var(--chart-3)" },
              { clave: "abandonadasInbound", nombre: "Abandonadas (entrantes)", color: "var(--chart-4)" },
            ]}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Conversión 12 meses</CardTitle>
          <CardDescription>
            {tendenciaConversion.length === 0
              ? "Sin agregados de éxitos todavía: se rellenan con «npm run agregados» (tarea de las 02:00)."
              : "Éxitos ÷ contactos gestionados y ÷ llamadas atendidas, por mes"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <GraficaLineas
            datos={tendenciaConversion.map((t) => ({ ...t }))}
            ejeX="mes"
            sufijo=" %"
            series={[
              { clave: "convContactosPct", nombre: "Conv. contactos", color: "var(--chart-1)" },
              { clave: "convAtendidasPct", nombre: "% éxito por llamada", color: "var(--chart-3)" },
            ]}
          />
        </CardContent>
      </Card>
    </div>
  );
}

/** Las 10 campañas con más interacciones del período, por origen. */
export async function Top10Direccion({ datos }: { datos: CargaDireccion }) {
  const campanias = await datos.volumen();
  const top10 = campanias.slice(0, 10).map((c) => ({ campania: c.campania, Inbound: c.inbound, Outbound: c.outbound }));
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Top 10 campañas del período</CardTitle>
        <CardDescription>Volumen de interacciones por origen</CardDescription>
      </CardHeader>
      <CardContent>
        <GraficaBarras
          datos={top10}
          ejeX="campania"
          horizontal
          alto={320}
          series={[
            { clave: "Inbound", nombre: "Inbound", color: "var(--chart-1)", apilada: true },
            { clave: "Outbound", nombre: "Outbound", color: "var(--chart-2)", apilada: true },
          ]}
        />
      </CardContent>
    </Card>
  );
}

/** Detalle por campaña (agrupado por los tipos del cliente) y el comparador. */
export async function CampaniasDireccion({
  datos,
  tipos,
  claveComparador,
}: {
  datos: CargaDireccion;
  tipos: TipoCampania[];
  /** Remonta el comparador al cambiar de cliente o de rango: las campañas elegidas pueden no estar. */
  claveComparador: string;
}) {
  const filas = await datos.filas();
  return (
    <>
      <TablaCampanias grupos={agruparPorTipo(filas, tipos)} />
      <ComparadorCampanias key={claveComparador} filas={filas} metricas={METRICAS_COMPARACION} />
    </>
  );
}

/** Rendimiento por éxitos, sin sus cajas (12/11/2026, como en Supervisión). */
export async function ExitosDireccion({ datos }: { datos: CargaDireccion }) {
  return <RatiosExito ratios={await datos.ratios()} periodo="en el período" sinTarjetas />;
}

/** KPIs de salida y calidad de la base de datos. */
export async function SalientesDireccion({ datos }: { datos: CargaDireccion }) {
  const salientes = await datos.salientes();
  return salientes ? (
    <Salientes datos={salientes} periodo="en el período" />
  ) : (
    <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
      Sin llamadas de salida en el período.
    </p>
  );
}

export async function CalidadDireccion({ datos, tipos }: { datos: CargaDireccion; tipos: TipoCampania[] }) {
  const intentos = await datos.intentos();
  return <CalidadBaseDatos datos={calidadBaseDatos(intentos.filas, intentos.contactos, tipos)} periodo="en el período" />;
}

export async function CallbackDireccion({ datos }: { datos: CargaDireccion }) {
  const callback = await datos.callback();
  return callback && callback.servicios.length > 0 ? (
    <Callback callback={callback} />
  ) : (
    <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
      Ningún cliente de lo que estás viendo tiene callback (se configura en Administración → Callback).
    </p>
  );
}
