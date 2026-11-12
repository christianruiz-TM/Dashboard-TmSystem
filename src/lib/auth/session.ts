import { createHash, randomBytes } from "node:crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import { and, eq, gt, lt, sql } from "drizzle-orm";
import { db } from "@/lib/db/sqlite";
import { sessions, users, type User } from "@/lib/db/schema";
import { caducidadInicial, horasMaximas, horasVentana, renovacion, sesionVigente } from "./caducidad";

// ============================================================
// Sesiones propias en SQLite + cookie httpOnly.
// - En la cookie viaja el token en claro; en BBDD solo su SHA-256.
// - Expiración deslizante: cada petición renueva si queda menos
//   de la mitad de la ventana (solo toca BBDD, no la cookie).
// - Tope absoluto de SESSION_MAX_HORAS (12 h) desde que se entró, aunque
//   haya una pestaña abierta refrescándose (11/11/2026, `caducidad.ts`).
// ============================================================

export const NOMBRE_COOKIE = "tm_sesion";

function hashearToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Crea sesión en BBDD y deja la cookie. Solo desde Server Actions. */
export async function crearSesion(userId: number, ip: string | null, userAgent: string | null) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = caducidadInicial(new Date(), horasVentana(), horasMaximas());
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
    .select({
      usuario: users,
      expiresAt: sessions.expiresAt,
      createdAt: sessions.createdAt,
      tokenHash: sessions.tokenHash,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.tokenHash, hashearToken(token)), gt(sessions.expiresAt, ahora)))
    .get();

  if (!fila || !fila.usuario.activo) return null;

  // Pasado el tope absoluto desde que se entró, fuera (y se borra)
  const maxHoras = horasMaximas();
  if (!sesionVigente(fila.expiresAt, fila.createdAt, ahora, maxHoras)) {
    db.delete(sessions).where(eq(sessions.tokenHash, fila.tokenHash)).run();
    return null;
  }

  // Renovación deslizante si queda menos de media ventana, sin pasar del tope
  const nueva = renovacion(fila.expiresAt, fila.createdAt, ahora, horasVentana(), maxHoras);
  if (nueva) {
    db.update(sessions).set({ expiresAt: nueva }).where(eq(sessions.tokenHash, fila.tokenHash)).run();
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
