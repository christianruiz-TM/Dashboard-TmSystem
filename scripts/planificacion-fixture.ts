/**
 * Genera el fixture de los tests del motor: la ENTRADA real de un mes, tal
 * como la arma el cargador, congelada en JSON y versionada.
 *
 * Uso: npm run planificacion:fixture -- --mes 2026-10 --hasta-datos 2026-09-28
 *   → src/lib/planificacion/motor/__fixtures__/octubre-2026.json
 *
 * SIN NOMBRES: la entrada del motor solo lleva nº de agente. Por si acaso,
 * antes de escribir se comprueba que no aparece ningún fullname de
 * plan_agente_usuarios ni ningún alias, y si aparece se aborta.
 *
 * Regenerarlo cambia el snapshot de motor.test.ts: hay que actualizarlo con
 * `npx vitest -u` y explicar el cambio en el commit.
 */
import fs from "node:fs";
import path from "node:path";

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

function argumento(nombre: string): string | undefined {
  const i = process.argv.indexOf(`--${nombre}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  try {
    process.loadEnvFile();
  } catch {
    /* sin .env */
  }
  const mes = argumento("mes");
  const hastaDatos = argumento("hasta-datos");
  if (!mes || !/^\d{4}-\d{2}$/.test(mes) || !hastaDatos) {
    console.error("Uso: npm run planificacion:fixture -- --mes YYYY-MM --hasta-datos YYYY-MM-DD");
    process.exit(1);
  }
  const { cargarEntradaMotor } = await import("../src/lib/planificacion/cargador");
  const repo = await import("../src/lib/planificacion/repositorio");

  const entrada = await cargarEntradaMotor(mes, { hastaDatos });
  const json = JSON.stringify(entrada, null, 1);

  // Ningún nombre de persona puede acabar en el repo. Los fullname de Altitude
  // llevan pegado el cliente («Nieves X_CEFF», «María X_Caja Rural»): esas
  // palabras (códigos, nombres de cliente y prefijos) no cuentan como nombre.
  const deCliente = new Set(
    [
      ...repo.leerClientes().flatMap((c) => [c.codigo, ...c.nombre.split(/[\s·]+/)]),
      ...repo.leerPrefijos().map((p) => p.prefijo),
      "agente", "demo", "bbdd", "lexus", "renovacion", "renovación", "caja", "rural", "grupo", "pacc",
      "postventa", "creativo", "socios", "bolsas", "digital", "andalus",
    ].map((x) => x.toLowerCase()),
  );
  const nombres = [
    ...repo.leerUsuarios().map((u) => u.fullname),
    ...repo.leerAgentes().map((a) => a.alias),
  ]
    .filter((n): n is string => !!n && n.trim().length >= 4)
    .flatMap((n) => n.split(/[\s_.]+/))
    .filter((palabra) => palabra.length >= 4 && !deCliente.has(palabra.toLowerCase()));
  const encontrado = [...new Set(nombres)].find((palabra) => json.toLowerCase().includes(palabra.toLowerCase()));
  if (encontrado) {
    console.error(`El fixture contiene «${encontrado}», que parece un nombre de persona. Abortado.`);
    process.exit(1);
  }

  const [anio, m] = mes.split("-");
  const destino = path.resolve("src/lib/planificacion/motor/__fixtures__", `${MESES[Number(m) - 1]}-${anio}.json`);
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.writeFileSync(destino, `${json}\n`);
  console.log(`✔ ${path.relative(process.cwd(), destino)}: ${entrada.agentes.length} agentes, ${entrada.dias.length} días, ${(json.length / 1024).toFixed(0)} KB`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Error generando el fixture:", err instanceof Error ? err.message : err);
  process.exit(1);
});
