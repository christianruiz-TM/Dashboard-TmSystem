// Lanzador de `npm test` (12/11/2026). En Windows, la terminal de VS Code abre
// el proyecto como «c:\…» (unidad en minúscula) y Vitest 5.1 carga su propio
// runtime dos veces («c:/…» y «C:/…»): todos los tests fallaban con «Cannot
// read properties of undefined (reading 'config')». Arrancado con la unidad
// en mayúscula va bien. En Linux (el servidor) es lo mismo que `vitest`.
import { spawnSync } from "node:child_process";

const cwd = process.platform === "win32" ? process.cwd().replace(/^[a-z]:/, (u) => u.toUpperCase()) : process.cwd();
// vitest.mjs no está en sus «exports»: la ruta del paquete y el fichero de su «bin»
const vitest = `${cwd}/node_modules/vitest/vitest.mjs`;
const args = process.argv.slice(2);
if (args.length === 0) args.push("run");
// Como mucho 4 procesos (12/11/2026): con los 46 de una vez y el next dev en marcha, alguno se
// caía al arrancar (código 2147483651) y faltaban ficheros en el recuento, sin ningún test fallido.
if (!args.some((a) => a.startsWith("--maxWorkers"))) args.push("--maxWorkers=4");
const r = spawnSync(process.execPath, [vitest, ...args], { cwd, stdio: "inherit" });
process.exit(r.status ?? 1);
