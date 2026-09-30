import type { Metadata } from "next";
import { AvisoMsg } from "@/components/admin/aviso-msg";
import { Campo, Casilla } from "@/components/planificacion/campos";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { requireRol, ROLES_PLAN_EDICION } from "@/lib/auth/rbac";
import { horaLarga } from "@/lib/planificacion/motor";
import {
  CLAVES_PARAMETROS,
  DESCRIPCION_PARAMETROS,
  esquemaParametrosPlan,
  leerParametrosPlan,
  type ClaveParametroPlan,
  type ParametrosPlan,
} from "@/lib/planificacion/parametros";
import { guardarParametrosPlan } from "../acciones";

export const metadata: Metadata = { title: "Parámetros de planificación" };
export const dynamic = "force-dynamic";

function valorCampo(prop: ClaveParametroPlan, p: ParametrosPlan): string {
  const v = p[prop];
  if (DESCRIPCION_PARAMETROS[prop].tipo === "hora") return horaLarga(v as number);
  return String(v);
}

export default async function PaginaParametrosPlan({
  searchParams,
}: {
  searchParams: Promise<{ msg?: string; detalle?: string }>;
}) {
  await requireRol(...ROLES_PLAN_EDICION);
  const { msg, detalle } = await searchParams;
  const p = leerParametrosPlan();
  const porDefecto = esquemaParametrosPlan.parse({});
  const props = Object.keys(DESCRIPCION_PARAMETROS) as ClaveParametroPlan[];
  const grupos = [...new Set(props.map((k) => DESCRIPCION_PARAMETROS[k].grupo))];

  return (
    <div className="space-y-6">
      <AvisoMsg msg={msg} detalle={detalle} />
      <form action={guardarParametrosPlan} className="space-y-6">
        {grupos.map((grupo) => (
          <Card key={grupo}>
            <CardHeader>
              <CardTitle className="text-base">{grupo}</CardTitle>
              {grupo === "Tablero" ? (
                <CardDescription>
                  Cambiar la franja o el horario del día vale para los borradores nuevos; los ya generados conservan los
                  suyos (van en la foto de la versión).
                </CardDescription>
              ) : null}
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-3">
                {props
                  .filter((k) => DESCRIPCION_PARAMETROS[k].grupo === grupo)
                  .map((k) => {
                    const d = DESCRIPCION_PARAMETROS[k];
                    const ayuda = (
                      <>
                        {d.ayuda} <span className="whitespace-nowrap">Por defecto: {valorCampo(k, porDefecto)}.</span>{" "}
                        <code className="text-[10px]">{CLAVES_PARAMETROS[k]}</code>
                      </>
                    );
                    if (d.tipo === "booleano") {
                      return (
                        <div key={k} className="space-y-1.5">
                          <Casilla etiqueta={d.etiqueta} name={k} defaultChecked={p[k] as boolean} />
                          <p className="text-xs text-muted-foreground">{ayuda}</p>
                        </div>
                      );
                    }
                    return (
                      <Campo key={k} etiqueta={d.etiqueta} htmlFor={k} ayuda={ayuda}>
                        <Input
                          id={k}
                          name={k}
                          type={d.tipo === "fecha" ? "date" : d.tipo === "hora" ? "time" : "text"}
                          inputMode={d.tipo === "entero" ? "numeric" : d.tipo === "decimal" ? "decimal" : undefined}
                          step={d.tipo === "hora" ? 1800 : undefined}
                          defaultValue={valorCampo(k, p)}
                          required
                        />
                      </Campo>
                    );
                  })}
              </div>
            </CardContent>
          </Card>
        ))}
        <Button type="submit">Guardar parámetros</Button>
      </form>
    </div>
  );
}
