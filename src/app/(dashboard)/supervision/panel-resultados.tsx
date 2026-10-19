import Link from "next/link";
import { Settings2, Users } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SelectorRango } from "@/components/filtros/selector-rango";
import { SelectorServicio } from "@/components/filtros/selector-servicio";
import { SelectorIvr } from "@/components/filtros/selector-ivr";
import { FiltroCampo } from "@/components/filtros/filtro-campo";
import { Glosario } from "@/components/glosario";
import { ResultadosActividad } from "@/components/kpi/resultados-actividad";
import type { FiltroCampo as Filtro, ResultadoResultados, SeleccionTipo } from "@/lib/resultados-actividad";
import { cn } from "@/lib/utils";

/**
 * Supervisión → Resultados: análisis de los resultados de actividad
 * (tipificación del script) de los contactos cerrados en un rango, por
 * agente, campaña y fecha (regla 18). Siempre de UN cliente: sin cliente
 * elegido (`resultado` null) no se consulta nada y se pide que se elija.
 */
export function PanelResultados({
  resultado,
  desde,
  hasta,
  presets,
  servicios,
  servicio,
  incluirIvr,
  esAdmin,
  tipos,
  tipo,
  campo,
}: {
  resultado: ResultadoResultados | null;
  /** Opciones del selector de tipo de campaña (vacío si el cliente no tiene tipos). */
  tipos: { valor: SeleccionTipo; etiqueta: string }[];
  tipo: SeleccionTipo;
  desde: string;
  hasta: string;
  presets: { etiqueta: string; desde: string; hasta: string }[];
  servicios: string[];
  servicio?: string;
  incluirIvr: boolean;
  esAdmin: boolean;
  /** Dato del contacto por el que se puede filtrar (null si el cliente no tiene). */
  campo: { etiqueta: string; filtro: Filtro | null } | null;
}) {
  const sinConfigurar = resultado?.serviciosSinConfigurar ?? [];
  // Enlace a un cliente conservando rango e IVR
  const hrefCliente = (s: string) => {
    const p = new URLSearchParams({ vista: "resultados", servicio: s, desde, hasta });
    if (incluirIvr) p.set("ivr", "1");
    return `/supervision?${p.toString()}`;
  };
  // Enlace a un tipo de campaña del cliente elegido
  const hrefTipo = (t: SeleccionTipo) => {
    const p = new URLSearchParams({ vista: "resultados", servicio: servicio ?? "", desde, hasta });
    if (incluirIvr) p.set("ivr", "1");
    if (t !== "todas") p.set("tipo", t);
    // El filtro por un dato del contacto se mantiene al cambiar de tipo
    if (campo?.filtro) {
      if (campo.filtro.valor) p.set("campo", campo.filtro.valor);
      if (campo.filtro.modo !== "exacto") p.set("modo", campo.filtro.modo);
    }
    return `/supervision?${p.toString()}`;
  };
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Supervisión · resultados de actividad</h1>
        <p className="text-sm text-muted-foreground">
          Ratios bruto y neto de los contactos cerrados del {desde} al {hasta}, por agente, campaña
          y fecha
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <SelectorRango desde={desde} hasta={hasta} presets={presets} />
        <div className="flex flex-wrap items-center gap-4">
          <SelectorServicio servicios={servicios} valor={servicio} obligatorio />
          <SelectorIvr incluir={incluirIvr} />
        </div>
      </div>

      {servicio && tipos.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Tipo de campaña:</span>
          <div className="inline-flex flex-wrap gap-1 rounded-lg bg-muted p-1">
            {tipos.map((o) => (
              <Link
                key={o.valor}
                href={hrefTipo(o.valor)}
                aria-current={o.valor === tipo ? "page" : undefined}
                className={cn(
                  "rounded-md px-3 py-1 font-medium transition-colors",
                  o.valor === tipo
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {o.etiqueta}
              </Link>
            ))}
          </div>
        </div>
      ) : null}

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
              «no válidos»: sale su ratio bruto, pero no el neto ni el desglose.{" "}
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
        <ResultadosActividad r={resultado} periodo="en el período" />
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
          "servicio",
          "finalizadosTipificados",
          "ratioBruto",
          "ratioNeto",
          "noValidos",
          "sinTocar",
          "cierresAdministrativos",
          "desgloseResultados",
          "agenteFrenteCampania",
          "semaforoResultados",
          "filtroCampoContacto",
          "ivr",
        ]}
      />
    </div>
  );
}
