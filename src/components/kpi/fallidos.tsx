import Link from "next/link";
import { CircleHelp, Download } from "lucide-react";
import { CabeceraOrdenable, FilasOrdenables, TablaOrdenable } from "@/components/tabla-ordenable";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DIAS_FALLIDOS, infoEstado, type ResultadoFallidos } from "@/lib/fallidos";
import { ayudaDe } from "@/lib/glosario";
import { valoresOrden } from "@/lib/orden";
import { cn } from "@/lib/utils";

// ============================================================
// Contactos fallidos en Supervisión (19/11/2026, lib/fallidos.ts): la casilla
// del resumen (negra con 0, ROJA con alguno, para que lo revisen y corrijan
// en la herramienta de supervisor de Altitude) y la pestaña «Fallidos». Sin
// hooks: sirve en Tiempo real (cliente) y en Histórico (servidor).
// ============================================================

function entero(n: number): string {
  return n.toLocaleString("es-ES");
}

/** Casilla «Contactos fallidos» del resumen: lleva a la pestaña. */
export function CasillaFallidos({ fallidos, href }: { fallidos: ResultadoFallidos | null; href: string }) {
  const total = fallidos?.total ?? null;
  const hay = total != null && total > 0;
  const ayuda = ayudaDe("contactosFallidos");
  return (
    <Link href={href} className="block rounded-xl focus-visible:outline-2 focus-visible:outline-ring">
      <Card className={cn("transition-colors hover:bg-muted/40", hay && "border-red-300 dark:border-red-900")}>
        <CardContent className="p-4 md:p-5">
          <div className="flex items-start justify-between gap-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            <span>Contactos fallidos</span>
            {ayuda ? (
              <span title={ayuda} className="shrink-0 cursor-help text-muted-foreground/70 normal-case">
                <CircleHelp className="h-3.5 w-3.5" aria-hidden />
              </span>
            ) : null}
          </div>
          <div
            className={cn(
              "mt-1 text-2xl font-semibold tabular-nums",
              hay ? "text-red-600 dark:text-red-400" : "text-foreground",
            )}
          >
            {total == null ? "—" : entero(total)}
          </div>
          <div className={cn("mt-1 text-xs", hay ? "font-medium text-red-600 dark:text-red-400" : "text-muted-foreground")}>
            {total == null
              ? "No se han podido consultar"
              : hay
                ? "Revisar y corregir en Altitude →"
                : `Ninguno con movimiento en ${DIAS_FALLIDOS} días`}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

/** Pestaña «Fallidos»: qué pasa con cada estado, cuántos por campaña y la lista. */
export function SeccionFallidos({ fallidos, urlExcel }: { fallidos: ResultadoFallidos | null; urlExcel: string }) {
  if (!fallidos) {
    return (
      <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
        No se han podido consultar los contactos fallidos. Prueba a recargar dentro de un momento.
      </p>
    );
  }
  if (fallidos.total === 0) {
    return (
      <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
        No hay contactos fallidos con movimiento en los últimos {DIAS_FALLIDOS} días. No hay nada que corregir.
      </p>
    );
  }
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-base text-red-600 dark:text-red-400">
            {entero(fallidos.total)} {fallidos.total === 1 ? "contacto fallido" : "contactos fallidos"} ahora
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            render={<a href={urlExcel} download />}
            title="La lista de abajo en Excel, con los filtros de cliente y tipo de campaña"
          >
            <Download className="h-4 w-4" /> Excel ({entero(fallidos.total)})
          </Button>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            Altitude los ha dejado parados con un error y no los vuelve a llamar hasta que se corrigen en la herramienta
            de supervisor. Solo salen los que han tenido movimiento en los últimos {DIAS_FALLIDOS} días. Es la foto de
            ahora: al corregirlos desaparecen de aquí (en un minuto como mucho).
          </p>
          <ul className="space-y-2">
            {fallidos.estados.map((e) => {
              const info = infoEstado(e.estado);
              return (
                <li key={e.estado} className="rounded-md border px-3 py-2">
                  <div className="font-medium">
                    {info.texto}{" "}
                    <span className="font-normal text-muted-foreground">
                      · {entero(e.contactos)} · en Altitude: «{e.estado}»
                    </span>
                  </div>
                  <div className="text-muted-foreground">Qué hacer: {info.queHacer}</div>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Por campaña</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Campaña</TableHead>
                <TableHead>Qué le pasa</TableHead>
                <TableHead className="text-right">Contactos</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fallidos.grupos.map((g) => (
                <TableRow key={`${g.campania}|${g.estado}`}>
                  <TableCell className="font-medium">{g.campania}</TableCell>
                  <TableCell title={`En Altitude: ${g.estado}`}>{infoEstado(g.estado).texto}</TableCell>
                  <TableCell className="text-right tabular-nums">{entero(g.contactos)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Contactos para corregir</CardTitle>
        </CardHeader>
        <CardContent>
          <TablaOrdenable>
            <Table>
              <TableHeader>
                <TableRow>
                  <CabeceraOrdenable col={0}>Campaña</CabeceraOrdenable>
                  <CabeceraOrdenable col={1} numerica title="Código del contacto en Altitude">
                    Contacto
                  </CabeceraOrdenable>
                  <CabeceraOrdenable col={2} title="ID único del perfil del directorio">
                    ID único
                  </CabeceraOrdenable>
                  <CabeceraOrdenable col={3}>Nombre</CabeceraOrdenable>
                  <CabeceraOrdenable col={4}>Teléfono</CabeceraOrdenable>
                  <CabeceraOrdenable col={5}>Qué le pasa</CabeceraOrdenable>
                  <CabeceraOrdenable col={6} numerica title="Último movimiento del contacto: más o menos, cuándo falló">
                    Último movimiento
                  </CabeceraOrdenable>
                  <CabeceraOrdenable col={7} title="La última agente que tocó el contacto">
                    Última agente
                  </CabeceraOrdenable>
                </TableRow>
              </TableHeader>
              <TableBody>
                <FilasOrdenables>
                  {fallidos.contactos.map((c) => (
                    <TableRow
                      key={c.contacto}
                      data-orden={valoresOrden(
                        c.campania,
                        c.contacto,
                        c.idUnico,
                        c.nombre,
                        c.telefono,
                        infoEstado(c.estado).texto,
                        c.ts,
                        c.agente,
                      )}
                    >
                      <TableCell className="font-medium">{c.campania}</TableCell>
                      <TableCell className="tabular-nums">{c.contacto}</TableCell>
                      <TableCell className="tabular-nums">{c.idUnico ?? "—"}</TableCell>
                      <TableCell>{c.nombre ?? "—"}</TableCell>
                      <TableCell className="tabular-nums">{c.telefono ?? "—"}</TableCell>
                      <TableCell title={`En Altitude: ${c.estado}`}>{infoEstado(c.estado).texto}</TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums">{c.fecha}</TableCell>
                      <TableCell>{c.agente ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </FilasOrdenables>
              </TableBody>
            </Table>
          </TablaOrdenable>
        </CardContent>
      </Card>
    </div>
  );
}
