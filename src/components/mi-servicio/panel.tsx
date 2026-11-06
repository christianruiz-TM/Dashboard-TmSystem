import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { CabeceraOrdenable, FilasOrdenables, TablaOrdenable } from "@/components/tabla-ordenable";
import { dibujoMiServicio } from "@/lib/mi-servicio/dibujo";
import { CSS_GRAFICAS } from "@/lib/mi-servicio/estilos";
import { GLOSARIO_CLIENTE, notasInternas, type ClaveMiServicio } from "@/lib/mi-servicio/glosario";
import { motorMiServicio } from "@/lib/mi-servicio/motor";
import type { MiServicioCargado } from "@/lib/mi-servicio/servidor";
import type { CampaniaCalculada } from "@/lib/mi-servicio/tipos";
import { vistaMiServicio, type TarjetaMiServicio } from "@/lib/mi-servicio/vista";
import { valoresOrden } from "@/lib/orden";
import { cn } from "@/lib/utils";
import { InteraccionMiServicio } from "./interaccion";

// ============================================================
// Panel de «Mi servicio» (06/11/2026): las mismas piezas que el informe
// descargado (motor, vista y dibujo de lib/mi-servicio), pintadas con las
// tarjetas y tablas del panel. Los globos de cada cifra: la definición para
// el cliente y, para los roles internos, la nota interna debajo.
// ============================================================

/**
 * Ancho de dibujo de las gráficas de media tarjeta: el de la tarjeta en una
 * pantalla de 1280 px, para que el texto salga a su tamaño (el SVG se escala).
 */
const ANCHO_MEDIO = 440;

function Svg({ html, className }: { html: string; className?: string }) {
  return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}

function Tarjeta({ t, globo, mini, anillo }: { t: TarjetaMiServicio; globo: string | null; mini: string; anillo: string }) {
  return (
    <Card className={cn("gap-0", t.grupo === "principal" && "border-t-[3px] border-t-primary")}>
      <CardContent className="flex h-full flex-col p-4">
        <div className="flex items-start justify-between gap-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <span>{t.titulo}</span>
          {globo ? (
            <span
              tabIndex={0}
              data-tip={globo}
              aria-label={globo}
              className="inline-flex size-4 shrink-0 cursor-help items-center justify-center rounded-full border border-border text-[10px] normal-case text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
            >
              ?
            </span>
          ) : null}
        </div>
        <div className="mt-1 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className={cn("font-semibold whitespace-nowrap", t.grupo === "principal" ? "text-2xl" : "text-xl")}>{t.valor}</div>
            {t.sub ? <div className="mt-0.5 text-xs text-muted-foreground">{t.sub}</div> : null}
          </div>
          {anillo ? <Svg html={anillo} className="w-16 shrink-0" /> : null}
        </div>
        {mini ? <Svg html={mini} className="mt-auto pt-2" /> : null}
      </CardContent>
    </Card>
  );
}

