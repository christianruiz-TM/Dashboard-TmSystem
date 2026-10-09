import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // El motor de planificación es PURO: sin I/O, sin reloj ni azar, y solo
  // date-fns y zod. Así corre igual en el servidor, en los tests y en el
  // navegador (tablero). Ver src/lib/planificacion/motor/tipos.ts. El modelo
  // de vista del tablero (tablero.ts), la edición (edicion.ts, que el
  // servidor repite al guardar), el seguimiento (adherencia, saldo y
  // alertas) y las decisiones de la tarea nocturna (nocturno.ts) siguen las
  // mismas reglas.
  {
    files: [
      "src/lib/planificacion/motor/**/*.ts",
      "src/lib/planificacion/{tablero,edicion,adherencia,saldo,alertas,nocturno}.ts",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/*", "**/lib/db/**", "**/lib/rdb/**", "**/planificacion/repositorio*", "**/planificacion/cargador*"],
              message: "El motor es puro: nada de @/lib/db, @/lib/rdb ni código de la app.",
            },
            {
              group: ["node:*", "fs", "path", "mssql", "better-sqlite3", "drizzle-orm", "next", "next/*", "react"],
              message: "El motor es puro: sin I/O ni dependencias de servidor o de React.",
            },
          ],
        },
      ],
      "no-restricted-properties": [
        "error",
        { object: "Date", property: "now", message: "El motor es determinista: la fecha de referencia va en la entrada." },
        { object: "Math", property: "random", message: "El motor es determinista: sin azar." },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: "El motor es determinista: new Date() sin argumentos lee el reloj.",
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
