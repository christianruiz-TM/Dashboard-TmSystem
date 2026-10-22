import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tiempo } from "@/components/kpi/tiempo";
import type { AgenteHoy } from "@/lib/rdb/types";

// ============================================================
// Productividad de agentes de Supervisión (Tiempo real e Histórico).
// «Llamadas gestionadas» = lo que antes se llamaba «Atendidas» (21/10/2026):
// en las salientes cuenta también las marcaciones que el agente cerró sin
// que contestara nadie, por eso va al lado de «Conversaciones» y de
// «Contactos». Desde el 22/10/2026 sin las preparaciones de llamada manual
// (salientes sin número), que van aparte en «Preparación» y dentro del
// tiempo productivo. Sin hooks: sirve en los dos paneles.
// ============================================================

export function TablaAgentesSupervision({ agentes, vacio }: { agentes: AgenteHoy[]; vacio: string }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Agente</TableHead>
          <TableHead
            className="text-right"
            title="Llamadas que pasaron por su puesto (lo que Altitude llama «gestionadas»). En una saliente no quiere decir que contestara alguien."
          >
            Llamadas gestionadas
          </TableHead>
          <TableHead className="text-right" title="Llamadas gestionadas en las que hubo conversación (alguien al otro lado)">
            Conversaciones
          </TableHead>
          <TableHead className="text-right" title="Contactos trabajados: sesiones de guion (una por cada contacto al que se abrió la ficha, conteste o no). Por eso puede haber más contactos que conversaciones.">
            Contactos
          </TableHead>
          <TableHead className="text-right">Talk medio</TableHead>
          <TableHead className="text-right">ACW medio</TableHead>
          <TableHead className="text-right">AHT</TableHead>
          <TableHead
            className="text-right"
            title="Llamadas manuales: tiempo que el agente pasa cogiendo el contacto y abriendo la ficha antes de marcar. Altitude lo graba como una interacción aparte, sin número; no es una llamada, pero sí trabajo (está dentro del tiempo productivo)."
          >
            Preparación
          </TableHead>
          <TableHead className="text-right" title="Todo el tiempo de gestión del agente, preparación incluida">
            Tiempo productivo
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {agentes.length === 0 ? (
          <TableRow>
            <TableCell colSpan={9} className="text-center text-muted-foreground">
              {vacio}
            </TableCell>
          </TableRow>
        ) : (
          agentes.map((a) => (
            <TableRow key={a.agente}>
              <TableCell>
                <div className="font-medium">{a.nombre}</div>
                <div className="text-xs text-muted-foreground">{a.agente}</div>
              </TableCell>
              <TableCell className="text-right tabular-nums">{a.atendidas.toLocaleString("es-ES")}</TableCell>
              <TableCell className="text-right tabular-nums">{a.conversaciones.toLocaleString("es-ES")}</TableCell>
              <TableCell className="text-right tabular-nums">{a.contactos.toLocaleString("es-ES")}</TableCell>
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
          ))
        )}
      </TableBody>
    </Table>
  );
}
