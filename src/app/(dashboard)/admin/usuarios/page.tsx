import type { Metadata } from "next";
import { asc, eq } from "drizzle-orm";
import { Badge } from "@/components/ui/badge";
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
import { AvisoMsg } from "@/components/admin/aviso-msg";
import { SelectNativo } from "@/components/admin/select-nativo";
import { requireRol } from "@/lib/auth/rbac";
import { db } from "@/lib/db/sqlite";
import { users, ROLES } from "@/lib/db/schema";
import { listarClientes } from "@/lib/db/clientes";
import {
  alternarActivoUsuario,
  crearUsuario,
  editarUsuario,
  resetearPassword,
} from "../acciones";

export const metadata: Metadata = { title: "Usuarios" };
export const dynamic = "force-dynamic";

const NOMBRE_ROL: Record<string, string> = {
  admin: "Administrador",
  direccion: "Dirección",
  operaciones: "Operaciones",
  supervision: "Supervisión",
  cliente: "Cliente",
};

export default async function PaginaUsuarios({
  searchParams,
}: {
  searchParams: Promise<{ msg?: string; editar?: string }>;
}) {
  await requireRol(); // solo admin; el layout no basta (ver admin/layout.tsx)
  const { msg, editar } = await searchParams;
  const listaUsuarios = db.select().from(users).orderBy(asc(users.username)).all();
  const clientes = listarClientes();
  const usuarioEditar = editar
    ? db.select().from(users).where(eq(users.id, Number(editar))).get()
    : undefined;

  const selectorRoles = (porDefecto?: string) => (
    <SelectNativo name="rol" defaultValue={porDefecto ?? "supervision"} required>
      {ROLES.map((r) => (
        <option key={r} value={r}>
          {NOMBRE_ROL[r]}
        </option>
      ))}
    </SelectNativo>
  );

  const selectorClientes = (porDefecto?: number | null) => (
    <SelectNativo name="clientId" defaultValue={porDefecto ?? ""}>
      <option value="">— (solo para rol Cliente)</option>
      {clientes.map((c) => (
        <option key={c.id} value={c.id}>
          {c.nombre}
        </option>
      ))}
    </SelectNativo>
  );

  return (
    <div className="space-y-6">
      <AvisoMsg msg={msg} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {usuarioEditar ? `Editar usuario: ${usuarioEditar.username}` : "Nuevo usuario"}
          </CardTitle>
          <CardDescription>
            {usuarioEditar
              ? "Cambia nombre, rol o cliente asociado."
              : "El usuario deberá cambiar la contraseña inicial en su primer acceso."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {usuarioEditar ? (
            <form
              action={editarUsuario}
              className="grid items-end gap-3 md:grid-cols-[1fr_1fr_1fr_auto_auto]"
            >
              <input type="hidden" name="id" value={usuarioEditar.id} />
              <div className="space-y-1.5">
                <Label htmlFor="nombre">Nombre</Label>
                <Input id="nombre" name="nombre" defaultValue={usuarioEditar.nombre} required />
              </div>
              <div className="space-y-1.5">
                <Label>Rol</Label>
                {selectorRoles(usuarioEditar.rol)}
              </div>
              <div className="space-y-1.5">
                <Label>Cliente</Label>
                {selectorClientes(usuarioEditar.clientId)}
              </div>
              <Button type="submit">Guardar</Button>
              <Button variant="outline" render={<a href="/admin/usuarios" />}>
                Cancelar
              </Button>
            </form>
          ) : (
            <form
              action={crearUsuario}
              className="grid items-end gap-3 md:grid-cols-[1fr_1fr_1fr_1fr_1fr_auto]"
            >
              <div className="space-y-1.5">
                <Label htmlFor="username">Usuario</Label>
                <Input id="username" name="username" placeholder="ej. jgarcia" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="nombre">Nombre</Label>
                <Input id="nombre" name="nombre" placeholder="Nombre y apellidos" required />
              </div>
              <div className="space-y-1.5">
                <Label>Rol</Label>
                {selectorRoles()}
              </div>
              <div className="space-y-1.5">
                <Label>Cliente</Label>
                {selectorClientes()}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Contraseña inicial</Label>
                <Input
                  id="password"
                  name="password"
                  type="text"
                  placeholder="mín. 10 con letras y números"
                  required
                  minLength={10}
                />
              </div>
              <Button type="submit">Crear</Button>
            </form>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Usuarios ({listaUsuarios.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Usuario</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Último acceso</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {listaUsuarios.map((u) => (
                <TableRow key={u.id} className={!u.activo ? "opacity-50" : undefined}>
                  <TableCell>
                    <div className="font-medium">{u.nombre}</div>
                    <div className="text-xs text-muted-foreground">{u.username}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{NOMBRE_ROL[u.rol] ?? u.rol}</Badge>
                  </TableCell>
                  <TableCell className="text-sm">
                    {u.clientId ? (clientes.find((c) => c.id === u.clientId)?.nombre ?? "—") : "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {u.lastLogin
                      ? u.lastLogin.toLocaleString("es-ES", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })
                      : "Nunca"}
                    {u.mustChangePassword ? (
                      <div className="text-[10px] text-amber-600">cambio de contraseña pendiente</div>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    {u.activo ? (
                      <Badge className="bg-emerald-100 text-emerald-800">Activo</Badge>
                    ) : (
                      <Badge variant="outline">Inactivo</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <Button
                        variant="outline"
                        size="xs"
                        render={<a href={`/admin/usuarios?editar=${u.id}`} />}
                      >
                        Editar
                      </Button>
                      <form action={alternarActivoUsuario}>
                        <input type="hidden" name="id" value={u.id} />
                        <Button variant="outline" size="xs" type="submit">
                          {u.activo ? "Desactivar" : "Activar"}
                        </Button>
                      </form>
                      <form action={resetearPassword} className="flex items-center gap-1">
                        <input type="hidden" name="id" value={u.id} />
                        <Input
                          name="password"
                          type="text"
                          placeholder="nueva contraseña"
                          className="h-6 w-36 text-xs"
                          minLength={10}
                          required
                        />
                        <Button variant="outline" size="xs" type="submit">
                          Resetear
                        </Button>
                      </form>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
