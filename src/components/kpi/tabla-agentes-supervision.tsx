import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { Tiempo } from "@/components/kpi/tiempo";
import { CabeceraOrdenable, FilasOrdenables, TablaOrdenable } from "@/components/tabla-ordenable";
import { valoresOrden } from "@/lib/orden";
import type { AgenteHoy } from "@/lib/rdb/types";

// ============================================================
// Productividad de agentes de Supervisión (Tiempo real e Histórico).
// «Llamadas gestionadas» = lo que antes se llamaba «Atendidas» (21/10/2026):
// en las salientes cuenta también las marcaciones que el agente cerró sin
// que contestara nadie, por eso va al lado de «Conversaciones» y de
// «Contactos». Desde el 22/10/2026 sin las preparaciones de llamada manual
// (salientes sin número), que van aparte en «Preparación» y dentro del
// tiempo productivo. Los emails (05/11/2026) tampoco son llamadas: van en
// «Emails», que solo sale si alguien los envió, y dentro del tiempo
// productivo. Sin hooks: sirve en los dos paneles. De la A a la Z
// por el usuario de Altitude (04/11/2026), que va delante del nombre; se
// ordena por cualquier columna pulsando su cabecera.
// ============================================================

export function TablaAgentesSupervision({ agentes, vacio }: { agentes: AgenteHoy[]; vacio: string }) {
  const conEmails = agentes.some((a) => a.emails > 0);
  return (
    <TablaOrdenable>
      <Table>
        <TableHeader>
          <TableRow>
            <CabeceraOrdenable col={0}>Agente</CabeceraOrdenable>
            <CabeceraOrdenable
              col={1}
              numerica
              className="text-right"
              title="Llamadas que pasaron por su puesto (lo que Altitude llama «gestionadas»). En una saliente no quiere decir que contestara alguien."
            >
              Llamadas gestionadas
            </CabeceraOrdenable>
            <CabeceraOrdenable col={2} numerica className="text-right" title="Llamadas gestionadas en las que hubo conversación (alguien al otro lado)">
              Conversaciones
            </CabeceraOrdenable>
            <CabeceraOrdenable col={3} numerica className="text-right" title="Contactos trabajados: sesiones de guion (una por cada contacto al que se abrió la ficha, conteste o no). Por eso puede haber más contactos que conversaciones.">
              Contactos
            </CabeceraOrdenable>
            {conEmails ? (
              <CabeceraOrdenable
                col={9}
                numerica
                className="text-right"
                title="Emails enviados desde el guion. No son llamadas: no cuentan en las llamadas gestionadas ni en las medias, pero su tiempo está en el productivo."
              >
                Emails
              </CabeceraOrdenable>
            ) : null}
            <CabeceraOrdenable col={4} numerica className="text-right">Talk medio</CabeceraOrdenable>
            <CabeceraOrdenable col={5} numerica className="text-right">ACW medio</CabeceraOrdenable>
            <CabeceraOrdenable col={6} numerica className="text-right">AHT</CabeceraOrdenable>
            <CabeceraOrdenable
              col={7}
              numerica
              className="text-right"
              title="Llamadas manuales: tiempo que el agente pasa cogiendo el contacto y abriendo la ficha antes de marcar. Altitude lo graba como una interacción aparte, sin número; no es una llamada, pero sí trabajo (está dentro del tiempo productivo)."
            >
              Preparación
            </CabeceraOrdenable>
            <CabeceraOrdenable col={8} numerica className="text-right" title="Todo el tiempo de gestión del agente, preparación incluida">
              Tiempo productivo
            </CabeceraOrdenable>
          </TableRow>
        </TableHeader>
        <TableBody>
          {agentes.length === 0 ? (
            <TableRow>
              <TableCell colSpan={conEmails ? 10 : 9} className="text-center text-muted-foreground">
                {vacio}
              </TableCell>
            </TableRow>
          ) : (
            <FilasOrdenables>
              {agentes.map((a) => (
                <TableRow
                  key={a.agente}
                  data-orden={valoresOrden(
                    a.agente,
                    a.atendidas,
                    a.conversaciones,
                    a.contactos,
                    a.talkMedioSeg,
                    a.acwMedioSeg,
                    a.ahtMedioSeg,
                    a.preparaciones > 0 ? a.preparacionSeg : null,
                    a.productivoSeg,
                    // Al final: la columna solo sale si hay emails y no mueve las demás
                    a.emails,
                  )}
                >
                  <TableCell>
                    <div className="font-medium">{a.agente}</div>
                    <div className="text-xs text-muted-foreground">{a.nombre}</div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{a.atendidas.toLocaleString("es-ES")}</TableCell>
                  <TableCell className="text-right tabular-nums">{a.conversaciones.toLocaleString("es-ES")}</TableCell>
                  <TableCell className="text-right tabular-nums">{a.contactos.toLocaleString("es-ES")}</TableCell>
                  {conEmails ? (
                    <TableCell className="text-right tabular-nums">{a.emails.toLocaleString("es-ES")}</TableCell>
                  ) : null}
                  <TableCell className="text-right tabular-nums">
                    <Tiempo segundos={a.talkMedioSeg} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    <Tiempo segundos={a.acwMedioSeg} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    <Tiempo segundos={a.ahtMedioSeg} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {a.preparaciones > 0 ? (
                      <>
                        <Tiempo segundos={a.preparacionSeg} acumulado />
                        <div className="text-[11px] text-muted-foreground">{a.preparaciones.toLocaleString("es-ES")} veces</div>
                      </>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    <Tiempo segundos={a.productivoSeg} acumulado />
                  </TableCell>
                </TableRow>
              ))}
            </FilasOrdenables>
          )}
        </TableBody>
      </Table>
    </TablaOrdenable>
  );
}
