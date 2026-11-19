import type { ReactNode } from "react";
import Link from "next/link";
import { Download, Settings2, Users } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BarraPanel } from "@/components/layout/barra-panel";
import { SelectorRango } from "@/components/filtros/selector-rango";
import { SelectorServicio } from "@/components/filtros/selector-servicio";
import type { ServicioOrdenado } from "@/lib/actividad-servicios";
import { SelectorIvr } from "@/components/filtros/selector-ivr";
import { FiltroCampo } from "@/components/filtros/filtro-campo";
import { SelectorTipo } from "@/components/filtros/selector-tipo";
import { AvisoTipo } from "@/components/filtros/aviso-tipo";
import { Glosario } from "@/components/glosario";
import { ResultadosActividad } from "@/components/kpi/resultados-actividad";
import type { ResultadoRatios } from "@/lib/ratios-exito";
import type { FiltroCampo as Filtro, ResultadoResultados } from "@/lib/resultados-actividad";
import type { FiltroTipo } from "@/lib/tipo-panel";

/**
 * Supervisión → Resultados: análisis de los resultados de actividad
 * (tipificación del script) de los contactos cerrados en un rango, por
 * agente, campaña y fecha (regla 18). Siempre de UN cliente: sin cliente
 * elegido (`resultado` null) no se consulta nada y se pide que se elija.
 */
export function PanelResultados({
  pestanas,
  avisos,
  resultado,
  ratios,
  desde,
  hasta,
  presets,
  servicios,
  ordenServicios,
  servicio,
  incluirIvr,
  esAdmin,
  filtroTipo,
  horasSinFacturar,
  campo,
  urlCsv,
}: {
  /** Pestañas principales de Supervisión (Tiempo real, Histórico, Resultados). */
  pestanas: ReactNode;
  /** Avisos de la página (cliente que no existe, rango inválido), debajo de la barra. */
  avisos?: ReactNode;
  resultado: ResultadoResultados | null;
  /** Ratios de éxito del mismo alcance: las cajas de actividad de la cabecera. */
  ratios: ResultadoRatios | null;
  /**
   * Filtro por tipo de campaña (opciones vacías si el cliente no tiene tipos).
   * Desde el 17/11/2026, el mismo selector que el resto de paneles; en GH,
   * por defecto «Sin BBDD».
   */
  filtroTipo: FiltroTipo;
  /** «Solo BBDD» de GH: no se facturan por horas, pero sus horas salen igual (19/11/2026). */
  horasSinFacturar: boolean;
  desde: string;
  hasta: string;
  presets: { etiqueta: string; desde: string; hasta: string }[];
  servicios: string[];
  /** Clientes por actividad para el selector (null: en el orden de `servicios`). */
  ordenServicios?: { activos: ServicioOrdenado[]; parados: ServicioOrdenado[] };
  servicio?: string;
  incluirIvr: boolean;
  esAdmin: boolean;
  /** Dato del contacto por el que se puede filtrar (null si el cliente no tiene). */
  campo: { etiqueta: string; filtro: Filtro | null } | null;
  /** Descarga del Excel de contactos finalizados con los filtros de la vista (solo GH). */
  urlCsv: string | null;
}) {
  const sinConfigurar = resultado?.serviciosSinConfigurar ?? [];
  // Enlace a un cliente conservando rango e IVR
  const hrefCliente = (s: string) => {
    const p = new URLSearchParams({ vista: "resultados", servicio: s, desde, hasta });
    if (incluirIvr) p.set("ivr", "1");
    return `/supervision?${p.toString()}`;
  };
  return (
    <div className="space-y-6">
      {/* Barra fija (12/11/2026), como Tiempo real e Histórico; sin secciones: ya tiene pestañas dentro */}
      <BarraPanel
        pestanas={
          <>
            {pestanas}
            <SelectorRango desde={desde} hasta={hasta} presets={presets} />
          </>
        }
        filtros={
          <>
            <SelectorServicio servicios={servicios} orden={ordenServicios} valor={servicio} obligatorio />
            <SelectorIvr incluir={incluirIvr} />
            {urlCsv && resultado ? (
              <Button
                variant="outline"
                size="sm"
                render={<a href={urlCsv} download />}
                title="Los finalizados que se ven aquí, con los filtros de fechas, tipo de campaña y dato del contacto"
              >
                <Download className="h-4 w-4" /> Excel de contactos ({resultado.total.finalizados.toLocaleString("es-ES")})
              </Button>
            ) : null}
          </>
        }
      />

      {avisos}

      {servicio && filtroTipo.opciones.length > 0 ? (
        <SelectorTipo opciones={filtroTipo.opciones} valor={filtroTipo.tipo} defecto={filtroTipo.defecto} />
      ) : null}
      <AvisoTipo filtro={filtroTipo} horasSinFacturar={horasSinFacturar} />

      {campo && resultado?.valoresCampo ? (
        <FiltroCampo etiqueta={campo.etiqueta} valores={resultado.valoresCampo} filtro={campo.filtro} />
      ) : null}

      {sinConfigurar.length > 0 ? (
        <Alert>
          <Settings2 className="h-4 w-4" />
          <AlertDescription>
            <span>
              {sinConfigurar.length === 1 ? "El servicio " : "Los servicios "}
              <strong>{sinConfigurar.join(", ")}</strong>{" "}
              {sinConfigurar.length === 1 ? "no tiene" : "no tienen"} configurado qué resultados son
              «no válidos»: sale su aprovechamiento (bruto), pero no el neto ni el desglose.{" "}
              {esAdmin ? (
                <Link href="/admin/resultados" className="font-medium underline underline-offset-2">
                  Configurarlo en Administración
                </Link>
              ) : (
                "Lo configura un administrador."
              )}
            </span>
          </AlertDescription>
        </Alert>
      ) : null}

      {resultado ? (
        <ResultadosActividad r={resultado} ratios={ratios} periodo="en el período" />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4 text-muted-foreground" /> Elige un cliente
            </CardTitle>
            <CardDescription>
              Los resultados se ven siempre de un cliente. Elige uno aquí o en el selector de
              arriba.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {servicios.map((s) => (
              <Button key={s} variant="outline" size="sm" render={<Link href={hrefCliente(s)} />}>
                {s}
              </Button>
            ))}
          </CardContent>
        </Card>
      )}

      <Glosario
        titulo="Supervisión · resultados"
        claves={[
          "kpiHorasLogadas",
          "kpiLlamadas",
          "kpiFinalizados",
          "kpiExitos",
          "kpiLlamadasHora",
          "kpiLlamadasPorExito",
          "kpiFinalizadosHora",
          "kpiFinalizadosPorExito",
          "kpiDuracionNoExito",
          "kpiDuracionExito",
          "ocupacion",
          "contactabilidadFranja",
          "contactosAlcanzados",
          "rellamadas",
          "conversionIntento",
          "tiempoEsperando",
          "preparacion",
          "servicio",
          "finalizadosTipificados",
          "ratioBruto",
          "ratioNeto",
          "llamadasPorExito",
          "noValidos",
          "sinTocar",
          "cierresAdministrativos",
          "desgloseResultados",
          "agenteFrenteCampania",
          "semaforoResultados",
          "filtroCampoContacto",
          "csvContactos",
          "ivr",
        ]}
      />
    </div>
  );
}
