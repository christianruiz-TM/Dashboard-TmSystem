// ============================================================
// Patrones de campaña de los clientes de planificación. Son patrones LIKE
// de SQL Server ('gh_bbdd_%', 'UGR_EGRE26', 'CajaR%'): el mismo texto sirve
// para filtrar en RDBv2 (estadoListas, como parámetro) y aquí, en TS, para
// repartir las campañas de los agregados entre clientes.
// ============================================================

/**
 * Convierte un patrón LIKE en RegExp: % = cualquier cadena, _ = un carácter,
 * [..] = clase de caracteres ([_] es un guion bajo literal). Sin distinguir
 * mayúsculas, como la intercalación de RDBv2.
 */
export function patronLikeARegex(patron: string): RegExp {
  let re = "";
  for (let i = 0; i < patron.length; i++) {
    const c = patron[i];
    if (c === "%") re += ".*";
    else if (c === "_") re += ".";
    else if (c === "[") {
      const cierre = patron.indexOf("]", i + 1);
      if (cierre < 0) {
        re += "\\[";
        continue;
      }
      let clase = patron.slice(i + 1, cierre);
      if (clase.startsWith("^")) clase = `^${clase.slice(1).replace(/[\\\]]/g, "\\$&")}`;
      else clase = clase.replace(/[\\\]^]/g, "\\$&");
      re += `[${clase}]`;
      i = cierre;
    } else re += c.replace(/[.*+?^${}()|\\/]/g, "\\$&");
  }
  return new RegExp(`^${re}$`, "i");
}

export function coincideLike(shortname: string, patron: string): boolean {
  return patronLikeARegex(patron).test(shortname.trimEnd());
}

/** Caracteres literales del patrón: cuanto más, más específico. */
export function especificidad(patron: string): number {
  return patron.replace(/\[[^\]]*\]/g, "x").replace(/[%_]/g, "").length;
}

/**
 * Reparte campañas entre clientes. Si una campaña casa con varios, gana el
 * patrón más específico ('gh_bbdd_lexus%' le gana a 'gh_bbdd_%'); a
 * igualdad, el primer cliente de la lista. Así LX y BD no se pisan sin tener
 * que escribir exclusiones.
 */
export function asignarCampanias(
  campanias: readonly string[],
  clientes: readonly { codigo: string; campanias: readonly string[] }[],
): Map<string, string[]> {
  const resultado = new Map<string, string[]>(clientes.map((c) => [c.codigo, []]));
  const compilados = clientes.flatMap((c) =>
    c.campanias.map((p) => ({ codigo: c.codigo, re: patronLikeARegex(p), peso: especificidad(p) })),
  );
  for (const campania of [...campanias].sort()) {
    let mejor: { codigo: string; peso: number } | null = null;
    for (const p of compilados) {
      if (!p.re.test(campania)) continue;
      if (!mejor || p.peso > mejor.peso) mejor = { codigo: p.codigo, peso: p.peso };
    }
    if (mejor) resultado.get(mejor.codigo)!.push(campania);
  }
  return resultado;
}
