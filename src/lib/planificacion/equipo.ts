// NOTA: solo servidor (SQLite). Lo comparten el cargador del motor y las
// pantallas del módulo, para que los avisos de entrada que ve supervisión en
// /planificacion sean exactamente los que luego salen al generar.
import { sumarDias } from "./motor";
import * as repo from "./repositorio";
import { nombreDesdeFullnames, resolverCliente, tokensDeUsuarios } from "./usuarios";

/**
 * Usuarios, agentes y plantilla del equipo. El cliente de cada usuario se
 * resuelve con los prefijos VIGENTES (no con el guardado al sincronizar) y la
 * última sesión sale de los agregados hasta `fechaDatos`.
 */
export function leerEquipo(equipo: string, fechaDatos: string) {
  const prefijos = repo.leerPrefijos();
  const usuarios = repo.leerUsuarios().map((u) => ({ ...u, cliente: resolverCliente(u.prefijo, u.sufijo, prefijos) }));
  const clienteDeUsuario = new Map(usuarios.map((u) => [u.usrName, u.cliente]));
  const agenteDeUsuario = new Map(usuarios.map((u) => [u.usrName, u.agenteNumero]));
  const ultimas = repo.ultimaSesionPorUsuario(fechaDatos);
  const agentes = repo.leerAgentes();
  const plantilla = agentes.filter((a) => a.enPlantilla && a.equipo === equipo);
  const numerosPlantilla = new Set(plantilla.map((a) => a.numero));
  return { equipo, fechaDatos, prefijos, usuarios, clienteDeUsuario, agenteDeUsuario, ultimas, agentes, plantilla, numerosPlantilla };
}

export type Equipo = ReturnType<typeof leerEquipo>;

/** Último día con sesión de la persona, con CUALQUIERA de sus usuarios. */
export function ultimaSesionAgente(eq: Equipo, numero: string): string | null {
  return (
    eq.usuarios
      .filter((u) => u.agenteNumero === numero)
      .map((u) => eq.ultimas.get(u.usrName))
      .filter((x): x is string => !!x)
      .sort()
      .pop() ?? null
  );
}

/** Usuarios de la plantilla, con sesión reciente, cuyo prefijo no casa con ningún cliente. */
export function prefijosSinCliente(eq: Equipo, diasInactividad: number) {
  const desdeReciente = sumarDias(eq.fechaDatos, -diasInactividad + 1);
  return eq.usuarios
    .filter((u) => eq.numerosPlantilla.has(u.agenteNumero) && u.cliente == null)
    .map((u) => ({ ...u, ultima: eq.ultimas.get(u.usrName) ?? null }))
    .filter((u) => u.ultima != null && u.ultima >= desdeReciente)
    .map((u) => ({ usrName: u.usrName, agenteNumero: u.agenteNumero, prefijo: u.prefijo, sufijo: u.sufijo, ultimaSesion: u.ultima }));
}

/** Agentes fuera de plantilla con al menos 1 h reciente en clientes del equipo. */
export function fueraDePlantilla(eq: Equipo, diasInactividad: number, codigos: ReadonlySet<string>) {
  const desdeReciente = sumarDias(eq.fechaDatos, -diasInactividad + 1);
  const recientes = new Map<string, { horas: number; clientes: Set<string> }>();
  for (const f of repo.segundosSesionPorUsuarioDia(desdeReciente, eq.fechaDatos)) {
    const c = eq.clienteDeUsuario.get(f.usrName);
    const a = eq.agenteDeUsuario.get(f.usrName);
    if (!c || !a || !codigos.has(c) || eq.numerosPlantilla.has(a)) continue;
    const r = recientes.get(a) ?? { horas: 0, clientes: new Set<string>() };
    r.horas += f.segundos / 3600;
    r.clientes.add(c);
    recientes.set(a, r);
  }
  return [...recientes.entries()]
    .filter(([, r]) => r.horas >= 1)
    .map(([agenteNumero, r]) => ({ agenteNumero, horas: Math.round(r.horas * 100) / 100, clientes: [...r.clientes].sort() }))
    .sort((a, b) => a.agenteNumero.localeCompare(b.agenteNumero));
}

/** nº de agente → nombre visible: alias de configuración o el de sus usuarios de Altitude. */
export function nombresAgentes(eq: {
  usuarios: readonly { agenteNumero: string; fullname: string | null; prefijo: string; sufijo: string }[];
  agentes: readonly { numero: string; alias: string | null }[];
}): Map<string, string> {
  const tokens = tokensDeUsuarios(eq.usuarios);
  const nombres = new Map<string, string>();
  for (const a of eq.agentes) {
    const alias = a.alias?.trim();
    const nombre =
      alias || nombreDesdeFullnames(eq.usuarios.filter((u) => u.agenteNumero === a.numero).map((u) => u.fullname), tokens);
    if (nombre) nombres.set(a.numero, nombre);
  }
  return nombres;
}
