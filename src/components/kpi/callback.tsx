import { PhoneCall } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CabeceraOrdenable, FilasOrdenables, TablaOrdenable } from "@/components/tabla-ordenable";
import type { CallbackServicio, ResultadoCallback } from "@/lib/callback";
import { relojDesdeSegundos } from "@/lib/fechas";
import { valoresOrden } from "@/lib/orden";

// ============================================================
// Callback de las entrantes (12/11/2026): fichas que el IVR crea para
// devolver una llamada rechazada sin agentes, cuánto se tarda en devolverlas
// (en horario de atención del cliente) y cómo acaban. Para Supervisión
// (Tiempo real e Histórico) y Dirección; nunca para el cliente. Sin hooks ni
// consultas: sirve en componentes de servidor y de cliente.
// ============================================================

const entero = (n: number) => n.toLocaleString("es-ES");
const DOS = { minimumFractionDigits: 2, maximumFractionDigits: 2 };
const pct = (a: number, b: number) => (b > 0 ? `${((a / b) * 100).toLocaleString("es-ES", DOS)} %` : "—");
const minutos = (m: number | null) => (m == null ? "—" : `${m.toLocaleString("es-ES", DOS)} min`);
const reloj = (m: number | null) => (m == null ? null : relojDesdeSegundos(m * 60));
const hora = (momento: string) => `${momento.slice(8, 10)}/${momento.slice(5, 7)} ${momento.slice(11, 16)}`;

function Cifra({ valor, etiqueta, sub, color }: { valor: string; etiqueta: string; sub?: string | null; color?: string }) {
  return (
    <div>
      <div className={`text-2xl font-semibold tabular-nums ${color ?? ""}`}>{valor}</div>
      <div className="text-xs text-muted-foreground">{etiqueta}</div>
      {sub ? <div className="text-[11px] text-muted-foreground">{sub}</div> : null}
    </div>
  );
}

function Fila({ texto, n, total, nota }: { texto: string; n: number; total: number; nota?: string }) {
  return (
    <li className="flex items-baseline justify-between gap-3">
      <span>
        {texto}
        {nota ? <span className="text-xs text-muted-foreground"> · {nota}</span> : null}
      </span>
      <span className="shrink-0 tabular-nums">
        <b className="font-semibold">{entero(n)}</b> <span className="text-muted-foreground">({pct(n, total)})</span>
      </span>
    </li>
  );
}

