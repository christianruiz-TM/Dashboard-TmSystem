import type { Metadata } from "next";
import { sql } from "drizzle-orm";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TarjetaKpi } from "@/components/kpi/tarjeta-kpi";
import { requireRol } from "@/lib/auth/rbac";
import { contarSesionesActivas } from "@/lib/auth/session";
import { estadoAgregados } from "@/lib/db/agregados";
import { db } from "@/lib/db/sqlite";
import { clients, users } from "@/lib/db/schema";
import { saludRdb } from "@/lib/rdb/queries/salud";
import { fechaCorta } from "@/lib/fechas";
import { ultimoAgregado } from "@/lib/planificacion/repositorio";
import { estadoTareaNocturna } from "@/lib/planificacion/vistas";

export const metadata: Metadata = { title: "Administración" };
export const dynamic = "force-dynamic";

function hace(iso: string | null): string {
  if (!iso) return "—";
  const minutos = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutos < 1) return "hace menos de 1 min";
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  return `hace ${horas} h ${minutos % 60} min`;
}

export default async function PaginaAdmin() {
  await requireRol(); // solo admin; el layout no basta (ver admin/layout.tsx)
  const salud = await saludRdb();
  const agregados = estadoAgregados();
  const tarea = estadoTareaNocturna();
  const planHasta = ultimoAgregado();
  const totalUsuarios = db.select({ n: sql<number>`COUNT(*)` }).from(users).get()?.n ?? 0;
  const usuariosActivos =
    db.select({ n: sql<number>`COUNT(*)` }).from(users).where(sql`activo = 1`).get()?.n ?? 0;
  const totalClientes = db.select({ n: sql<number>`COUNT(*)` }).from(clients).get()?.n ?? 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <TarjetaKpi
          titulo="Usuarios"
          valor={`${usuariosActivos}`}
          sub={`${totalUsuarios} en total (activos e inactivos)`}
        />
        <TarjetaKpi titulo="Clientes" valor={String(totalClientes)} />
        <TarjetaKpi titulo="Sesiones activas" valor={String(contarSesionesActivas())} />
        <TarjetaKpi
          titulo="Agregados hasta"
          valor={agregados.ultimaFecha ?? "—"}
          sub={
            agregados.ultimaEjecucion
              ? `Último job: ${hace(agregados.ultimaEjecucion)}`
              : "Ejecuta npm run agregados"
          }
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Estado de la conexión a RDBv2</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            {salud.mock ? (
              <Badge className="bg-amber-100 text-amber-800">Modo demo (RDB_MOCK=1)</Badge>
            ) : salud.conectado ? (
              <Badge className="bg-emerald-100 text-emerald-800">Conectado</Badge>
            ) : (
              <Badge variant="destructive">Sin conexión</Badge>
            )}
            {salud.latenciaMs != null ? (
              <span className="text-muted-foreground">Latencia: {salud.latenciaMs} ms</span>
            ) : null}
          </div>
          {salud.error ? (
            <p className="rounded-md bg-destructive/5 p-3 font-mono text-xs text-destructive">
              {salud.error}
            </p>
          ) : null}
          <div className="grid gap-2 md:grid-cols-2">
            <div className="rounded-md border p-3">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                Frescura de replicación (itr_thread)
              </div>
              <div className="mt-1 font-medium">{hace(salud.ultimaInteraccion)}</div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                Frescura de flat tables (flat_agent_login)
              </div>
              <div className="mt-1 font-medium">{hace(salud.ultimaFlat)}</div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Para validar el esquema real contra la documentación ejecuta{" "}
            <code className="rounded bg-muted px-1 py-0.5">npm run introspect</code> con las
            credenciales configuradas: genera docs/esquema-real.md.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tarea nocturna de planificación</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            {!tarea ? (
              <Badge variant="outline">Nunca ejecutada</Badge>
            ) : tarea.ok ? (
              <Badge className="bg-emerald-100 text-emerald-800">Correcta</Badge>
            ) : (
              <Badge variant="destructive">Con errores</Badge>
            )}
            {tarea ? (
              <span className="text-muted-foreground">
                {tarea.inicioTexto} ({hace(tarea.inicio)}) · {tarea.segundos.toLocaleString("es-ES")} s
                {tarea.fechaSimulada ? ` · como si fuera el ${fechaCorta(tarea.hoy)}` : ""}
              </span>
            ) : null}
            <span className="text-muted-foreground">
              · Datos de planificación hasta: {planHasta ? fechaCorta(planHasta) : "—"}
            </span>
          </div>
          {tarea ? (
            <ul className="space-y-1">
              {tarea.pasos.map((p, i) => (
                <li key={i} className={p.ok ? "" : "text-destructive"}>
                  {p.ok ? "✔" : "✖"} {p.texto}
                </li>
              ))}
            </ul>
          ) : null}
          <p className="text-xs text-muted-foreground">
            Se programa a las 02:15 (<code className="rounded bg-muted px-1 py-0.5">npm run planificacion:nocturno</code>, ver
            docs/despliegue-windows.md): agregados de ayer, el día 20 el borrador del mes siguiente y los lunes el recálculo de las
            semanas que no han empezado. Con <code className="rounded bg-muted px-1 py-0.5">--simular</code> dice qué haría sin
            escribir nada.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
