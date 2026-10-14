import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AvisoMsg } from "@/components/admin/aviso-msg";
import { SelectNativo } from "@/components/admin/select-nativo";
import { requireRol } from "@/lib/auth/rbac";
import { configsResultados, objetivosDeResultados, tiposCampaniaDe } from "@/lib/db/resultados";
import { presetsRango } from "@/lib/fechas";
import { MAX_NIVELES, escribirTiposCampania, tipoDeCampania } from "@/lib/resultados-actividad";
import { listadoCampanias } from "@/lib/rdb/queries/campanias";
import {
  configValida,
  etiquetaColumna,
  resultadosActividadRango,
  tablasResultados,
  valoresColumnaResultados,
} from "@/lib/rdb/queries/resultados-actividad";
import { campaniasEfectivas, listaServicios } from "@/lib/rdb/queries/servicios";
import {
  borrarConfigResultados,
  borrarObjetivoResultados,
  crearObjetivoResultados,
  guardarColumnasResultados,
  guardarNoValidos,
  guardarTiposCampaniaAccion,
} from "./acciones";

export const metadata: Metadata = { title: "Resultados de actividad" };
export const dynamic = "force-dynamic";

const DOS: Intl.NumberFormatOptions = { minimumFractionDigits: 2, maximumFractionDigits: 2 };
const pct = (v: number | null) => (v == null ? "—" : `${v.toLocaleString("es-ES", DOS)} %`);

