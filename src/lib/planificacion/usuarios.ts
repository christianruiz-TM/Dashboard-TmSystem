// ============================================================
// Usuarios de Altitude de los agentes: <PREFIJO>_<nº 4 dígitos>[_SUFIJO].
// Cada agente tiene un usuario por cliente (GH_0851, GH_0851_BD,
// GH_1067_BD_LX, UGR_0851, Av_0985, Soc_Fed_0892...), así que el par
// prefijo+sufijo dice el cliente y el número, la persona. Puro.
// ============================================================

export interface UsuarioParseado {
  usrName: string;
  prefijo: string;
  numero: string;
  sufijo: string; // '' o con su guion bajo: '_BD', '_BD_LX', '_2'...
}

// El prefijo puede llevar guiones bajos (Soc_Fed): perezoso hasta el primer
// _nnnn que vaya seguido de fin o de otro _.
const PATRON = /^(.+?)_(\d{4})(_.+)?$/;

/** null si el usuario no lleva nº de agente (Angeles, TM_Carmen, 1053_KIT...). */
export function parsearUsuario(usrName: string): UsuarioParseado | null {
  const m = PATRON.exec(usrName.trim());
  if (!m) return null;
  return { usrName: usrName.trim(), prefijo: m[1], numero: m[2], sufijo: m[3] ?? "" };
}

export interface PrefijoCliente {
  prefijo: string;
  sufijo: string;
  clienteCodigo: string;
}

/**
 * Cliente de un usuario por su prefijo+sufijo exactos (sin distinguir
 * mayúsculas: Av/AV). null = prefijo sin mapear: el módulo lo avisa como
 * posible cliente nuevo.
 */
export function resolverCliente(
  prefijo: string,
  sufijo: string,
  prefijos: readonly PrefijoCliente[],
): string | null {
  const p = prefijo.toLowerCase();
  const s = sufijo.toLowerCase();
  return prefijos.find((x) => x.prefijo.toLowerCase() === p && x.sufijo.toLowerCase() === s)?.clienteCodigo ?? null;
}
