import type { Metadata } from "next";
import Link from "next/link";
import { AvisoMsg } from "@/components/admin/aviso-msg";
import { Campo, Casilla, Muestra } from "@/components/planificacion/campos";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireRol, ROLES_PLAN_EDICION } from "@/lib/auth/rbac";
import { ayerISO, fechaCorta, hoyISO } from "@/lib/fechas";
import { leerEquipo, nombresAgentes, ultimaSesionAgente } from "@/lib/planificacion/equipo";
import { leerParametrosPlan } from "@/lib/planificacion/parametros";
import * as repo from "@/lib/planificacion/repositorio";
import { guardarAgentePlan } from "../acciones";

export const metadata: Metadata = { title: "Agentes de planificación" };
export const dynamic = "force-dynamic";

export default async function PaginaAgentesPlan({
  searchParams,
}: {
  searchParams: Promise<{ msg?: string; detalle?: string; editar?: string }>;
}) {
  await requireRol(...ROLES_PLAN_EDICION);
  const { msg, detalle, editar } = await searchParams;
  const p = leerParametrosPlan();
  const eq = leerEquipo(p.equipo, ayerISO());
  const nombres = nombresAgentes(eq);
  const colorDe = new Map(repo.leerClientesTodos().map((c) => [c.codigo, c.color]));
  const patrones = new Map(repo.leerPatrones().map((x) => [x.id, x.nombre]));
  const hoy = hoyISO();
  const turnoVigente = (numero: string) =>
    repo
      .leerAsignacionesTurno()
      .filter((t) => t.agenteNumero === numero && t.desde <= hoy && (t.hasta == null || t.hasta >= hoy))
      .sort((a, b) => b.desde.localeCompare(a.desde))[0];
  const enEdicion = editar ? eq.agentes.find((a) => a.numero === editar) : undefined;

  const filas = eq.agentes.map((a) => ({
    ...a,
    nombre: nombres.get(a.numero) ?? "",
    usuarios: eq.usuarios.filter((u) => u.agenteNumero === a.numero),
    ultima: ultimaSesionAgente(eq, a.numero),
    turno: turnoVigente(a.numero),
  }));
  const plantilla = filas.filter((a) => a.enPlantilla);
  const otros = filas.filter((a) => !a.enPlantilla).sort((a, b) => (b.ultima ?? "").localeCompare(a.ultima ?? ""));

  const tabla = (lista: typeof filas) => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Agente</TableHead>
          <TableHead className="text-right">Contrato</TableHead>
          <TableHead>Usuarios de Altitude</TableHead>
          <TableHead>Última sesión</TableHead>
          <TableHead>Turno vigente (A / B)</TableHead>
          <TableHead className="text-right">Acciones</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {lista.map((a) => (
          <TableRow key={a.numero}>
            <TableCell>
              <div className="font-medium">
                {a.numero} {a.nombre}
              </div>
              <div className="flex flex-wrap gap-1 text-xs text-muted-foreground">
                {a.alias ? <span>alias</span> : null}
                {a.equipo ? <span>{a.equipo}</span> : null}
                {a.forzarActivo ? <Badge variant="outline">forzado activo</Badge> : null}
                {a.notas ? <span title={a.notas}>· {a.notas.slice(0, 40)}</span> : null}
              </div>
            </TableCell>
            <TableCell className="text-right tabular-nums">{a.contratoSemanalH != null ? `${a.contratoSemanalH} h` : "—"}</TableCell>
            <TableCell>
              <div className="flex max-w-md flex-wrap gap-1">
                {a.usuarios.map((u) => (
                  <span
                    key={u.usrName}
                    className="inline-flex items-center gap-1 rounded border px-1 font-mono text-[11px]"
                    title={u.cliente ? `Cliente ${u.cliente}` : "Prefijo sin cliente"}
                  >
                    {u.cliente ? <Muestra color={colorDe.get(u.cliente) ?? "#DDDDDD"} className="size-2.5" /> : null}
                    <span className={u.cliente ? undefined : "text-muted-foreground"}>{u.usrName}</span>
                  </span>
                ))}
              </div>
            </TableCell>
            <TableCell className="text-sm">{a.ultima ? fechaCorta(a.ultima) : "—"}</TableCell>
            <TableCell className="max-w-64 text-xs whitespace-normal">
              {a.turno ? (
                <>
                  <div>A: {a.turno.patronAId != null ? patrones.get(a.turno.patronAId) : "—"}</div>
                  <div>B: {a.turno.patronBId != null ? patrones.get(a.turno.patronBId) : "—"}</div>
                </>
              ) : (
                <span className="text-muted-foreground">sin turno</span>
              )}
            </TableCell>
            <TableCell className="text-right">
              <Button variant="outline" size="xs" render={<a href={`?editar=${a.numero}`} />}>
                Editar
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );

  return (
    <div className="space-y-6">
      <AvisoMsg msg={msg} detalle={detalle} />

      {enEdicion ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Editar {enEdicion.numero} {nombres.get(enEdicion.numero) ?? ""}
            </CardTitle>
            <CardDescription>
              El nombre sale de sus usuarios de Altitude; el alias lo sustituye en el tablero. El turno se asigna en{" "}
              <Link href="/planificacion/configuracion/patrones" className="underline">
                Patrones y turnos
              </Link>
              .
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={guardarAgentePlan} key={enEdicion.numero} className="space-y-4">
              <input type="hidden" name="numero" value={enEdicion.numero} />
              <div className="grid gap-3 md:grid-cols-4">
                <Campo etiqueta="Alias" htmlFor="alias">
                  <Input id="alias" name="alias" defaultValue={enEdicion.alias ?? ""} placeholder={nombres.get(enEdicion.numero)} />
                </Campo>
                <Campo etiqueta="Contrato semanal (h)" htmlFor="contratoSemanalH">
                  <Input
                    id="contratoSemanalH"
                    name="contratoSemanalH"
                    inputMode="decimal"
                    defaultValue={enEdicion.contratoSemanalH ?? ""}
                  />
                </Campo>
                <Campo etiqueta="Equipo" htmlFor="equipo" ayuda={`El que se planifica: ${p.equipo}.`}>
                  <Input id="equipo" name="equipo" defaultValue={enEdicion.equipo ?? p.equipo} />
                </Campo>
                <div className="flex flex-col justify-end gap-2 pb-1">
                  <Casilla etiqueta="En plantilla" name="enPlantilla" defaultChecked={enEdicion.enPlantilla} />
                  <Casilla etiqueta="Forzar activo" name="forzarActivo" defaultChecked={enEdicion.forzarActivo} />
                </div>
                <Campo etiqueta="Notas" htmlFor="notas" className="md:col-span-4">
                  <Input id="notas" name="notas" defaultValue={enEdicion.notas ?? ""} maxLength={300} />
                </Campo>
              </div>
              <p className="text-xs text-muted-foreground">
                «Forzar activo» lo planifica aunque lleve más de {p.diasInactividad} días sin sesión.
              </p>
              <div className="flex gap-2">
                <Button type="submit">Guardar</Button>
                <Button variant="outline" render={<a href="?" />}>
                  Cancelar
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Plantilla ({plantilla.length})</CardTitle>
          <CardDescription>
            Los agentes salen solos de Altitude al sincronizar (npm run planificacion:agregados); aquí se decide quién
            entra en el plan, su contrato y su alias. Las habilidades son los clientes de sus usuarios.
          </CardDescription>
        </CardHeader>
        <CardContent>{tabla(plantilla)}</CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Fuera de plantilla ({otros.length})</CardTitle>
          <CardDescription>Otros agentes con usuario de Altitude, de más reciente a más antiguo.</CardDescription>
        </CardHeader>
        <CardContent>
          <details>
            <summary className="cursor-pointer text-sm">Ver la lista</summary>
            <div className="mt-3">{tabla(otros)}</div>
          </details>
        </CardContent>
      </Card>
    </div>
  );
}
