import { createHash, randomBytes } from "node:crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import { and, eq, gt, lt, sql } from "drizzle-orm";
import { db } from "@/lib/db/sqlite";
import { sessions, users, type User } from "@/lib/db/schema";

// ============================================================
// Sesiones propias en SQLite + cookie httpOnly.
// - En la cookie viaja el token en claro; en BBDD solo su SHA-256.
// - Expiración deslizante: cada petición renueva si queda menos
//   de la mitad de la ventana (solo toca BBDD, no la cookie).
// ============================================================

export const NOMBRE_COOKIE = "tm_sesion";

function horasSesion(): number {
  return Number(process.env.SESSION_HORAS ?? 8);
}

function hashearToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Crea sesión en BBDD y deja la cookie. Solo desde Server Actions. */
export async function crearSesion(userId: number, ip: string | null, userAgent: string | null) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + horasSesion() * 3600_000);
  db.insert(sessions)
    .values({ tokenHash: hashearToken(token), userId, expiresAt, ip, userAgent })
    .run();
  // Limpieza oportunista de sesiones caducadas
  db.delete(sessions).where(lt(sessions.expiresAt, new Date())).run();

  const almacen = await cookies();
  almacen.set(NOMBRE_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.COOKIE_SECURE === "1",
    path: "/",
    // Cookie de sesión persistente hasta la caducidad máxima posible;
    // la validez real la decide sessions.expires_at (deslizante)
    maxAge: 30 * 24 * 3600,
  });
}

/** Destruye la sesión actual (logout). Solo desde Server Actions. */
export async function destruirSesion() {
  const almacen = await cookies();
  const token = almacen.get(NOMBRE_COOKIE)?.value;
  if (token) {
    db.delete(sessions).where(eq(sessions.tokenHash, hashearToken(token))).run();
  }
  almacen.delete(NOMBRE_COOKIE);
}

/**
 * Usuario de la sesión actual o null. Cacheado por petición (React cache).
 * Aplica la extensión deslizante de expires_at.
 */
export const obtenerSesion = cache(async (): Promise<User | null> => {
  const almacen = await cookies();
  const token = almacen.get(NOMBRE_COOKIE)?.value;
  if (!token) return null;

  const ahora = new Date();
  const fila = db
    .select({ usuario: users, expiresAt: sessions.expiresAt, tokenHash: sessions.tokenHash })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.tokenHash, hashearToken(token)), gt(sessions.expiresAt, ahora)))
    .get();

  if (!fila || !fila.usuario.activo) return null;

  // Renovación deslizante si queda menos de media ventana
  const mitadVentanaMs = (horasSesion() * 3600_000) / 2;
  if (fila.expiresAt.getTime() - ahora.getTime() < mitadVentanaMs) {
    db.update(sessions)
      .set({ expiresAt: new Date(ahora.getTime() + horasSesion() * 3600_000) })
      .where(eq(sessions.tokenHash, fila.tokenHash))
      .run();
  }
  return fila.usuario;
});

/** Cierra TODAS las sesiones de un usuario (reset de contraseña, baja). */
export function cerrarSesionesDeUsuario(userId: number) {
  db.delete(sessions).where(eq(sessions.userId, userId)).run();
}

/** Nº de sesiones activas (panel admin). */
export function contarSesionesActivas(): number {
  const fila = db
    .select({ n: sql<number>`COUNT(*)` })
    .from(sessions)
    .where(gt(sessions.expiresAt, new Date()))
    .get();
  return fila?.n ?? 0;
}