function BloqueServicio({ s, enVivo, varios }: { s: CallbackServicio; enVivo: boolean; varios: boolean }) {
  const r = s.resumen;
  const e = s.entrantes;
  const masAntiguo = s.pendientesAhora[0] ?? null;
  const noAtendidas = e.recibidas - e.atendidas;
  return (
    <div className="space-y-4">
      {varios ? <h3 className="text-sm font-semibold">{s.servicio}</h3> : null}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <Cifra valor={entero(r.creadas)} etiqueta="Fichas de callback" sub="creadas por el IVR" />
        <Cifra valor={entero(r.devueltas)} etiqueta="Devueltas" sub={pct(r.devueltas, r.creadas)} color="text-emerald-700 dark:text-emerald-400" />
        {enVivo ? (
          <Cifra
            valor={entero(s.pendientesAhora.length)}
            etiqueta="Pendientes ahora"
            sub={masAntiguo ? `la más antigua espera ${minutos(masAntiguo.esperaMin)}` : "ninguna"}
            color={s.pendientesAhora.length > 0 ? "text-amber-700 dark:text-amber-400" : undefined}
          />
        ) : (
          <Cifra
            valor={entero(r.pendientes)}
            etiqueta="Sin devolver"
            sub={r.cerradasSinTocar > 0 ? `y ${entero(r.cerradasSinTocar)} cerradas sin tocar` : null}
            color={r.pendientes > 0 ? "text-amber-700 dark:text-amber-400" : undefined}
          />
        )}
        <Cifra valor={minutos(r.medianaMin)} etiqueta="Mediana hasta devolver" sub={reloj(r.medianaMin)} />
        <Cifra valor={r.pctMenos1h == null ? "—" : `${r.pctMenos1h.toLocaleString("es-ES", DOS)} %`} etiqueta="Devueltas en menos de 1 h" />
        <Cifra valor={entero(r.hablamos)} etiqueta="Hablamos con el cliente" sub={pct(r.hablamos, r.devueltas) + " de las devueltas"} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div>
          <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Tiempo hasta devolver</h4>
          <ul className="space-y-1 text-sm">
            {r.tramos.map((t) => (
              <Fila key={t.clave} texto={t.etiqueta} n={t.n} total={r.devueltas} />
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">
            {s.conCalendario
              ? "Solo en horario de atención del cliente: lo que llega con el servicio cerrado empieza a contar al abrir."
              : "Este cliente no tiene calendario en Administración → Callback: tiempo de reloj."}
          </p>
        </div>
        <div>
          <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Cómo acabaron las fichas</h4>
          <ul className="space-y-1 text-sm">
            <Fila texto="Hablamos con el cliente" n={r.hablamos} total={r.creadas} />
            <Fila texto="Llamamos sin llegar a hablar" n={r.llamadaSinHablar} total={r.creadas} />
            <Fila texto="Gestión sin llamada" n={r.gestionSinLlamada} total={r.creadas} nota="se abrió la ficha y se cerró" />
            <Fila texto="Sin devolver" n={r.pendientes} total={r.creadas} />
            <Fila texto="Cerradas sin tocar" n={r.cerradasSinTocar} total={r.creadas} />
          </ul>
        </div>
        <div>
          <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Entrantes no atendidas ({entero(noAtendidas)} de {entero(e.recibidas)})
          </h4>
          <ul className="space-y-1 text-sm">
            <Fila texto="Sin agentes, con ficha de callback" n={e.rechazadasConFicha} total={noAtendidas} />
            <Fila texto="Sin agentes, el número ya tenía ficha" n={e.rechazadasFichaPrevia} total={noAtendidas} />
            <Fila texto="Sin agentes, colgaron antes del callback" n={e.rechazadasSinFicha} total={noAtendidas} />
            <Fila texto="Colgaron esperando en cola" n={e.colgaronEnCola} total={noAtendidas} nota={e.colgaronEnColaConFicha > 0 ? `${entero(e.colgaronEnColaConFicha)} con ficha` : undefined} />
            <Fila texto="Colgaron en el IVR" n={e.colgaronEnIvr} total={noAtendidas} />
            {e.rechazadasSinCallback > 0 ? (
              <Fila texto="Sin agentes, en campañas sin callback" n={e.rechazadasSinCallback} total={noAtendidas} />
            ) : null}
            {e.otras > 0 ? <Fila texto="Otras" n={e.otras} total={noAtendidas} /> : null}
          </ul>
        </div>
      </div>

      {enVivo && s.pendientesAhora.length > 0 ? (
        <details open={s.pendientesAhora.length <= 10}>
          <summary className="cursor-pointer text-sm font-medium">Pendientes de devolver ahora ({s.pendientesAhora.length})</summary>
          <div className="mt-2 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campaña</TableHead>
                  <TableHead>Contacto</TableHead>
                  <TableHead>Creada</TableHead>
                  <TableHead className="text-right">Esperando (en horario)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {s.pendientesAhora.map((p) => (
                  <TableRow key={p.contacto}>
                    <TableCell>{p.campania}</TableCell>
                    <TableCell className="tabular-nums">{p.contacto}</TableCell>
                    <TableCell className="tabular-nums">{hora(p.alta)}</TableCell>
                    <TableCell className="text-right tabular-nums">{minutos(p.esperaMin)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </details>
      ) : null}

      {s.porCampania.length > 0 ? (
        <details>
          <summary className="cursor-pointer text-sm font-medium">Por campaña ({s.porCampania.length})</summary>
          <div className="mt-2 overflow-x-auto">
            <TablaOrdenable>
              <Table>
                <TableHeader>
                  <TableRow>
                    <CabeceraOrdenable col={0}>Campaña</CabeceraOrdenable>
                    {["Fichas", "Devueltas", "Sin devolver", "Mediana", "< 1 h", "Hablamos"].map((t, i) => (
                      <CabeceraOrdenable key={t} col={i + 1} numerica className="text-right">
                        {t}
                      </CabeceraOrdenable>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <FilasOrdenables>
                    {s.porCampania.map((c) => (
                      <TableRow
                        key={c.campania}
                        data-orden={valoresOrden(c.campania, c.creadas, c.devueltas, c.pendientes, c.medianaMin, c.pctMenos1h, c.hablamos)}
                      >
                        <TableCell className="font-medium">{c.campania}</TableCell>
                        <TableCell className="text-right tabular-nums">{entero(c.creadas)}</TableCell>
                        <TableCell className="text-right tabular-nums">{entero(c.devueltas)}</TableCell>
                        <TableCell className="text-right tabular-nums">{entero(c.pendientes)}</TableCell>
                        <TableCell className="text-right tabular-nums">{minutos(c.medianaMin)}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {c.pctMenos1h == null ? "—" : `${c.pctMenos1h.toLocaleString("es-ES", DOS)} %`}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{entero(c.hablamos)}</TableCell>
                      </TableRow>
                    ))}
                  </FilasOrdenables>
                </TableBody>
              </Table>
            </TablaOrdenable>
          </div>
        </details>
      ) : null}

      {s.porAgente.length > 0 ? (
        <details>
          <summary className="cursor-pointer text-sm font-medium">Quién las devolvió ({s.porAgente.length})</summary>
          <div className="mt-2 overflow-x-auto">
            <TablaOrdenable>
              <Table>
                <TableHeader>
                  <TableRow>
                    <CabeceraOrdenable col={0}>Agente</CabeceraOrdenable>
                    {["Devueltas", "Hablamos", "Mediana"].map((t, i) => (
                      <CabeceraOrdenable key={t} col={i + 1} numerica className="text-right">
                        {t}
                      </CabeceraOrdenable>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <FilasOrdenables>
                    {s.porAgente.map((a) => (
                      <TableRow key={a.agente} data-orden={valoresOrden(a.agente, a.devueltas, a.hablamos, a.medianaMin)}>
                        <TableCell>
                          <span className="font-medium">{a.agente}</span>
                          {a.nombre && a.nombre !== a.agente ? <span className="text-muted-foreground"> · {a.nombre}</span> : null}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{entero(a.devueltas)}</TableCell>
                        <TableCell className="text-right tabular-nums">{entero(a.hablamos)}</TableCell>
                        <TableCell className="text-right tabular-nums">{minutos(a.medianaMin)}</TableCell>
                      </TableRow>
                    ))}
                  </FilasOrdenables>
                </TableBody>
              </Table>
            </TablaOrdenable>
          </div>
        </details>
      ) : null}
    </div>
  );
}

/**
 * Sección «Callback». `enVivo`: Tiempo real (pendientes de ahora, también
 * de días anteriores). Sin clientes con callback configurado, no sale.
 */
export function Callback({ callback, enVivo = false }: { callback: ResultadoCallback | null; enVivo?: boolean }) {
  if (!callback || callback.servicios.length === 0) return null;
  const varios = callback.servicios.length > 1;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <PhoneCall className="size-4" /> Callback: llamadas que devolvemos
        </CardTitle>
        <CardDescription>
          Cuando entra una llamada y no hay ningún agente, el IVR crea una ficha en la campaña para devolverla. Cuenta como
          devuelta en cuanto un agente toca la ficha (llamando o gestionándola sin llamar).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-8">
        {callback.servicios.map((s) => (
          <BloqueServicio key={s.servicio} s={s} enVivo={enVivo} varios={varios} />
        ))}
      </CardContent>
    </Card>
  );
}
