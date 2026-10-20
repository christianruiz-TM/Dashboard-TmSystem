import type { Metadata } from "next";
import { format, subMonths } from "date-fns";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GraficaBarras } from "@/components/graficas/grafica-barras";
import { GraficaLineas } from "@/components/graficas/grafica-lineas";
import { AvisoRango } from "@/components/filtros/aviso-rango";
import { SelectorRango } from "@/components/filtros/selector-rango";
import { SelectorServicio } from "@/components/filtros/selector-servicio";
import { SelectorIvr } from "@/components/filtros/selector-ivr";
import { Glosario } from "@/components/glosario";
import { TarjetaKpi } from "@/components/kpi/tarjeta-kpi";
import { RatiosExito } from "@/components/kpi/ratios-exito";
import { ComparadorCampanias } from "@/components/kpi/comparador-campanias";
import { requireRol } from "@/lib/auth/rbac";
import { estadoAgregados, tendenciaConversionMensual, tendenciaMensual } from "@/lib/db/agregados";
import { tiposCampaniaDe } from "@/lib/db/resultados";
import {
  METRICAS_COMPARACION,
  agruparPorTipo,
  filasCampaniaDireccion,
  resumenPorCliente,
  sumarCampanias,
} from "@/lib/direccion";
import {
  segundosLegibles,
  esquemaRango,
  horasLegibles,
  motivoRangoInvalido,
  presetsRango,
} from "@/lib/fechas";
import { horasAgenteReales, horasLogadasPorServicio } from "@/lib/rdb/queries/agentes";
import { unidadesPorCampania } from "@/lib/rdb/queries/facturacion";
import { volumenPorCampania } from "@/lib/rdb/queries/interacciones";
import { ratiosExitoRango } from "@/lib/rdb/queries/ratios-exito";
import {
  campaniasEfectivas,
  listaServicios,
  mapaCampaniaServicio,
} from "@/lib/rdb/queries/servicios";
import { TablaCampanias, TablaClientes } from "./tablas";

export const metadata: Metadata = { title: "Dirección" };
export const dynamic = "force-dynamic";

/** Variación porcentual entre dos valores (null si no hay base). */
function variacion(actual: number, anterior: number): number | null {
  if (anterior === 0) return null;
  return ((actual - anterior) / anterior) * 100;
}

/** Desplaza un rango un número de meses (para comparar con período anterior). */
function rangoAnterior(desde: string, hasta: string): { desde: string; hasta: string } {
  return {
    desde: format(subMonths(new Date(`${desde}T12:00:00`), 1), "yyyy-MM-dd"),
    hasta: format(subMonths(new Date(`${hasta}T12:00:00`), 1), "yyyy-MM-dd"),
  };
}

