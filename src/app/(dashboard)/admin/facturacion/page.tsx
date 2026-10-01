import type { Metadata } from "next";
import { asc } from "drizzle-orm";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { AvisoMsg } from "@/components/admin/aviso-msg";
import { SelectNativo } from "@/components/admin/select-nativo";
import { requireRol } from "@/lib/auth/rbac";
import { db } from "@/lib/db/sqlite";
import { billingConfig, UNIDADES_FACTURACION } from "@/lib/db/schema";
import { umbralSlaSeg } from "@/lib/db/settings";
import { NOMBRE_UNIDAD } from "@/lib/facturacion";
import { listadoCampanias } from "@/lib/rdb/queries/campanias";
import { listaServicios } from "@/lib/rdb/queries/servicios";
import { borrarLineaFacturacion, crearLineaFacturacion, guardarUmbralSla } from "../acciones";

export const metadata: Metadata = { title: "Facturación y SLA" };
export const dynamic = "force-dynamic";

export default async function PaginaFacturacionAdmin({
  searchParams,
}: {
  searchParams: Promise<{ msg?: string }>;
}) {
  await requireRol(); // solo admin; el layout no basta (ver admin/layout.tsx)
  const { msg } = await searchParams;
  const [campanias, servicios] = await Promise.all([listadoCampanias(), listaServicios()]);
  const lineas = db
    .select()
    .from(billingConfig)
    .orderBy(asc(billingConfig.serviceName), asc(billingConfig.campaignShortname))
    .all();

  return (
    <div className="space-y-6">
      <AvisoMsg msg={msg} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Nueva línea de facturación</CardTitle>
          <CardDescription>
            Lo normal es facturar por <strong>servicio (cliente)</strong>: la línea
            aplica a todas sus campañas. Para un caso particular, elige una campaña
            concreta (excepción que prevalece sobre la del servicio). Puede haber
            varias líneas por ámbito (modelos mixtos: horas + éxitos). El precio es
            opcional: sin precio solo se muestran las unidades.
          </CardDescription>
          <CardDescription>
            <strong>Horas logadas</strong>: solo por servicio y con el prefijo de los
            usuarios del cliente. Cuenta el tiempo logado (de login a logout, haya o no
            campaña abierta) de los usuarios <code>PREFIJO_nnnn</code>: con «GH» cuentan
            GH_0851…, pero no GH_0851_BD (las bbdd se facturan por sus campañas) ni
            usuarios sin el prefijo como Angeles.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            action={crearLineaFacturacion}
            className="grid items-end gap-3 md:grid-cols-[1.3fr_1fr_110px_110px_1fr_auto]"
          >
            <div className="space-y-1.5">
              <Label>Ámbito (servicio o campaña)</Label>
              <SelectNativo name="objetivo" required>
                <optgroup label="Servicios (cliente) — todas sus campañas">
                  {servicios.map((s) => (
                    <option key={`svc:${s.servicio}`} value={`svc:${s.servicio}`}>
                      {s.servicio} ({s.campanias.length} campañas)
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Campañas (excepción puntual)">
                  {campanias.map((c) => (
                    <option key={`camp:${c.shortname}`} value={`camp:${c.shortname}`}>
                      {c.shortname} ({c.tipo})
                    </option>
                  ))}
                </optgroup>
              </SelectNativo>
            </div>
            <div className="space-y-1.5">
              <Label>Unidad facturable</Label>
              <SelectNativo name="unidad" required>
                {UNIDADES_FACTURACION.map((u) => (
                  <option key={u} value={u}>
                    {NOMBRE_UNIDAD[u]}
                  </option>
                ))}
              </SelectNativo>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="prefijo">Prefijo usuarios</Label>
              <Input
                id="prefijo"
                name="prefijo"
                placeholder="ej. GH"
                maxLength={30}
                pattern="[A-Za-z0-9]+(_[A-Za-z0-9]+)*"
                title="Solo para horas logadas: letras y números (GH, Av, Soc_Fed)"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="precio">€/unidad</Label>
              <Input id="precio" name="precio" type="number" step="0.01" min="0" placeholder="—" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="notas">Notas</Label>
              <Input id="notas" name="notas" placeholder="ej. tarifa 2026" />
            </div>
            <Button type="submit">Añadir</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Líneas configuradas ({lineas.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ámbito</TableHead>
                <TableHead>Servicio / Campaña</TableHead>
                <TableHead>Unidad</TableHead>
                <TableHead className="text-right">€/unidad</TableHead>
                <TableHead>Notas</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lineas.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    Sin configuración: en Operaciones se mostrarán todas las unidades sin importe
                  </TableCell>
                </TableRow>
              ) : (
                lineas.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell>
                      <Badge variant={l.serviceName ? "default" : "secondary"} className="text-[10px]">
                        {l.serviceName ? "Servicio" : "Campaña"}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">
                      {l.serviceName ?? l.campaignShortname}
                    </TableCell>
                    <TableCell>
                      {NOMBRE_UNIDAD[l.unidad]}
                      {l.unidad === "horas_logadas" && (
                        <span className="ml-1 text-xs text-muted-foreground">
                          · {l.prefijoUsuario ? `${l.prefijoUsuario}_nnnn` : "falta el prefijo"}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {l.precioUnitario != null
                        ? l.precioUnitario.toLocaleString("es-ES", {
                            style: "currency",
                            currency: "EUR",
                          })
                        : "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {l.notas ?? "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <form action={borrarLineaFacturacion} className="inline">
                        <input type="hidden" name="id" value={l.id} />
                        <Button variant="destructive" size="xs" type="submit">
                          Eliminar
                        </Button>
                      </form>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Umbral de SLA</CardTitle>
          <CardDescription>
            Segundos máximos de cola para contar una llamada dentro de SLA (vista
            Supervisión). Por defecto 20 s (estándar 80/20).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={guardarUmbralSla} className="flex max-w-xs items-end gap-3">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="umbral">Umbral (segundos)</Label>
              <Input
                id="umbral"
                name="umbral"
                type="number"
                min="1"
                max="600"
                defaultValue={umbralSlaSeg()}
                required
              />
            </div>
            <Button type="submit">Guardar</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
