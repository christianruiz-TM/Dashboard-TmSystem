import type { Metadata } from "next";
import { AvisoMsg } from "@/components/admin/aviso-msg";
import { SelectNativo } from "@/components/admin/select-nativo";
import { AreaTexto, Campo, Casilla, Muestra } from "@/components/planificacion/campos";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireRol, ROLES_PLAN_EDICION } from "@/lib/auth/rbac";
import { ayerISO, fechaCorta } from "@/lib/fechas";
import { leerEquipo } from "@/lib/planificacion/equipo";
import { MODOS_CLIENTE } from "@/lib/planificacion/motor";
import { leerParametrosPlan } from "@/lib/planificacion/parametros";
import * as repo from "@/lib/planificacion/repositorio";
import { borrarPrefijoPlan, guardarClientePlan, guardarPrefijoPlan } from "../acciones";

export const metadata: Metadata = { title: "Clientes de planificación" };
export const dynamic = "force-dynamic";

const MODOS: Record<(typeof MODOS_CLIENTE)[number], string> = {
  resto: "Resto (base: se queda las horas sobrantes)",
  erlang: "Erlang (entrante: cubre su mínimo)",
  objetivo: "Objetivo (saliente: horas por lista y ritmo)",
  a_demanda: "A demanda (sin bloques)",
};

// Claves de plan_clientes.parametros (esquemaParametrosCliente en motor/tipos.ts)
const AYUDA_PARAMETROS: [string, string][] = [
  ["calendario", "ServicioDirectorio en festivos/horarios del servicio (null = sin horario propio)"],
  ["erlang", "{ ahtSeg, slaPct, umbralSeg, margen }: calcula su mínimo por franja con Erlang C"],
  ["bloques", "[{ inicioMin, finMin, bonus }]: franjas candidatas (minutos desde las 00:00: 660 = 11:00)"],
  ["evitar", "[{ inicioMin, finMin }]: franjas donde nunca se coloca"],
  ["maxHorasDiaAgente / maxHorasSeguidas / maxBloquesDiaAgente", "topes por agente y día"],
  ["pctVivosObjetivo", "% de la lista que se acepta dejar viva al acabar (UGR: 28,32)"],
  ["ritmoManual", "cierres por hora fijados a mano (null = medido)"],
  ["horasSemanaFijas", "tope semanal de horas (CEFF: 4)"],
  ["fechaFin", "último día que se planifica (YYYY-MM-DD)"],
  ["curva", "reparto entre semanas: anio_anterior · uniforme · inicio"],
  ["pesoContacto / kDia", "peso de la tasa de contacto y penalización por horas ya puestas ese día"],
];

