"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/sqlite";
import {
  billingConfig,
  clients,
  ROLES,
  UNIDADES_FACTURACION,
  users,
} from "@/lib/db/schema";
import { obtenerSesion, cerrarSesionesDeUsuario } from "@/lib/auth/session";
import { hashearPassword, validarPoliticaPassword } from "@/lib/auth/password";
import { ipPeticion, registrarAuditoria } from "@/lib/auth/audit";
import { guardarCampaniasDeCliente } from "@/lib/db/clientes";
import { guardarAjuste } from "@/lib/db/settings";

// ============================================================
// Server Actions del área de administración. Todas exigen rol
// admin y registran auditoría.
// ============================================================

async function requireAdmin() {
  const usuario = await obtenerSesion();
  if (!usuario || usuario.rol !== "admin") {
    redirect("/login");
  }
  return usuario;
}

function volverCon(ruta: string, resultado: string): never {
  revalidatePath(ruta);
  redirect(`${ruta}?msg=${resultado}`);
}

// ---------- Usuarios ----------

const esquemaUsuario = z.object({
  username: z
    .string()
    .trim()
    .min(3)
    .max(50)
    .regex(/^[a-zA-Z0-9._-]+$/, "Usuario con caracteres no permitidos"),
  nombre: z.string().trim().min(2).max(100),
  rol: z.enum(ROLES),
  clientId: z.coerce.number().int().positive().nullable().catch(null),
});

export async function crearUsuario(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const datos = esquemaUsuario.safeParse({
    username: formData.get("username"),
    nombre: formData.get("nombre"),
    rol: formData.get("rol"),
    clientId: formData.get("clientId") || null,
  });
  const password = String(formData.get("password") ?? "");
  if (!datos.success) volverCon("/admin/usuarios", "error_datos");
  if (validarPoliticaPassword(password)) volverCon("/admin/usuarios", "error_password");
  if (datos.data.rol === "cliente" && datos.data.clientId == null) {
    volverCon("/admin/usuarios", "error_cliente");
  }

  const existe = db.select().from(users).where(eq(users.username, datos.data.username)).get();
  if (existe) volverCon("/admin/usuarios", "error_existe");

  db.insert(users)
    .values({
      username: datos.data.username,
      nombre: datos.data.nombre,
      rol: datos.data.rol,
      clientId: datos.data.rol === "cliente" ? datos.data.clientId : null,
      passwordHash: await hashearPassword(password),
      mustChangePassword: true,
    })
    .run();
  registrarAuditoria({
    accion: "crear_usuario",
    userId: admin.id,
    username: admin.username,
    detalle: `usuario=${datos.data.username} rol=${datos.data.rol}`,
    ip: await ipPeticion(),
  });
  volverCon("/admin/usuarios", "creado");
}

export async function editarUsuario(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = Number(formData.get("id"));
  const datos = esquemaUsuario.omit({ username: true }).safeParse({
    nombre: formData.get("nombre"),
    rol: formData.get("rol"),
    clientId: formData.get("clientId") || null,
  });
  if (!id || !datos.success) volverCon("/admin/usuarios", "error_datos");
  if (datos.data.rol === "cliente" && datos.data.clientId == null) {
    volverCon("/admin/usuarios", "error_cliente");
  }

  db.update(users)
    .set({
      nombre: datos.data.nombre,
      rol: datos.data.rol,
      clientId: datos.data.rol === "cliente" ? datos.data.clientId : null,
    })
    .where(eq(users.id, id))
    .run();
  registrarAuditoria({
    accion: "editar_usuario",
    userId: admin.id,
    username: admin.username,
    detalle: `id=${id} rol=${datos.data.rol}`,
    ip: await ipPeticion(),
  });
  volverCon("/admin/usuarios", "guardado");
}

export async function alternarActivoUsuario(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = Number(formData.get("id"));
  const usuario = db.select().from(users).where(eq(users.id, id)).get();
  if (!usuario) volverCon("/admin/usuarios", "error_datos");
  if (usuario.id === admin.id) volverCon("/admin/usuarios", "error_propio");

  db.update(users).set({ activo: !usuario.activo }).where(eq(users.id, id)).run();
  if (usuario.activo) cerrarSesionesDeUsuario(id); // al desactivar, fuera sesiones
  registrarAuditoria({
    accion: "editar_usuario",
    userId: admin.id,
    username: admin.username,
    detalle: `id=${id} activo=${!usuario.activo}`,
    ip: await ipPeticion(),
  });
  volverCon("/admin/usuarios", "guardado");
}

