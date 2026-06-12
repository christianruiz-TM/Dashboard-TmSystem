import bcrypt from "bcryptjs";

// bcryptjs (JS puro): evita problemas de módulos nativos en Windows Server.
// Coste 12 ≈ 100-150 ms por hash, suficiente para el volumen de logins.
const COSTE = 12;

export async function hashearPassword(password: string): Promise<string> {
  return bcrypt.hash(password, COSTE);
}

export async function verificarPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/** Política mínima de contraseñas del dashboard. */
export function validarPoliticaPassword(password: string): string | null {
  if (password.length < 10) return "La contraseña debe tener al menos 10 caracteres";
  if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) {
    return "La contraseña debe combinar letras y números";
  }
  return null;
}