export default async function PaginaClientesPlan({
  searchParams,
}: {
  searchParams: Promise<{ msg?: string; detalle?: string; editar?: string }>;
}) {
  await requireRol(...ROLES_PLAN_EDICION);
  const { msg, detalle, editar } = await searchParams;
  const p = leerParametrosPlan();
  const clientes = repo.leerClientesTodos();
  const eq = leerEquipo(p.equipo, ayerISO());
  const enEdicion = editar ? clientes.find((c) => c.codigo === editar) : undefined;
  const colorDe = new Map(clientes.map((c) => [c.codigo, c.color]));

  const usuariosDe = (prefijo: string, sufijo: string) =>
    eq.usuarios.filter((u) => u.prefijo.toLowerCase() === prefijo.toLowerCase() && u.sufijo.toLowerCase() === sufijo.toLowerCase());
  const sinMapear = [...new Set(eq.usuarios.filter((u) => u.cliente == null).map((u) => `${u.prefijo}|${u.sufijo}`))]
    .map((k) => {
      const [prefijo, sufijo] = k.split("|");
      const suyos = usuariosDe(prefijo, sufijo);
      const ultima = suyos.map((u) => eq.ultimas.get(u.usrName)).filter((x): x is string => !!x).sort().pop() ?? null;
      return { prefijo, sufijo, usuarios: suyos.length, ultima };
    })
    .sort((a, b) => (b.ultima ?? "").localeCompare(a.ultima ?? "") || a.prefijo.localeCompare(b.prefijo));

  const selectorCliente = (nombre: string, porDefecto?: string | null, vacio?: string) => (
    <SelectNativo name={nombre} defaultValue={porDefecto ?? ""} required={!vacio}>
      {vacio ? <option value="">{vacio}</option> : null}
      {clientes.map((c) => (
        <option key={c.codigo} value={c.codigo}>
          {c.codigo} · {c.nombre}
        </option>
      ))}
    </SelectNativo>
  );

  return (
    <div className="space-y-6">
      <AvisoMsg msg={msg} detalle={detalle} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Clientes de planificación</CardTitle>
          <CardDescription>
            Un cliente de planificación no es un servicio de Altitude: GH, su BBDD (BD) y Lexus (LX) son tres clientes del
            servicio GrupoHuertas porque se trabajan con usuarios distintos. El equipo que se planifica es «{p.equipo}».
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Modo</TableHead>
                <TableHead className="text-right">Prioridad</TableHead>
                <TableHead>Cuenta como</TableHead>
                <TableHead>Servicio · equipo</TableHead>
                <TableHead>Campañas</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clientes.map((c) => (
                <TableRow key={c.id} className={!c.activo ? "opacity-50" : undefined}>
                  <TableCell>
                    <div className="flex items-center gap-2 font-medium">
                      <Muestra color={c.color} /> {c.codigo}
                      {!c.activo ? <Badge variant="outline">inactivo</Badge> : null}
                    </div>
                    <div className="text-xs text-muted-foreground">{c.nombre}</div>
                  </TableCell>
                  <TableCell className="text-sm">{c.modo}</TableCell>
                  <TableCell className="text-right tabular-nums">{c.prioridad}</TableCell>
                  <TableCell>{c.cuentaComo ?? "—"}</TableCell>
                  <TableCell className="text-sm">
                    {c.servicioAltitude ?? "—"}
                    <div className="text-xs text-muted-foreground">{c.equipo}</div>
                  </TableCell>
                  <TableCell className="max-w-56 font-mono text-xs whitespace-normal">{c.campanias.join(", ") || "—"}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" size="xs" render={<a href={`?editar=${c.codigo}`} />}>
                      Editar
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{enEdicion ? `Editar ${enEdicion.codigo}` : "Nuevo cliente"}</CardTitle>
          <CardDescription>
            {enEdicion
              ? "El código no se puede cambiar: lo usan los bloques, los prefijos y las bolsas. Para retirarlo, desmárcalo como activo."
              : "Después, asígnale los prefijos de usuario de Altitude más abajo."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={guardarClientePlan} key={enEdicion?.codigo ?? "nuevo"} className="space-y-4">
            {enEdicion ? <input type="hidden" name="id" value={enEdicion.id} /> : null}
            <div className="grid gap-3 md:grid-cols-4">
              <Campo etiqueta="Código" htmlFor="codigo">
                <Input
                  id="codigo"
                  name="codigo"
                  defaultValue={enEdicion?.codigo}
                  disabled={!!enEdicion}
                  placeholder="p. ej. SOC"
                  required={!enEdicion}
                />
              </Campo>
              <Campo etiqueta="Nombre" htmlFor="nombre" className="md:col-span-2">
                <Input id="nombre" name="nombre" defaultValue={enEdicion?.nombre} required />
              </Campo>
              <Campo etiqueta="Color" htmlFor="color">
                <Input id="color" name="color" type="color" defaultValue={enEdicion?.color ?? "#DDDDDD"} className="h-8 p-1" />
              </Campo>
              <Campo etiqueta="Modo" className="md:col-span-2">
                <SelectNativo name="modo" defaultValue={enEdicion?.modo ?? "objetivo"}>
                  {MODOS_CLIENTE.map((m) => (
                    <option key={m} value={m}>
                      {MODOS[m]}
                    </option>
                  ))}
                </SelectNativo>
              </Campo>
              <Campo etiqueta="Prioridad" htmlFor="prioridad" ayuda="Los «objetivo» se colocan de menor a mayor.">
                <Input id="prioridad" name="prioridad" type="number" min={0} max={1000} defaultValue={enEdicion?.prioridad ?? 100} />
              </Campo>
              <Campo etiqueta="Orden en pantalla" htmlFor="orden">
                <Input id="orden" name="orden" type="number" min={0} max={1000} defaultValue={enEdicion?.orden ?? clientes.length + 1} />
              </Campo>
              <Campo etiqueta="Cuenta como" ayuda="Cuenta en la cobertura (y la bolsa) de otro cliente: BD y LX → GH.">
                {selectorCliente("cuentaComo", enEdicion?.cuentaComo, "— (ninguno)")}
              </Campo>
              <Campo etiqueta="Servicio de Altitude" htmlFor="servicioAltitude" ayuda="ph_service.name (demanda por franja).">
                <Input id="servicioAltitude" name="servicioAltitude" defaultValue={enEdicion?.servicioAltitude ?? ""} />
              </Campo>
              <Campo etiqueta="Equipo" htmlFor="equipo">
                <Input id="equipo" name="equipo" defaultValue={enEdicion?.equipo ?? p.equipo} required />
              </Campo>
              <div className="flex items-end pb-1.5">
                <Casilla etiqueta="Activo" name="activo" defaultChecked={enEdicion?.activo ?? true} />
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <Campo
                etiqueta="Campañas (patrones LIKE, uno por línea)"
                htmlFor="campanias"
                ayuda="Solo la lista EN CURSO (p. ej. UGR[_]EGRE26): las antiguas conservan vivos que nadie llama e inflan el objetivo."
              >
                <AreaTexto id="campanias" name="campanias" rows={6} defaultValue={(enEdicion?.campanias ?? []).join("\n")} />
              </Campo>
              <Campo etiqueta="Parámetros del motor (JSON)" htmlFor="parametros">
                <AreaTexto
                  id="parametros"
                  name="parametros"
                  rows={6}
                  defaultValue={JSON.stringify(enEdicion?.parametros ?? {}, null, 2)}
                  spellCheck={false}
                />
              </Campo>
            </div>
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer">Claves de los parámetros (todas opcionales)</summary>
              <ul className="mt-1 space-y-0.5">
                {AYUDA_PARAMETROS.map(([k, t]) => (
                  <li key={k}>
                    <code className="text-foreground">{k}</code>: {t}
                  </li>
                ))}
              </ul>
            </details>
            <div className="flex gap-2">
              <Button type="submit">{enEdicion ? "Guardar" : "Crear cliente"}</Button>
              {enEdicion ? (
                <Button variant="outline" render={<a href="?" />}>
                  Cancelar
                </Button>
              ) : null}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card id="prefijos">
        <CardHeader>
          <CardTitle className="text-base">Prefijos de usuario → cliente</CardTitle>
          <CardDescription>
            Cada agente tiene un usuario de Altitude por cliente (GH_0851, GH_0851_BD, UGR_0851…): el par prefijo + sufijo
            dice el cliente. Sin mayúsculas: Av y AV son el mismo.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Prefijo + sufijo</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead className="text-right">Usuarios</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...eq.prefijos]
                .sort((a, b) => a.clienteCodigo.localeCompare(b.clienteCodigo) || a.sufijo.localeCompare(b.sufijo))
                .map((x) => (
                  <TableRow key={x.id}>
                    <TableCell className="font-mono text-sm">
                      {x.prefijo}_nnnn{x.sufijo}
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1.5">
                        <Muestra color={colorDe.get(x.clienteCodigo) ?? "#DDDDDD"} /> {x.clienteCodigo}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{usuariosDe(x.prefijo, x.sufijo).length}</TableCell>
                    <TableCell className="text-right">
                      <form action={borrarPrefijoPlan}>
                        <input type="hidden" name="id" value={x.id} />
                        <Button variant="outline" size="xs" type="submit">
                          Quitar
                        </Button>
                      </form>
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>

          <form action={guardarPrefijoPlan} className="grid items-end gap-3 md:grid-cols-[1fr_1fr_1.5fr_auto]">
            <Campo etiqueta="Prefijo" htmlFor="prefijo">
              <Input id="prefijo" name="prefijo" placeholder="GH" required />
            </Campo>
            <Campo etiqueta="Sufijo (opcional)" htmlFor="sufijo">
              <Input id="sufijo" name="sufijo" placeholder="_BD" />
            </Campo>
            <Campo etiqueta="Cliente">{selectorCliente("clienteCodigo")}</Campo>
            <Button type="submit">Añadir o cambiar</Button>
          </form>

          <div className="space-y-2">
            <h3 className="text-sm font-medium">Prefijos de agentes sin cliente ({sinMapear.length})</h3>
            <p className="text-xs text-muted-foreground">
              Usuarios de agente cuyo prefijo no casa con ningún cliente: otros equipos o un cliente nuevo. Los recientes
              salen como aviso en Planificación.
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Prefijo + sufijo</TableHead>
                  <TableHead className="text-right">Usuarios</TableHead>
                  <TableHead>Última sesión</TableHead>
                  <TableHead className="text-right">Asignar a</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sinMapear.map((x) => (
                  <TableRow key={`${x.prefijo}${x.sufijo}`}>
                    <TableCell className="font-mono text-sm">
                      {x.prefijo}_nnnn{x.sufijo}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{x.usuarios}</TableCell>
                    <TableCell className="text-sm">{x.ultima ? fechaCorta(x.ultima) : "—"}</TableCell>
                    <TableCell>
                      <form action={guardarPrefijoPlan} className="flex items-center justify-end gap-2">
                        <input type="hidden" name="prefijo" value={x.prefijo} />
                        <input type="hidden" name="sufijo" value={x.sufijo} />
                        <div className="w-44">{selectorCliente("clienteCodigo")}</div>
                        <Button variant="outline" size="xs" type="submit">
                          Asignar
                        </Button>
                      </form>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
