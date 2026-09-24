import type { Metadata } from "next";
import { format, subMonths } from "date-fns";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GraficaBarras } from "@/components/graficas/grafica-barras";
import { GraficaLineas } from "@/components/graficas/grafica-lineas";
import { SelectorRango } from "@/components/filtros/selector-rango";
import { SelectorServicio } from "@/components/filtros/selector-servicio";
import { SelectorIvr } from "@/components/filtros/selector-ivr";
import { Glosario } from "@/components/glosario";
import { TarjetaKpi } from "@/components/kpi/tarjeta-kpi";
import { requireRol } from "@/lib/auth/rbac";
import { estadoAgregados, tendenciaMensual } from "@/lib/db/agregados";
import { segundosLegibles, esquemaRango, horasLegibles, presetsRango } from "@/lib/fechas";
import { horasAgenteReales } from "@/lib/rdb/queries/agentes";
import { unidadesPorCampania } from "@/lib/rdb/queries/facturacion";
import { volumenPorCampania } from "@/lib/rdb/queries/interacciones";
import { campaniasEfectivas, listaServicios } from "@/lib/rdb/queries/servicios";

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

  const [campanias, campaniasAnt, unidades, unidadesAnt, horasReales, horasRealesAnt] =
    await Promise.all([
      volumenPorCampania(desde, hasta, camp),
      volumenPorCampania(anterior.desde, anterior.hasta, camp),
      unidadesPorCampania(desde, hasta, camp),
      unidadesPorCampania(anterior.desde, anterior.hasta, camp),
      horasAgenteReales(desde, hasta, camp),
      horasAgenteReales(anterior.desde, anterior.hasta, camp),
    ]);
  const tendencia = tendenciaMensual(12, camp);
  const agregados = estadoAgregados();

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
  const exitos = suma(unidades, (u) => u.exitos);
  const exitosAnt = suma(unidadesAnt, (u) => u.exitos);
  const ahtMedio =
    atendidas > 0
      ? campanias.reduce((acc, c) => acc + (c.ahtSeg ?? 0) * c.atendidas, 0) / atendidas
      : null;

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

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
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
        <TarjetaKpi titulo="AHT medio" valor={segundosLegibles(ahtMedio)} invertirColor />
      </div>

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
                { clave: "abandonadas", nombre: "Abandonadas", color: "var(--chart-4)" },
              ]}
            />
          </CardContent>
        </Card>

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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Detalle por campaña</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-4">Campaña</th>
                  <th className="py-2 pr-4">Tipo</th>
                  <th className="py-2 pr-4 text-right">Interacciones</th>
                  <th className="py-2 pr-4 text-right">Atendidas</th>
                  <th className="py-2 pr-4 text-right">Abandonadas (entrantes)</th>
                  <th className="py-2 pr-4 text-right">AHT</th>
                  <th className="py-2 text-right">Horas productivas</th>
                </tr>
              </thead>
              <tbody>
                {campanias.map((c) => {
                  const u = unidades.find((x) => x.campania === c.campania);
                  return (
                    <tr key={c.campania} className="border-b last:border-0">
                      <td className="py-2 pr-4 font-medium">{c.campania}</td>
                      <td className="py-2 pr-4 text-muted-foreground">{c.tipo}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        {c.total.toLocaleString("es-ES")}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        {c.atendidas.toLocaleString("es-ES")}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        {c.abandonadasInbound.toLocaleString("es-ES")}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        {segundosLegibles(c.ahtSeg)}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {u ? horasLegibles(u.horasProductivas) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Glosario
        titulo="Dirección"
        claves={[
          "servicio",
          "interacciones",
          "atendidas",
          "abandonadas",
          "abandono",
          "aht",
          "horasLogadas",
          "horasProductivas",
          "exitos",
          "inboundOutbound",
        ]}
      />
    </div>
  );
}