export function PanelMiServicio({ carga, interno }: { carga: MiServicioCargado; interno: boolean }) {
  const motor = motorMiServicio();
  const dibujo = dibujoMiServicio(motor.fmt);
  const vista = vistaMiServicio(motor, dibujo);
  const fmt = motor.fmt;
  const { datos } = carga;
  const panel = motor.calcular(datos);
  const notas = interno ? notasInternas(carga.extras) : {};
  const globoDe = (clave: string) => {
    const g = GLOSARIO_CLIENTE[clave as ClaveMiServicio];
    if (!g) return null;
    const nota = notas[clave as ClaveMiServicio];
    return `${g.termino}\n${g.definicion}${nota ? `\n\n${nota}` : ""}`;
  };
  const tarjetas = vista.tarjetas(datos, panel);
  const paneles = vista.paneles(panel);
  const leyenda = dibujo.leyenda(vista.leyendaComposicion(datos));
  const reparto = vista.reparto(datos, panel);
  const resultados = vista.itemsResultados(panel);
  const motivos = vista.itemsMotivos(panel);
  const columnas = vista.columnasCampanias(datos);
  const conTipo = datos.opcionesTipo.length > 0 || datos.campanias.some((c) => c.tipo);
  const total = vista.totalCampanias(datos, panel);
  const glosario: ClaveMiServicio[] = [
    "llamadas",
    "finalizados",
    ...(datos.configurado ? (["noValidos"] as const) : []),
    "exitos",
    "finalizadosExito",
    panel.kpis.tipoHoras === "logadas" ? "horasLogadas" : "horasFicha",
    "llamadasHora",
    "exitosHora",
    "finalizadosPorExito",
    "bruto",
    ...(datos.configurado ? (["neto"] as const) : []),
  ];
  const filaCampania = (c: CampaniaCalculada, esTotal = false) => (
    <>
      <TableCell className="font-medium">{c.nombre}</TableCell>
      {conTipo ? <TableCell className="text-muted-foreground">{esTotal ? "" : (c.tipo ?? "—")}</TableCell> : null}
      {columnas.map((col) => (
        <TableCell key={col.titulo} className="text-right tabular-nums">
          {col.valor(c)}
        </TableCell>
      ))}
    </>
  );

  return (
    <InteraccionMiServicio>
      <style dangerouslySetInnerHTML={{ __html: CSS_GRAFICAS }} />

      {datos.campanias.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Sin actividad en estas campañas en el periodo elegido.
          </CardContent>
        </Card>
      ) : null}

      {/* Las cinco cifras y los ratios */}
      <div className="space-y-3">
        {(["principal", "ratio"] as const).map((grupo) => (
          <div key={grupo} className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            {tarjetas
              .filter((t) => t.grupo === grupo)
              .map((t) => (
                <Tarjeta
                  key={t.clave}
                  t={t}
                  globo={globoDe(t.clave)}
                  mini={t.serie ? dibujo.minigrafica(t.serie.valores, t.serie.color) : ""}
                  anillo={t.anillo ? dibujo.anillo(t.anillo.pct, t.anillo.color, t.titulo) : ""}
                />
              ))}
          </div>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Evolución</CardTitle>
          <CardDescription>
            {panel.serie.granularidad === "semana" ? "Por semanas" : "Día a día"}: cada medida con su escala. Pasa el ratón por{" "}
            {panel.serie.granularidad === "semana" ? "una semana" : "un día"} para ver sus cifras.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Svg html={dibujo.tira(panel.serie.puntos, paneles)} />
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer text-muted-foreground">Ver la tabla</summary>
            <Svg html={dibujo.tablaDias(panel.serie.puntos, paneles)} className="mt-2 overflow-x-auto" />
          </details>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Del contacto al éxito</CardTitle>
            <CardDescription>Cada paso, con el % sobre el anterior.</CardDescription>
          </CardHeader>
          <CardContent>
            <Svg html={dibujo.embudo(panel.embudo, ANCHO_MEDIO)} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cómo acabaron los finalizados</CardTitle>
            <CardDescription>Contactos cerrados en el periodo, según su resultado.</CardDescription>
          </CardHeader>
          <CardContent>
            <Svg html={dibujo.composicion([reparto.item], "Cómo acabaron los finalizados", ANCHO_MEDIO)} />
            <ul className="mt-3 grid gap-1.5 text-sm">
              {reparto.filas.map((x) => (
                <li key={x.texto} className="grid grid-cols-[12px_1fr_auto_5rem] items-center gap-2">
                  <i className="size-2.5 rounded-[3px]" style={{ background: `var(${x.color})` }} />
                  <span>{x.texto}</span>
                  <b className="font-semibold tabular-nums">{fmt.entero(x.n)}</b>
                  <em className="text-right not-italic text-muted-foreground tabular-nums">{fmt.pct(x.pct)}</em>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      {datos.configurado ? (
        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Resultados</CardTitle>
              <CardDescription>
                Finalizados por {(datos.niveles[0] ?? "resultado").toLowerCase()}, con su parte de éxito y de no válidos. Pasa el
                ratón para ver el detalle.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Svg html={leyenda} />
              {resultados.length > 0 ? (
                <Svg html={dibujo.composicion(resultados, "Finalizados por resultado")} />
              ) : (
                <p className="text-sm text-muted-foreground">Sin finalizados en estas campañas.</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Motivos de no válido</CardTitle>
              <CardDescription>Por qué no se pudieron aprovechar los no válidos.</CardDescription>
            </CardHeader>
            <CardContent>
              {motivos.length > 0 ? (
                <Svg html={dibujo.composicion(motivos, "Motivos de no válido")} />
              ) : (
                <p className="text-sm text-muted-foreground">Sin no válidos en estas campañas.</p>
              )}
            </CardContent>
          </Card>
        </div>
      ) : interno ? (
        <Card>
          <CardContent className="py-5 text-sm text-muted-foreground">
            Este cliente no tiene configurados sus resultados ni sus «no válidos», así que no salen los no válidos, el neto ni
            el desglose por resultado. Se configuran en{" "}
            <Link href="/admin/resultados" className="underline">
              Administración → Resultados
            </Link>{" "}
            (admin).
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Por campaña</CardTitle>
          <CardDescription>Finalizados de cada campaña y su aprovechamiento. Las horas, con la ficha abierta en cada una.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Svg html={leyenda} />
          <Svg html={dibujo.composicion(vista.itemsCampanias(datos, panel), "Finalizados por campaña")} />
          <div className="overflow-x-auto">
            <TablaOrdenable>
              <Table>
                <TableHeader>
                  <TableRow>
                    <CabeceraOrdenable col={0}>Campaña</CabeceraOrdenable>
                    {conTipo ? <CabeceraOrdenable col={1}>Tipo</CabeceraOrdenable> : null}
                    {columnas.map((col, i) => (
                      <CabeceraOrdenable key={col.titulo} col={i + (conTipo ? 2 : 1)} numerica className="text-right">
                        {col.titulo}
                      </CabeceraOrdenable>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <FilasOrdenables>
                    {panel.campanias.map((c) => (
                      <TableRow
                        key={c.nombre}
                        data-orden={valoresOrden(c.nombre, ...(conTipo ? [c.tipo] : []), ...columnas.map((col) => col.orden(c)))}
                      >
                        {filaCampania(c)}
                      </TableRow>
                    ))}
                  </FilasOrdenables>
                  {panel.campanias.length > 1 ? <TableRow className="font-semibold">{filaCampania(total, true)}</TableRow> : null}
                </TableBody>
              </Table>
            </TablaOrdenable>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Qué significa cada cifra</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[minmax(10rem,14rem)_1fr]">
            {glosario.map((k) => (
              <div key={k} className="contents">
                <dt className="font-medium">{GLOSARIO_CLIENTE[k].termino}</dt>
                <dd className="text-muted-foreground">{GLOSARIO_CLIENTE[k].definicion}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
    </InteraccionMiServicio>
  );
}