export default async function PaginaResultadosAdmin({
  searchParams,
}: {
  searchParams: Promise<{ msg?: string; servicio?: string; tabla?: string }>;
}) {
  await requireRol(); // solo admin; el layout no basta (ver admin/layout.tsx)
  const params = await searchParams;
  const [tablas, campanias] = await Promise.all([tablasResultados(), listadoCampanias()]);
  const configs = configsResultados();
  const objetivos = objetivosDeResultados();
  const servicios = [...new Set(tablas.map((t) => t.servicio))].sort((a, b) => a.localeCompare(b));

  // Servicio en edición (?servicio=) y su tabla
  const servicio = servicios.includes(params.servicio ?? "") ? params.servicio! : null;
  const config = servicio ? configs.find((c) => c.serviceName === servicio) : undefined;
  const tablasServicio = tablas.filter((t) => t.servicio === servicio);
  const tabla =
    tablasServicio.find((t) => t.tabla === params.tabla) ??
    tablasServicio.find((t) => t.tabla === config?.tablaAo) ??
    tablasServicio[0];
  const columnasConfig = config && tabla && config.tablaAo === tabla.tabla ? config.columnas : [];

  // Tipos de campaña del servicio y en qué tipo cae cada campaña suya
  const tipos = servicio ? tiposCampaniaDe(servicio) : [];
  const campaniasServicio = servicio
    ? ((await listaServicios()).find((s) => s.servicio === servicio)?.campanias ?? [])
    : [];
  const porTipo = new Map<string, string[]>();
  for (const c of campaniasServicio) {
    const t = tipoDeCampania(c, tipos) ?? "";
    porTipo.set(t, [...(porTipo.get(t) ?? []), c]);
  }

  // Valores de cada columna configurada (para marcar los «no válidos»)
  const valores = tabla
    ? await Promise.all(columnasConfig.map(async (c) => ({ columna: c, valores: await valoresColumnaResultados(tabla.tabla, c) })))
    : [];

  // Vista previa: el mes anterior con la configuración guardada
  const mesAnterior = presetsRango().find((p) => p.etiqueta === "Mes anterior")!;
  const previa =
    servicio && config && configValida(config, tablas)
      ? await resultadosActividadRango(
          mesAnterior.desde,
          mesAnterior.hasta,
          await campaniasEfectivas(servicio, false),
          [config],
          [],
        )
      : null;

  return (
    <div className="space-y-6">
      <AvisoMsg msg={params.msg} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Resultados de actividad por servicio</CardTitle>
          <CardDescription>
            Cada servicio guarda la tipificación del script en su tabla <code>ao_…</code> de la
            centralita, con columnas propias (resultado, subresultado, motivo…). Aquí se elige qué
            columnas se analizan en Supervisión → Resultados (en orden: el primer nivel es el
            resultado y el segundo, su detalle) y qué valores son «no válidos» para el ratio
            neto. Sin configurar, el servicio solo tiene ratio bruto.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Servicio</TableHead>
                <TableHead>Tabla</TableHead>
                <TableHead>Niveles</TableHead>
                <TableHead className="text-right">Valores no válidos</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {servicios.map((s) => {
                const c = configs.find((x) => x.serviceName === s);
                const valida = c ? configValida(c, tablas) : false;
                return (
                  <TableRow key={s} className={s === servicio ? "bg-muted/50" : undefined}>
                    <TableCell className="font-medium">{s}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {c?.tablaAo ?? tablas.filter((t) => t.servicio === s).map((t) => t.tabla).join(", ")}
                    </TableCell>
                    <TableCell className="text-sm">
                      {c ? (
                        valida ? (
                          c.columnas.map(etiquetaColumna).join(" → ")
                        ) : (
                          <Badge variant="destructive" className="text-[10px]">
                            La tabla o una columna ya no existe
                          </Badge>
                        )
                      ) : (
                        <span className="text-muted-foreground">Sin configurar</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{c ? c.codigosNoValidos.length : "—"}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="outline" size="xs" render={<Link href={`/admin/resultados?servicio=${encodeURIComponent(s)}`} />}>
                        {c ? "Editar" : "Configurar"}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {servicio && tabla ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Configurar {servicio}</CardTitle>
            <CardDescription>
              Paso 1: elige las columnas y guarda. Paso 2: marca los valores que son «no
              válidos» (teléfono erróneo, duplicado, no es el titular…) y guarda. Abajo se ve
              cómo quedan las cifras del mes anterior.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {tablasServicio.length > 1 ? (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-muted-foreground">Este servicio tiene varias tablas:</span>
                {tablasServicio.map((t) => (
                  <Button
                    key={t.tabla}
                    variant={t.tabla === tabla.tabla ? "default" : "outline"}
                    size="xs"
                    render={
                      <Link
                        href={`/admin/resultados?servicio=${encodeURIComponent(servicio)}&tabla=${encodeURIComponent(t.tabla)}`}
                      />
                    }
                  >
                    {t.tabla}
                  </Button>
                ))}
              </div>
            ) : null}

            <form action={guardarColumnasResultados} className="space-y-3">
              <input type="hidden" name="servicio" value={servicio} />
              <input type="hidden" name="tabla" value={tabla.tabla} />
              <div className="grid gap-3 md:grid-cols-[repeat(3,minmax(0,1fr))_auto] md:items-end">
                {Array.from({ length: MAX_NIVELES }, (_, i) => (
                  <div key={i} className="space-y-1.5">
                    <Label htmlFor={`nivel${i + 1}`}>
                      Nivel {i + 1}
                      {i === 0 ? " (resultado)" : " (opcional)"}
                    </Label>
                    <SelectNativo
                      id={`nivel${i + 1}`}
                      name={`nivel${i + 1}`}
                      defaultValue={columnasConfig[i] ?? ""}
                      required={i === 0}
                    >
                      <option value="">—</option>
                      {tabla.columnas.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </SelectNativo>
                  </div>
                ))}
                <Button type="submit">Guardar columnas</Button>
              </div>
            </form>

            {columnasConfig.length > 0 ? (
              <form action={guardarNoValidos} className="space-y-3">
                <input type="hidden" name="servicio" value={servicio} />
                <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                  {valores.map(({ columna, valores: lista }) => (
                    <fieldset key={columna} className="space-y-1.5">
                      <legend className="mb-1 text-sm font-medium">
                        {etiquetaColumna(columna)}{" "}
                        <span className="font-normal text-muted-foreground">(veces usado en total)</span>
                      </legend>
                      {lista.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Esta columna no tiene valores.</p>
                      ) : (
                        lista.map((v) => (
                          <label key={v.codigo} className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              name="nv"
                              value={v.codigo}
                              defaultChecked={config?.codigosNoValidos.includes(v.codigo)}
                            />
                            <span>{v.nombre}</span>
                            <span className="ml-auto tabular-nums text-muted-foreground">
                              {v.contactos.toLocaleString("es-ES")}
                            </span>
                          </label>
                        ))
                      )}
                    </fieldset>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Un contacto es «no válido» si CUALQUIERA de sus columnas lleva un valor marcado:
                  sirve tanto si el servicio lo pone en el resultado como en el subresultado.
                </p>
                <Button type="submit">Guardar no válidos</Button>
              </form>
            ) : null}

            <form action={guardarTiposCampaniaAccion} className="space-y-3 rounded-lg border p-4">
              <input type="hidden" name="servicio" value={servicio} />
              <div className="space-y-1.5">
                <Label htmlFor="tipos" className="text-sm font-medium">
                  Tipos de campaña (opcional)
                </Label>
                <p className="text-xs text-muted-foreground">
                  Para separar los resultados en Supervisión con un selector («Todas · Sin BBDD · Solo
                  BBDD»). Una línea por tipo: <code>Nombre: patrón, patrón</code>. En el patrón,{" "}
                  <code>%</code> es cualquier texto; por ejemplo <code>BBDD: gh_bbdd_%</code>. Si una
                  campaña casa con dos tipos, cuenta en el primero. Vacío = sin tipos.
                </p>
                <textarea
                  id="tipos"
                  name="tipos"
                  rows={3}
                  defaultValue={escribirTiposCampania(tipos)}
                  placeholder="BBDD: gh_bbdd_%"
                  className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 font-mono text-sm"
                />
              </div>
              {tipos.length > 0 ? (
                <ul className="space-y-1 text-xs">
                  {[...tipos.map((t) => t.nombre), ""].map((t) => {
                    const lista = porTipo.get(t) ?? [];
                    return (
                      <li key={t || "resto"}>
                        <span className="font-medium">{t || (tipos.length === 1 ? `Sin ${tipos[0].nombre}` : "Resto")}</span>{" "}
                        <span className="text-muted-foreground">
                          ({lista.length}): {lista.length > 0 ? lista.join(", ") : "ninguna campaña"}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
              <Button type="submit" size="sm">
                Guardar tipos
              </Button>
            </form>

            {previa ? (
              <div className="rounded-lg border p-4">
                <div className="mb-2 text-sm font-medium">
                  Vista previa: {servicio}, mes anterior ({mesAnterior.desde} a {mesAnterior.hasta}), sin IVR
                </div>
                <dl className="grid grid-cols-2 gap-3 text-sm md:grid-cols-5">
                  <div>
                    <dt className="text-muted-foreground">Finalizados</dt>
                    <dd className="tabular-nums">{previa.total.finalizados.toLocaleString("es-ES")}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Éxitos</dt>
                    <dd className="tabular-nums">{previa.total.exitos.toLocaleString("es-ES")}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">No válidos</dt>
                    <dd className="tabular-nums">
                      {previa.total.noValidos.toLocaleString("es-ES")} ({pct(previa.total.noValidosPct)})
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Ratio bruto</dt>
                    <dd className="tabular-nums">{pct(previa.total.brutoPct)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Ratio neto</dt>
                    <dd className="tabular-nums">{pct(previa.total.netoPct)}</dd>
                  </div>
                </dl>
              </div>
            ) : null}

            {config ? (
              <form action={borrarConfigResultados}>
                <input type="hidden" name="servicio" value={servicio} />
                <Button variant="destructive" size="xs" type="submit">
                  Quitar la configuración de {servicio}
                </Button>
              </form>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Objetivos (semáforo)</CardTitle>
          <CardDescription>
            Lo normal es por servicio; una campaña concreta prevalece sobre su servicio. Los tres
            umbrales son opcionales (rellena al menos uno). Verde si se cumple, ámbar si se queda a
            menos de un 10 % y rojo si no llega. Sin «hasta», vale indefinidamente.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <form
            action={crearObjetivoResultados}
            className="grid items-end gap-3 md:grid-cols-[1.4fr_repeat(3,110px)_repeat(2,150px)_1fr_auto]"
          >
            <div className="space-y-1.5">
              <Label>Ámbito</Label>
              <SelectNativo name="objetivo" required>
                <optgroup label="Servicios (cliente): todas sus campañas">
                  {servicios.map((s) => (
                    <option key={`svc:${s}`} value={`svc:${s}`}>
                      {s}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Campañas (excepción)">
                  {campanias.map((c) => (
                    <option key={`camp:${c.shortname}`} value={`camp:${c.shortname}`}>
                      {c.shortname}
                    </option>
                  ))}
                </optgroup>
              </SelectNativo>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="brutoMin">Bruto ≥ %</Label>
              <Input id="brutoMin" name="brutoMin" type="number" step="0.01" min="0" max="100" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="netoMin">Neto ≥ %</Label>
              <Input id="netoMin" name="netoMin" type="number" step="0.01" min="0" max="100" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="maxPctNoValidos">No válidos ≤ %</Label>
              <Input id="maxPctNoValidos" name="maxPctNoValidos" type="number" step="0.01" min="0" max="100" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="desde">Desde</Label>
              <Input id="desde" name="desde" type="date" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="hasta">Hasta</Label>
              <Input id="hasta" name="hasta" type="date" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="notas">Notas</Label>
              <Input id="notas" name="notas" placeholder="ej. acordado con el cliente" />
            </div>
            <Button type="submit">Añadir</Button>
          </form>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ámbito</TableHead>
                <TableHead>Servicio / Campaña</TableHead>
                <TableHead className="text-right">Bruto ≥</TableHead>
                <TableHead className="text-right">Neto ≥</TableHead>
                <TableHead className="text-right">No válidos ≤</TableHead>
                <TableHead>Vigencia</TableHead>
                <TableHead>Notas</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {objetivos.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground">
                    Sin objetivos: Supervisión enseña los ratios sin semáforo
                  </TableCell>
                </TableRow>
              ) : (
                objetivos.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell>
                      <Badge variant={o.serviceName ? "default" : "secondary"} className="text-[10px]">
                        {o.serviceName ? "Servicio" : "Campaña"}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">{o.serviceName ?? o.campaignShortname}</TableCell>
                    <TableCell className="text-right tabular-nums">{pct(o.brutoMin)}</TableCell>
                    <TableCell className="text-right tabular-nums">{pct(o.netoMin)}</TableCell>
                    <TableCell className="text-right tabular-nums">{pct(o.maxPctNoValidos)}</TableCell>
                    <TableCell className="text-sm">
                      {o.desde} a {o.hasta ?? "indefinido"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{o.notas ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      <form action={borrarObjetivoResultados} className="inline">
                        <input type="hidden" name="id" value={o.id} />
                        <Button variant="destructive" size="xs" type="submit">
                          Eliminar
                        </Button>
                      </form>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
