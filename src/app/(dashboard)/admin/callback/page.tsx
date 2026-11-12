import type { Metadata } from "next";
import Link from "next/link";
import { AvisoMsg } from "@/components/admin/aviso-msg";
import { SelectNativo } from "@/components/admin/select-nativo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireRol } from "@/lib/auth/rbac";
import { configCallback, ultimosTicketsCallback } from "@/lib/callback-servidor";
import { estadoCorreo } from "@/lib/correo";
import { compararTexto } from "@/lib/orden";
import { nombresCalendarios } from "@/lib/planificacion/calendarios";
import { esIvr, listaServicios } from "@/lib/rdb/queries/servicios";
import {
  correoPruebaCallback,
  guardarAlertaCallback,
  guardarServicioCallback,
  quitarServicioCallback,
} from "./acciones";

export const metadata: Metadata = { title: "Callback" };
export const dynamic = "force-dynamic";

const fecha = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

export default async function PaginaCallbackAdmin({
  searchParams,
}: {
  searchParams: Promise<{ msg?: string; detalle?: string; editar?: string }>;
}) {
  await requireRol(); // solo admin; el layout no basta (ver admin/layout.tsx)
  const { msg, detalle, editar } = await searchParams;
  const config = configCallback();
  const tickets = ultimosTicketsCallback(config);
  const correo = estadoCorreo();
  const calendarios = nombresCalendarios();
  const servicios = (await listaServicios()).slice().sort((a, b) => compararTexto(a.servicio, b.servicio));
  const editando = editar ? servicios.find((s) => s.servicio === editar) : null;
  const actual = editando ? config.servicios.find((s) => s.servicio === editando.servicio) : null;
  const campanias = editando ? editando.campanias.filter((c) => !esIvr(c)).sort(compararTexto) : [];
  // Calendario propuesto: el que ya tiene o uno con el nombre del servicio
  const calendarioPorDefecto =
    actual?.calendario ?? (editando && calendarios.includes(editando.servicio) ? editando.servicio : "");

  return (
    <div className="space-y-6">
      <AvisoMsg msg={msg} detalle={detalle} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Clientes con callback</CardTitle>
          <CardDescription>
            Cuando entra una llamada y no hay ningún agente, el IVR crea una ficha en la campaña para devolverla. Aquí se
            dice qué clientes y campañas lo tienen: Supervisión y Dirección enseñan sus fichas, cuánto se tarda en
            devolverlas y cómo acaban, y la alerta avisa si deja de funcionar. El tiempo hasta devolver se mide en el
            horario de atención de su calendario (el de Planificación → Calendarios); sin calendario, en tiempo de reloj.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {config.servicios.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ningún cliente todavía.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Calendario</TableHead>
                  <TableHead>Campañas con callback</TableHead>
                  <TableHead>Último ticket</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {config.servicios.map((s) => (
                  <TableRow key={s.servicio}>
                    <TableCell className="font-medium">{s.servicio}</TableCell>
                    <TableCell>{s.calendario ?? <span className="text-muted-foreground">Reloj</span>}</TableCell>
                    <TableCell className="max-w-md text-sm">
                      {s.campanias == null ? "Todas" : s.campanias.join(", ")}
                    </TableCell>
                    <TableCell>{tickets[s.servicio] ? fecha(tickets[s.servicio]!) : "—"}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" render={<Link href={`?editar=${encodeURIComponent(s.servicio)}`} />}>
                          Cambiar
                        </Button>
                        <form action={quitarServicioCallback}>
                          <input type="hidden" name="servicio" value={s.servicio} />
                          <Button variant="outline" size="sm" type="submit">
                            Quitar
                          </Button>
                        </form>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          <form method="get" className="flex max-w-md items-end gap-3">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="editar">{editando ? "Otro cliente" : "Añadir un cliente"}</Label>
              <SelectNativo id="editar" name="editar" defaultValue={editando?.servicio ?? ""}>
                <option value="">Elige el servicio de Altitude…</option>
                {servicios.map((s) => (
                  <option key={s.servicio} value={s.servicio}>
                    {s.servicio}
                  </option>
                ))}
              </SelectNativo>
            </div>
            <Button type="submit" variant="outline">
              Elegir
            </Button>
          </form>

          {editando ? (
            <form action={guardarServicioCallback} className="space-y-4 rounded-md border p-4">
              <input type="hidden" name="servicio" value={editando.servicio} />
              <h3 className="text-sm font-semibold">{editando.servicio}</h3>
              <div className="max-w-xs space-y-1.5">
                <Label htmlFor="calendario">Calendario (horario de atención)</Label>
                <SelectNativo id="calendario" name="calendario" defaultValue={calendarioPorDefecto}>
                  <option value="">Sin calendario: tiempo de reloj</option>
                  {calendarios.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </SelectNativo>
              </div>
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">Campañas con callback</legend>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="todas" value="1" defaultChecked={actual ? actual.campanias == null : true} />
                  Todas las campañas de agentes del servicio (también las que se creen más adelante)
                </label>
                <p className="text-xs text-muted-foreground">
                  O desmarca «Todas» y elige solo las que lo tienen (CEFF: solo Curso_maquinista).
                </p>
                <div className="grid max-h-72 gap-1 overflow-y-auto rounded-md border p-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
                  {campanias.map((c) => (
                    <label key={c} className="flex items-center gap-2">
                      <input type="checkbox" name="campania" value={c} defaultChecked={actual?.campanias?.includes(c) ?? false} />
                      {c}
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="flex gap-2">
                <Button type="submit">Guardar</Button>
                <Button variant="outline" render={<Link href="/admin/callback" />}>
                  Cancelar
                </Button>
              </div>
            </form>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Alerta «callback sin funcionar»</CardTitle>
          <CardDescription>
            Salta si un cliente acumula este número de llamadas rechazadas seguidas, en horario de atención y en campañas
            con callback, sin que el IVR cree ninguna ficha. Sale en la campana y abre un ticket mandando un correo a la
            herramienta de tickets (como mucho uno por cliente y día; la tarea programada mira cada 10 minutos, de lunes a
            sábado de 8 a 22 h). Con el callback funcionando, la racha más larga medida fue de 9 (gente que cuelga
            enseguida); en el corte de GrupoHuertas de julio a octubre de 2026 entraban unas 38 rechazadas al día.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form action={guardarAlertaCallback} className="flex flex-wrap items-end gap-3">
            <div className="w-40 space-y-1.5">
              <Label htmlFor="umbral">Rechazadas seguidas</Label>
              <Input id="umbral" name="umbral" type="number" min="1" max="500" defaultValue={config.umbralAlerta} required />
            </div>
            <div className="w-72 space-y-1.5">
              <Label htmlFor="destinatario">Correo de la herramienta de tickets</Label>
              <Input id="destinatario" name="destinatario" type="email" defaultValue={config.destinatario} required />
            </div>
            <Button type="submit">Guardar</Button>
          </form>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className={correo.configurado ? "text-muted-foreground" : "text-destructive"}>
              Servidor de correo: {correo.descripcion}
            </span>
            {correo.configurado ? (
              <form action={correoPruebaCallback}>
                <Button type="submit" variant="outline" size="sm">
                  Enviar un correo de prueba
                </Button>
              </form>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