export default async function PaginaDireccion({
  searchParams,
}: {
  searchParams: Promise<{
    desde?: string;
    hasta?: string;
    servicio?: string;
    ivr?: string;
  }>;
}) {
  await requireRol("direccion");
  const presets = presetsRango();
  const mesActual = presets.find((p) => p.etiqueta === "Mes actual")!;
  const params = await searchParams;
  const rango = esquemaRango.safeParse({
    desde: params.desde ?? mesActual.desde,
    hasta: params.hasta ?? mesActual.hasta,
  });
  const { desde, hasta } = rango.success ? rango.data : mesActual;
  const anterior = rangoAnterior(desde, hasta);

  // Scoping por cliente/servicio; IVR excluido salvo que se marque el check
  const incluirIvr = params.ivr === "1";
  const servicios = await listaServicios();
  const camp = await campaniasEfectivas(params.servicio, incluirIvr);
  // Sin cliente elegido (o uno que no existe): visión por cliente
  const servicioElegido = servicios.some((s) => s.servicio === params.servicio)
    ? params.servicio
    : undefined;

  const [
    campanias,
    campaniasAnt,
    unidades,
    unidadesAnt,
    horasReales,
    horasRealesAnt,
    ratios,
    ratiosAnt,
    horasPorServicio,
  ] = await Promise.all([
    volumenPorCampania(desde, hasta, camp),
    volumenPorCampania(anterior.desde, anterior.hasta, camp),
    unidadesPorCampania(desde, hasta, camp),
    unidadesPorCampania(anterior.desde, anterior.hasta, camp),
    horasAgenteReales(desde, hasta, camp),
    horasAgenteReales(anterior.desde, anterior.hasta, camp),
    // Ratios de éxito en vivo, la MISMA consulta que Supervisión (regla 17)
    ratiosExitoRango(desde, hasta, camp),
    ratiosExitoRango(anterior.desde, anterior.hasta, camp),
    servicioElegido ? null : horasLogadasPorServicio(desde, hasta, camp),
  ]);
  const tendencia = tendenciaMensual(12, camp);
  // Conversión mensual desde agg_daily_agent_campaign (hasta ayer)
  const tendenciaConversion = tendenciaConversionMensual(12, camp);
  const agregados = estadoAgregados();
  // Una fila por campaña con todas sus cifras: detalle, clientes y comparador
  const filas = filasCampaniaDireccion(
    campanias,
    unidades,
    ratios.campanias,
    mapaCampaniaServicio(servicios),
  );
  // Grupos del detalle: los tipos de campaña del cliente (Bolsas: cartera y resto)
  const grupos = agruparPorTipo(filas, servicioElegido ? tiposCampaniaDe(servicioElegido) : []);

  // Totales del período y del período comparable anterior
  const suma = <T,>(filas: T[], f: (x: T) => number) => filas.reduce((acc, x) => acc + f(x), 0);
  const total = suma(campanias, (c) => c.total);
  const totalAnt = suma(campaniasAnt, (c) => c.total);
  const atendidas = suma(campanias, (c) => c.atendidas);
  // % abandono SOLO de entrantes, en numerador y denominador (regla 6.b), igual
  // que Supervisión. Con las abandonadas de todos los orígenes salía 14,89 % en
  // vez de 8,51 % (22/09/2026).
  const abandonadasIn = suma(campanias, (c) => c.abandonadasInbound);
  const inbound = suma(campanias, (c) => c.inbound);
  const pctAbandono = inbound > 0 ? (abandonadasIn / inbound) * 100 : null;
  const inboundAnt = suma(campaniasAnt, (c) => c.inbound);
  const pctAbandonoAnt =
    inboundAnt > 0
      ? (suma(campaniasAnt, (c) => c.abandonadasInbound) / inboundAnt) * 100
      : null;
  // Horas logadas REALES (unión de intervalos por agente, global). No se suma
  // por campaña: los agentes blended duplican el tiempo entre campañas.
  const horas = horasReales.horasLogadas;
  const horasAnt = horasRealesAnt.horasLogadas;
  // Éxitos de las sesiones de agente (regla 17), los mismos que el detalle,
  // la visión por cliente y «Rendimiento por éxitos»
  const exitos = ratios.total.exitos;
  const exitosAnt = ratiosAnt.total.exitos;
  // Contactos cerrados: los «contactos finalizados» de facturación
  const finalizados = suma(unidades, (u) => u.leadsFinalizados);
  const finalizadosAnt = suma(unidadesAnt, (u) => u.leadsFinalizados);
  const ahtMedio = sumarCampanias(filas).ahtSeg;
  const hrefCliente = (servicio: string) => {
    const p = new URLSearchParams({ servicio, desde, hasta });
    if (incluirIvr) p.set("ivr", "1");
    return `/direccion?${p.toString()}`;
  };

  const top10 = campanias.slice(0, 10).map((c) => ({
    campania: c.campania,
    Inbound: c.inbound,
    Outbound: c.outbound,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Dirección · Visión global</h1>
        <p className="text-sm text-muted-foreground">
          Comparativa frente al mismo rango del mes anterior ({anterior.desde} a{" "}
          {anterior.hasta})
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <SelectorRango desde={desde} hasta={hasta} presets={presets} />
        <div className="flex flex-wrap items-center gap-4">
          <SelectorServicio servicios={servicios.map((s) => s.servicio)} valor={params.servicio} />
          <SelectorIvr incluir={incluirIvr} />
        </div>
      </div>
      <AvisoRango motivo={motivoRangoInvalido(rango)} alternativa="el mes actual" />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        <TarjetaKpi
          titulo="Interacciones"
          valor={total.toLocaleString("es-ES")}
          variacionPct={variacion(total, totalAnt)}
        />
        <TarjetaKpi
          titulo="Atendidas"
          valor={atendidas.toLocaleString("es-ES")}
          sub={total > 0 ? `${((atendidas / total) * 100).toFixed(1)} % del total` : undefined}
        />
        <TarjetaKpi
          titulo="% Abandono inbound"
          valor={pctAbandono != null ? `${pctAbandono.toFixed(1)} %` : "—"}
          variacionPct={
            pctAbandono != null && pctAbandonoAnt != null && pctAbandonoAnt > 0
              ? variacion(pctAbandono, pctAbandonoAnt)
              : null
          }
          invertirColor
        />
        <TarjetaKpi
          titulo="Horas logadas (reales)"
          valor={horasLegibles(horas)}
          variacionPct={variacion(horas, horasAnt)}
          sub="Global, sin duplicar por campaña"
        />
        <TarjetaKpi
          titulo="Éxitos"
          valor={exitos.toLocaleString("es-ES")}
          variacionPct={variacion(exitos, exitosAnt)}
        />
        <TarjetaKpi
          titulo="Finalizados"
          valor={finalizados.toLocaleString("es-ES")}
          variacionPct={variacion(finalizados, finalizadosAnt)}
          sub="Contactos cerrados"
        />
        <TarjetaKpi titulo="AHT medio" valor={segundosLegibles(ahtMedio)} invertirColor />
      </div>

      {horasPorServicio ? (
        <TablaClientes
          filas={resumenPorCliente(filas, horasPorServicio)}
          total={{
            interacciones: total,
            inbound,
            outbound: suma(filas, (f) => f.outbound),
            atendidas,
            abandonadasInbound: abandonadasIn,
            pctAbandono,
            ahtSeg: ahtMedio,
            horasProductivas: suma(filas, (f) => f.horasProductivas),
            finalizados,
            contactos: ratios.total.contactos,
            exitos,
            convContactosPct: ratios.total.convContactosPct,
            horasLogadas: horas,
          }}
          hrefCliente={hrefCliente}
        />
      ) : null}

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
                { clave: "atendidas", nombre: "Atendidas", color: "var(--chart-3)" },
                {
                  clave: "abandonadasInbound",
                  nombre: "Abandonadas (entrantes)",
                  color: "var(--chart-4)",
                },
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
                { clave: "convAtendidasPct", nombre: "Conv. atendidas", color: "var(--chart-3)" },
              ]}
            />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6">
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
      </div>

      <RatiosExito ratios={ratios} periodo="en el período" anterior={ratiosAnt.total} />

      <TablaCampanias grupos={grupos} />

      <ComparadorCampanias
        // Remonta al cambiar de cliente o de rango: las campañas elegidas pueden no estar
        key={`${servicioElegido ?? "todos"}|${desde}|${hasta}|${incluirIvr ? "ivr" : ""}`}
        filas={filas}
        metricas={METRICAS_COMPARACION}
      />

      <Glosario
        titulo="Dirección"
        claves={[
          "servicio",
          "visionPorCliente",
          "interacciones",
          "atendidas",
          "abandonadas",
          "abandono",
          "aht",
          "horasLogadas",
          "horasProductivas",
          "exitos",
          "finalizados",
          "contactosGestionados",
          "conversion",
          "efectividadCierre",
          "exitosHora",
          "tiempoPorExito",
          "indiceExito",
          "inboundOutbound",
          "gruposCampania",
          "comparadorCampanias",
        ]}
      />
    </div>
  );
}
