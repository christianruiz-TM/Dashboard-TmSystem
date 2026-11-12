import type { Metadata } from "next";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { AvisoRango } from "@/components/filtros/aviso-rango";
import { SelectorRango } from "@/components/filtros/selector-rango";
import { SelectorServicioActividad } from "@/components/filtros/selector-servicio-actividad";
import { BotonInformeMiServicio } from "@/components/mi-servicio/boton-informe";
import { FiltrosMiServicio } from "@/components/mi-servicio/filtros";
import { RefrescoMiServicio } from "@/components/mi-servicio/interaccion";
import { PanelMiServicio } from "@/components/mi-servicio/panel";
import { requireRol, ROLES_MI_SERVICIO } from "@/lib/auth/rbac";
import { esquemaRango, fechaCorta, motivoRangoInvalido, presetsRango } from "@/lib/fechas";
import { servicioDeMiServicio } from "@/lib/mi-servicio/acceso";
import { cargarMiServicio } from "@/lib/mi-servicio/servidor";

// ============================================================
// «Mi servicio» (06/11/2026): el panel de un cliente, que en el futuro verán
// los propios clientes. Hoy lo usan supervisión, operaciones y dirección
// (eligen cliente: los dados de alta en Administración → Clientes con su
// servicio de Altitude) y el rol cliente, cada uno solo el suyo. Cifras:
// llamadas, finalizados, no válidos, éxitos y horas logadas, con sus ratios,
// gráficas e informe descargable. Detalle en lib/mi-servicio.
// ============================================================

export const metadata: Metadata = { title: "Mi servicio" };
export const dynamic = "force-dynamic";

export default async function PaginaMiServicio({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string; servicio?: string; tipo?: string; campania?: string }>;
}) {
  const usuario = await requireRol("cliente", ...ROLES_MI_SERVICIO);
  const params = await searchParams;
  const presets = presetsRango();
  const mes = presets.find((p) => p.etiqueta === "Mes actual")!;
  const rango = esquemaRango.safeParse({ desde: params.desde ?? mes.desde, hasta: params.hasta ?? mes.hasta });
  const { desde, hasta } = rango.success ? rango.data : mes;

  // El alcance lo decide el servidor: el cliente, siempre el suyo
  const acceso = await servicioDeMiServicio(usuario, params.servicio);

  if (!acceso.interno && !acceso.servicio) {
    return (
      <Alert>
        <AlertTitle>Cuenta sin servicio asignado</AlertTitle>
        <AlertDescription>
          {acceso.clienteSinServicio
            ? `${acceso.clienteSinServicio} aún no tiene su servicio activado.`
            : "Tu usuario no tiene ningún servicio asociado todavía."}{" "}
          Contacta con TM System para activar el acceso.
        </AlertDescription>
      </Alert>
    );
  }

  const carga = acceso.servicio
    ? await cargarMiServicio({ servicio: acceso.servicio, desde, hasta, tipo: params.tipo, campania: params.campania })
    : null;
  const periodo = desde === hasta ? `el ${fechaCorta(desde)}` : `del ${fechaCorta(desde)} al ${fechaCorta(hasta)}`;
  const filtro = carga?.datos.filtro.campania ?? carga?.datos.filtro.tipo ?? null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Mi servicio{acceso.servicio ? ` · ${acceso.servicio}` : ""}</h1>
          <p className="text-sm text-muted-foreground">
            Llamadas, contactos finalizados, éxitos y horas del equipo{acceso.servicio ? ` ${periodo}` : ""}.
          </p>
          {carga ? (
            <div className="mt-1">
              <RefrescoMiServicio enVivo={carga.enVivo} generado={carga.datos.generado} />
            </div>
          ) : null}
        </div>
        {carga && acceso.servicio ? (
          <BotonInformeMiServicio
            peticion={{
              servicio: acceso.servicio,
              desde,
              hasta,
              tipo: carga.tipo === "todas" ? null : carga.tipo,
              campania: carga.campania,
            }}
            resumen={`${acceso.servicio}, ${periodo}${filtro ? `, ${filtro}` : ""}`}
          />
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        {acceso.interno ? (
          <SelectorServicioActividad servicios={acceso.opciones} valor={acceso.servicio ?? undefined} obligatorio />
        ) : null}
        {carga ? (
          <FiltrosMiServicio
            opcionesTipo={carga.opcionesTipo}
            tipo={carga.tipo}
            campanias={carga.campaniasFiltro}
            campania={carga.campania}
          />
        ) : null}
      </div>
      <SelectorRango desde={desde} hasta={hasta} presets={presets} />
      <AvisoRango motivo={motivoRangoInvalido(rango)} alternativa="el mes en curso" />

      {!carga ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            {acceso.opciones.length === 0
              ? "Aún no hay ningún cliente dado de alta con su servicio de Altitude. Un administrador lo hace en Administración → Clientes."
              : "Elige un cliente para ver su panel."}
          </CardContent>
        </Card>
      ) : (
        <>
          {carga.campania && carga.datos.campanias.some((c) => c.horas) ? (
            <p className="rounded-md border border-amber-300/70 bg-amber-50 px-3 py-2 text-xs text-amber-950 dark:border-amber-700/60 dark:bg-amber-950/30 dark:text-amber-100">
              Con una campaña elegida, las horas son las de la ficha abierta en esa campaña: las horas logadas son de cada
              persona, que trabaja en varias campañas a la vez, y no se pueden repartir por campaña.
            </p>
          ) : null}
          <PanelMiServicio carga={carga} interno={acceso.interno} />
        </>
      )}
    </div>
  );
}