export async function resetearPassword(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = Number(formData.get("id"));
  const password = String(formData.get("password") ?? "");
  if (!id) volverCon("/admin/usuarios", "error_datos");
  if (validarPoliticaPassword(password)) volverCon("/admin/usuarios", "error_password");

  db.update(users)
    .set({ passwordHash: await hashearPassword(password), mustChangePassword: true })
    .where(eq(users.id, id))
    .run();
  cerrarSesionesDeUsuario(id);
  registrarAuditoria({
    accion: "reset_password",
    userId: admin.id,
    username: admin.username,
    detalle: `id=${id}`,
    ip: await ipPeticion(),
  });
  volverCon("/admin/usuarios", "password_reseteada");
}

// ---------- Clientes ----------

export async function crearCliente(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const nombre = String(formData.get("nombre") ?? "").trim();
  if (nombre.length < 2) volverCon("/admin/clientes", "error_datos");
  const existe = db.select().from(clients).where(eq(clients.nombre, nombre)).get();
  if (existe) volverCon("/admin/clientes", "error_existe");

  db.insert(clients).values({ nombre }).run();
  registrarAuditoria({
    accion: "crear_cliente",
    userId: admin.id,
    username: admin.username,
    detalle: nombre,
    ip: await ipPeticion(),
  });
  volverCon("/admin/clientes", "creado");
}

export async function alternarActivoCliente(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = Number(formData.get("id"));
  const cliente = db.select().from(clients).where(eq(clients.id, id)).get();
  if (!cliente) volverCon("/admin/clientes", "error_datos");

  db.update(clients).set({ activo: !cliente.activo }).where(eq(clients.id, id)).run();
  registrarAuditoria({
    accion: "editar_cliente",
    userId: admin.id,
    username: admin.username,
    detalle: `id=${id} activo=${!cliente.activo}`,
    ip: await ipPeticion(),
  });
  volverCon("/admin/clientes", "guardado");
}

export async function guardarMapeoCliente(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = Number(formData.get("id"));
  const campanias = formData.getAll("campanias").map(String);
  if (!id) volverCon("/admin/clientes", "error_datos");

  guardarCampaniasDeCliente(id, campanias);
  registrarAuditoria({
    accion: "editar_cliente",
    userId: admin.id,
    username: admin.username,
    detalle: `id=${id} campanias=${campanias.join(",") || "(ninguna)"}`,
    ip: await ipPeticion(),
  });
  revalidatePath(`/admin/clientes/${id}`);
  redirect(`/admin/clientes/${id}?msg=guardado`);
}

// ---------- Facturación y ajustes ----------

const esquemaLineaFacturacion = z.object({
  campania: z.string().trim().min(1).max(20),
  unidad: z.enum(UNIDADES_FACTURACION),
  precio: z.coerce.number().nonnegative().nullable().catch(null),
  notas: z.string().trim().max(300).nullable().catch(null),
});

export async function crearLineaFacturacion(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const datos = esquemaLineaFacturacion.safeParse({
    campania: formData.get("campania"),
    unidad: formData.get("unidad"),
    precio: formData.get("precio") || null,
    notas: formData.get("notas") || null,
  });
  if (!datos.success) volverCon("/admin/facturacion", "error_datos");

  db.insert(billingConfig)
    .values({
      campaignShortname: datos.data.campania,
      unidad: datos.data.unidad,
      precioUnitario: datos.data.precio,
      notas: datos.data.notas,
    })
    .run();
  registrarAuditoria({
    accion: "config_facturacion",
    userId: admin.id,
    username: admin.username,
    detalle: `+${datos.data.campania} ${datos.data.unidad} @${datos.data.precio ?? "s/p"}`,
    ip: await ipPeticion(),
  });
  volverCon("/admin/facturacion", "creado");
}

export async function borrarLineaFacturacion(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = Number(formData.get("id"));
  if (!id) volverCon("/admin/facturacion", "error_datos");
  db.delete(billingConfig).where(eq(billingConfig.id, id)).run();
  registrarAuditoria({
    accion: "config_facturacion",
    userId: admin.id,
    username: admin.username,
    detalle: `-linea ${id}`,
    ip: await ipPeticion(),
  });
  volverCon("/admin/facturacion", "borrado");
}

export async function guardarUmbralSla(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const valor = Number(formData.get("umbral"));
  if (!Number.isInteger(valor) || valor < 1 || valor > 600) {
    volverCon("/admin/facturacion", "error_datos");
  }
  guardarAjuste("sla_umbral_seg", String(valor));
  registrarAuditoria({
    accion: "config_facturacion",
    userId: admin.id,
    username: admin.username,
    detalle: `sla_umbral_seg=${valor}`,
    ip: await ipPeticion(),
  });
  volverCon("/admin/facturacion", "guardado");
}
