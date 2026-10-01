import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BotonGenerar } from "@/components/planificacion/boton-generar";
import { Tablero } from "@/components/planificacion/tablero";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { puedeEditarPlan, requireRol, ROLES_PLAN_LECTURA } from "@/lib/auth/rbac";
import { hoyISO } from "@/lib/fechas";
import { lunesDe, semanasDelMes } from "@/lib/planificacion/motor";
import { bloquesConservables } from "@/lib/planificacion/repositorio";
import { nombreMes, VISTAS_TABLERO, type VistaTablero } from "@/lib/planificacion/tablero";
import { cargarTablero, mesesGenerables } from "@/lib/planificacion/vistas";
import { generarBorradorAccion } from "../acciones";
import { crearBorradorDesdePublicadaAccion, guardarCambiosAccion, publicarAccion } from "./acciones";

export const metadata: Metadata = { title: "Planificación" };
export const dynamic = "force-dynamic";

export default async function PaginaTableroMes({
  params,
  searchParams,
}: {
  params: Promise<{ mes: string }>;
  searchParams: Promise<{ vista?: string; semana?: string; dia?: string; version?: string }>;
}) {
  // Lectura: supervisión, operaciones y dirección (con nombres: roles
  // internos). Cliente, fuera. Cada página lo comprueba (el layout no basta).
  const usuario = await requireRol(...ROLES_PLAN_LECTURA);
  const { mes } = await params;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) notFound();
  const sp = await searchParams;
  const versionId = sp.version != null ? Number(sp.version) : undefined;
  if (versionId !== undefined && !Number.isInteger(versionId)) notFound();

  const editar = puedeEditarPlan(usuario.rol);
  const generable = editar && mesesGenerables().includes(mes);
  const datos = cargarTablero(mes, versionId);

  if (!datos) {
    if (versionId !== undefined) notFound();
    return (
      <div className="space-y-4">
        <div className="text-sm text-muted-foreground">
          <Link href="/planificacion" className="hover:underline">
            Planificación
          </Link>{" "}
          /
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{nombreMes(mes)}: sin plan</CardTitle>
            <CardDescription>
              {generable
                ? "Todavía no hay ninguna versión de este mes. El motor la genera con los datos cerrados hasta ayer."
                : "Todavía no hay ninguna versión de este mes."}
            </CardDescription>
          </CardHeader>
          {generable ? (
            <CardContent>
              <BotonGenerar mes={mes} nombreMes={nombreMes(mes)} borrador={null} accion={generarBorradorAccion} />
            </CardContent>
          ) : null}
        </Card>
      </div>
    );
  }

  // Semana y día iniciales: los de la URL si son del mes (el día manda sobre
  // la semana); si no, la semana de hoy (si cae en el mes) o la primera con
  // laborables
  const semanas = semanasDelMes(datos.entrada.dias);
  const hoy = hoyISO();
  const semanaHoy = semanas.find((s) => s.lunes === lunesDe(hoy))?.lunes;
  const diaUrl = datos.entrada.dias.find((d) => d.fecha === sp.dia);
  const semana =
    diaUrl?.lunes ??
    semanas.find((s) => s.lunes === sp.semana)?.lunes ??
    semanaHoy ??
    semanas.find((s) => s.laborables > 0)?.lunes ??
    semanas[0].lunes;
  const diasSemana = semanas.find((s) => s.lunes === semana)!.fechas;
  const laborable = (f: string) => datos.entrada.dias.find((d) => d.fecha === f)?.laborable;
  const dia =
    datos.entrada.dias.find((d) => d.fecha === sp.dia)?.fecha ??
    (diasSemana.includes(hoy) ? hoy : undefined) ??
    diasSemana.find(laborable) ??
    diasSemana[0];
  const vista: VistaTablero = VISTAS_TABLERO.includes(sp.vista as VistaTablero) ? (sp.vista as VistaTablero) : "agente";

  const borrador = datos.versiones.find((v) => v.estado === "borrador");
  const acciones = generable ? (
    <BotonGenerar
      key={borrador?.id ?? "nuevo"}
      mes={mes}
      nombreMes={nombreMes(mes)}
      borrador={borrador ? { numero: borrador.numero, conservables: bloquesConservables(borrador.id).length } : null}
      accion={generarBorradorAccion}
    />
  ) : null;

  return (
    <Tablero
      // Al cambiar de versión, regenerar o publicar, el tablero empieza de nuevo. Guardar
      // vuelve a pintar la página (caché del router al día) sin perder el estado de edición
      key={`${datos.version.id}-${datos.version.estado}`}
      datos={datos}
      vistaInicial={vista}
      semanaInicial={semana}
      diaInicial={dia}
      acciones={acciones}
      editable={editar && datos.version.estado === "borrador"}
      puedeEditar={editar}
      accionesServidor={
        editar
          ? { guardar: guardarCambiosAccion, publicar: publicarAccion, copiarPublicada: crearBorradorDesdePublicadaAccion }
          : undefined
      }
    />
  );
}
