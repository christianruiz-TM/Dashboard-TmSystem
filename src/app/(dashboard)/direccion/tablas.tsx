import { Fragment } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { FilaCliente, GrupoCampanias, TotalesCampanias } from "@/lib/direccion";
import { horasLegibles, segundosLegibles } from "@/lib/fechas";
import { cn } from "@/lib/utils";

// ============================================================
// Tablas del panel de Dirección: visión por cliente (sin cliente elegido)
// y detalle por campaña, agrupado por tipo de campaña si el cliente lo tiene.
// ============================================================

const DOS: Intl.NumberFormatOptions = { minimumFractionDigits: 2, maximumFractionDigits: 2 };
const entero = (v: number) => v.toLocaleString("es-ES");
const pct = (v: number | null) => (v == null ? "—" : `${v.toLocaleString("es-ES", DOS)} %`);

const TH = "py-2 pr-4 text-right";
const TD = "py-2 pr-4 text-right tabular-nums";

export function TablaClientes({
  filas,
  total,
  hrefCliente,
}: {
  filas: FilaCliente[];
  /** Totales globales: las horas logadas son las reales, no la suma de clientes. */
  total: Omit<FilaCliente, "servicio" | "campanias">;
  hrefCliente: (servicio: string) => string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Por cliente</CardTitle>
        <CardDescription>
          Pulsa en un cliente para ver su panel. Las horas logadas de cada cliente son las de sus
          campañas; quien está abierto a la vez en dos clientes cuenta en los dos, por eso su suma
          puede pasar del total.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-4">Cliente</th>
                <th className={TH}>Interacciones</th>
                <th className={TH} title="Llamadas que pasaron por el puesto de un agente (antes «Atendidas»)">Llamadas gestionadas</th>
                <th className={TH}>% abandono</th>
                <th className={TH}>Horas logadas</th>
                <th className={TH}>Éxitos</th>
                <th className={TH}>Finalizados</th>
                <th className="py-2 text-right">AHT medio</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.servicio ?? "(sin cliente)"} className="border-b last:border-0">
                  <td className="py-2 pr-4 font-medium">
                    {f.servicio ? (
                      <Link href={hrefCliente(f.servicio)} className="hover:underline">
                        {f.servicio}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">Sin cliente</span>
                    )}
                    <span className="ml-1 text-xs font-normal text-muted-foreground">
                      · {f.campanias} {f.campanias === 1 ? "campaña" : "campañas"}
                    </span>
                  </td>
                  <td className={TD}>{entero(f.interacciones)}</td>
                  <td className={TD}>{entero(f.atendidas)}</td>
                  <td className={TD}>{pct(f.pctAbandono)}</td>
                  <td className={TD}>{f.horasLogadas == null ? "—" : horasLegibles(f.horasLogadas)}</td>
                  <td className={cn(TD, "text-emerald-700")}>{entero(f.exitos)}</td>
                  <td className={TD}>{entero(f.finalizados)}</td>
                  <td className="py-2 text-right tabular-nums">{segundosLegibles(f.ahtSeg)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 font-semibold">
                <td className="py-2 pr-4">Total</td>
                <td className={TD}>{entero(total.interacciones)}</td>
                <td className={TD}>{entero(total.atendidas)}</td>
                <td className={TD}>{pct(total.pctAbandono)}</td>
                <td className={TD}>{total.horasLogadas == null ? "—" : horasLegibles(total.horasLogadas)}</td>
                <td className={cn(TD, "text-emerald-700")}>{entero(total.exitos)}</td>
                <td className={TD}>{entero(total.finalizados)}</td>
                <td className="py-2 text-right tabular-nums">{segundosLegibles(total.ahtSeg)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

/** Celdas numéricas comunes a una campaña y al total de un grupo. */
function CeldasDetalle({ t }: { t: TotalesCampanias }) {
  return (
    <>
      <td className={TD}>{entero(t.interacciones)}</td>
      <td className={TD}>{entero(t.atendidas)}</td>
      <td className={TD}>{entero(t.abandonadasInbound)}</td>
      <td className={cn(TD, "text-emerald-700")}>{entero(t.exitos)}</td>
      <td className={TD}>{pct(t.convContactosPct)}</td>
      <td className={TD}>{entero(t.finalizados)}</td>
      <td className={TD}>{segundosLegibles(t.ahtSeg)}</td>
      <td className="py-2 text-right tabular-nums">{horasLegibles(t.horasProductivas)}</td>
    </>
  );
}

export function TablaCampanias({ grupos }: { grupos: GrupoCampanias[] }) {
  const agrupada = grupos.some((g) => g.nombre != null);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Detalle por campaña</CardTitle>
        {agrupada ? (
          <CardDescription>
            Agrupado por tipo de campaña ({grupos.map((g) => g.nombre).join(" y ")}), con el total de
            cada grupo.
          </CardDescription>
        ) : null}
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-4">Campaña</th>
                <th className="py-2 pr-4">Tipo</th>
                <th className={TH}>Interacciones</th>
                <th className={TH} title="Llamadas que pasaron por el puesto de un agente (antes «Atendidas»)">Llamadas gestionadas</th>
                <th className={TH}>Abandonadas (entrantes)</th>
                <th className={TH}>Éxitos</th>
                <th className={TH}>Conv. contactos</th>
                <th className={TH}>Finalizados</th>
                <th className={TH}>AHT</th>
                <th className="py-2 text-right">Horas productivas</th>
              </tr>
            </thead>
            <tbody>
              {grupos.map((g) => (
                <Fragment key={g.nombre ?? "todas"}>
                  {agrupada ? (
                    <tr className="border-b bg-muted/40">
                      <td colSpan={10} className="py-2 pr-4 text-xs font-semibold uppercase tracking-wide">
                        {g.nombre} · {g.filas.length} {g.filas.length === 1 ? "campaña" : "campañas"}
                      </td>
                    </tr>
                  ) : null}
                  {g.filas.map((c) => (
                    <tr key={c.campania} className="border-b last:border-0">
                      <td className={cn("py-2 pr-4 font-medium", agrupada && "pl-4")}>{c.campania}</td>
                      <td className="py-2 pr-4 text-muted-foreground">{c.tipo ?? "—"}</td>
                      <CeldasDetalle t={{ ...c, campanias: 1 }} />
                    </tr>
                  ))}
                  {agrupada ? (
                    <tr className="border-b-2 font-semibold">
                      <td className="py-2 pr-4" colSpan={2}>
                        Total {g.nombre}
                      </td>
                      <CeldasDetalle t={g.total} />
                    </tr>
                  ) : null}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
