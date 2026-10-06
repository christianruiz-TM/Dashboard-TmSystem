"use client";

import { useEffect, useState } from "react";
import { CircleHelp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// ============================================================
// Ayuda del módulo de planificación para supervisión: una ventana con un
// tema por pantalla (se abre en el de la pantalla donde se pulsa) y los
// comunes (el mes paso a paso, incidencias, glosario). Es el resumen de la
// «Guía de planificación de turnos para supervisión»: si cambia algo del
// funcionamiento, cambiar las dos.
// ============================================================

export type PantallaAyuda =
  | "inicio"
  | "tablero"
  | "ausencias"
  | "bolsas"
  | "versiones"
  | "configuracion"
  | "hoy"
  | "adherencia"
  | "saldos"
  | "cierre";

const T = "w-full border-collapse text-xs [&_td]:border-t [&_td]:py-1 [&_td]:pr-3 [&_td]:align-top [&_th]:py-1 [&_th]:pr-3 [&_th]:text-left [&_th]:font-medium";

function Tema({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3 text-sm leading-relaxed [&_h4]:mt-4 [&_h4]:font-semibold [&_li]:ml-4 [&_ol]:list-decimal [&_ol]:space-y-1 [&_ul]:list-disc [&_ul]:space-y-1">
      <h3 className="text-base font-semibold">{titulo}</h3>
      {children}
    </div>
  );
}

const TEMAS: { id: string; etiqueta: string; contenido: React.ReactNode }[] = [
  {
    id: "mes",
    etiqueta: "El mes, paso a paso",
    contenido: (
      <Tema titulo="El mes, paso a paso">
        <ol>
          <li>
            <strong>Datos al día.</strong> En <em>Planificación</em>, «Estado de los datos» tiene que salir en verde (datos hasta
            ayer). Si no, avisar a TI antes de generar.
          </li>
          <li>
            <strong>Avisos de entrada.</strong> Prefijos sin cliente, agentes inactivos, gente fuera de plantilla con horas y
            agentes sin turno: se corrigen en <em>Configuración</em>.
          </li>
          <li>
            <strong>Ausencias</strong> del mes: vacaciones, libranzas, RTO y permisos.
          </li>
          <li>
            <strong>Bolsas y objetivos:</strong> confirmar la bolsa de GH y revisar los objetivos semanales y el fin estimado de
            cada campaña.
          </li>
          <li>
            <strong>Generar el borrador</strong> (o regenerarlo respetando los cambios).
          </li>
          <li>
            <strong>Revisar y ajustar</strong> en el tablero y pulsar «Guardar cambios».
          </li>
          <li>
            <strong>Publicar</strong>: sin incidencias duras; con avisos, explicando el motivo.
          </li>
        </ol>
        <p>
          Durante el mes, la versión publicada no se toca: «Nuevo borrador desde la vN» la copia, se ajusta y se vuelve a
          publicar.
        </p>
        <p>
          <strong>Seguimiento:</strong> cada día, <em>Hoy</em> y las alertas (también en Supervisión); durante y al acabar el
          mes, las pestañas <em>Adherencia</em>, <em>Saldos</em> y <em>Cierre</em>.
        </p>
      </Tema>
    ),
  },
  {
    id: "inicio",
    etiqueta: "Pantalla de inicio",
    contenido: (
      <Tema titulo="Pantalla de inicio (Planificación)">
        <p>Dice si se puede generar con confianza y lista los meses con su borrador y su versión publicada.</p>
        <table className={T}>
          <thead>
            <tr>
              <th>Aviso</th>
              <th>Qué hacer</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Agregados que no llegan a ayer</td>
              <td>Avisar a TI: el plan saldría con datos viejos.</td>
            </tr>
            <tr>
              <td>Usuario con prefijo sin cliente</td>
              <td>
                ¿Cliente nuevo? <em>Configuración → Clientes → Prefijos</em>: asignarle cliente.
              </td>
            </tr>
            <tr>
              <td>Agente inactivo (30 días sin sesión)</td>
              <td>No se planifica. Si vuelve: «Forzar activo» en <em>Agentes</em>.</td>
            </tr>
            <tr>
              <td>Fuera de plantilla con horas</td>
              <td>
                Incluirlo en <em>Agentes</em> si le toca.
              </td>
            </tr>
            <tr>
              <td>Sin turno</td>
              <td>
                Asignarle patrón A/B en <em>Patrones</em>.
              </td>
            </tr>
          </tbody>
        </table>
        <h4>Generar borrador</h4>
        <p>
          Calcula el mes con los datos cerrados hasta ayer (unos segundos): mínimos de GH por franja, objetivos de los
          salientes y reparto. Se puede generar el mes actual y los tres siguientes, y solo hay un borrador por mes.
        </p>
        <ul>
          <li>
            <em>Regenerar respetando mis cambios</em>: conserva los bloques fijados o cambiados a mano y reparte el resto.
          </li>
          <li>
            <em>Empezar de cero</em>: lo recalcula todo.
          </li>
        </ul>
        <p>El borrador anterior queda como «descartada» (se ve en Versiones).</p>
      </Tema>
    ),
  },
  {
    id: "tablero",
    etiqueta: "El tablero",
    contenido: (
      <Tema titulo="El tablero: qué se ve">
        <p>
          Enseña la versión vigente del mes (el borrador si lo hay; si no, la publicada) y lo recalcula todo al momento:
          barras, cobertura, saldos e incidencias.
        </p>
        <ul>
          <li>
            <strong>Cabecera</strong>: estado y versión, con qué datos se generó, horas planificadas frente a la capacidad
            (turnos − ausencias − festivos, con las ausencias de hoy).
          </li>
          <li>
            <strong>Vistas</strong>: <em>Agente</em> (la semana, una fila por agente), <em>Cliente</em> (cuántos agentes por
            franja; pulsar una celda dice quiénes) y <em>Día</em> (un día ampliado, con «hay/mínimo»).
          </li>
        </ul>
        <table className={T}>
          <thead>
            <tr>
              <th>Qué ves</th>
              <th>Qué significa</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Barra GH + BD + LX</td>
              <td>Sus horas frente a la bolsa de GH, que comparten (el trazo vertical es la bolsa).</td>
            </tr>
            <tr>
              <td>Barras de BD, LX, UGR, CEFF, CR</td>
              <td>Sus horas frente a su objetivo del mes.</td>
            </tr>
            <tr>
              <td>Ávolo «a demanda»</td>
              <td>Sin bloques: se entra con Av_ cuando hay una llamada pendiente.</td>
            </tr>
            <tr>
              <td>Mapa de GH: rojo / ámbar / verde / gris</td>
              <td>Por debajo del mínimo / justo / con holgura / sin mínimo (fuera de horario).</td>
            </tr>
            <tr>
              <td>Gris claro en la fila</td>
              <td>Turno del agente sin bloque.</td>
            </tr>
            <tr>
              <td>Bloque de color</td>
              <td>El cliente; al pasar el ratón explica por qué está ahí.</td>
            </tr>
            <tr>
              <td>Rayado</td>
              <td>Una ausencia (color de su tipo).</td>
            </tr>
            <tr>
              <td>Chincheta</td>
              <td>Bloque fijado: el motor no lo cambia al regenerar.</td>
            </tr>
            <tr>
              <td>«30,00 h · saldo +1,00 h»</td>
              <td>Horas de la semana y saldo previsto (azul a favor, ámbar en contra). Detalle al pasar el ratón.</td>
            </tr>
            <tr>
              <td>Icono rojo o ámbar junto al nombre</td>
              <td>Incidencias duras o avisos del agente esa semana.</td>
            </tr>
          </tbody>
        </table>
        <p>
          Al final, <strong>Incidencias y avisos</strong> («Ver» lleva al sitio) y quién quedó <strong>sin planificar</strong>{" "}
          y por qué.
        </p>
      </Tema>
    ),
  },
  {
    id: "editar",
    etiqueta: "Cambiar el plan",
    contenido: (
      <Tema titulo="Cambiar el plan">
        <p>
          Solo en un borrador y con usuario de supervisión. Nada cuenta hasta pulsar <strong>Guardar cambios</strong>.
        </p>
        <ul>
          <li>
            <strong>Arrastrar</strong> un bloque a otra hora, otro día u otra agente; debajo pone a dónde iría y, en rojo, si no
            se puede.
          </li>
          <li>
            <strong>Estirar</strong> desde el borde izquierdo o derecho.
          </li>
          <li>
            <strong>Pulsar</strong> un bloque (o botón derecho): cambiar de cliente, devolver a GH, dividir, unir con el
            siguiente, mover a…, fijar o desfijar y eliminar.
          </li>
          <li>
            <strong>Doble clic</strong> en un hueco, o «Añadir bloque», para crear uno.
          </li>
          <li>«Quitar lo que pisa ausencias» aparece cuando hay bloques encima de una ausencia.</li>
        </ul>
        <table className={T}>
          <thead>
            <tr>
              <th>Tecla (con el bloque seleccionado)</th>
              <th>Qué hace</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>← →</td>
              <td>Mover una franja</td>
            </tr>
            <tr>
              <td>Mayús + ← →</td>
              <td>Acortar o alargar el final</td>
            </tr>
            <tr>
              <td>Alt + ← →</td>
              <td>Mover el principio</td>
            </tr>
            <tr>
              <td>↑ ↓</td>
              <td>Pasarlo al agente de arriba o de abajo</td>
            </tr>
            <tr>
              <td>Supr</td>
              <td>Eliminarlo</td>
            </tr>
            <tr>
              <td>Intro</td>
              <td>Abrir su menú</td>
            </tr>
            <tr>
              <td>Ctrl+Z / Ctrl+Y / Ctrl+S</td>
              <td>Deshacer / rehacer / guardar</td>
            </tr>
            <tr>
              <td>?</td>
              <td>Esta ayuda</td>
            </tr>
          </tbody>
        </table>
        <h4>Reglas al soltar</h4>
        <ul>
          <li>Lo que había debajo se recorta: nunca quedan dos bloques a la vez.</li>
          <li>Al mover o encoger un bloque de otro cliente, su hueco dentro del turno vuelve a GH. Si es de GH, queda libre.</li>
          <li>Un bloque fijado no se pisa: hay que desfijarlo antes.</li>
          <li>«Eliminar» deja el hueco libre; para pasar horas a GH, «Devolver a GH».</li>
        </ul>
        <p>
          «Descartar» vuelve a lo guardado. Si otra persona guardó el mismo borrador mientras tanto, sale un aviso y hay que
          recargar (lo no guardado se pierde).
        </p>
      </Tema>
    ),
  },
  {
    id: "incidencias",
    etiqueta: "Qué bloquea y qué avisa",
    contenido: (
      <Tema titulo="Qué bloquea y qué solo avisa">
        <p>Las duras impiden soltar, guardar y publicar; las blandas dejan publicar explicando el motivo.</p>
        <table className={T}>
          <thead>
            <tr>
              <th>Incidencia</th>
              <th>Tipo</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Agente sin usuario de ese cliente (no podría logarse)</td>
              <td>Dura</td>
            </tr>
            <tr>
              <td>Bloque encima de una ausencia</td>
              <td>Dura</td>
            </tr>
            <tr>
              <td>GH fuera de su horario de servicio (las llamadas no llegan)</td>
              <td>Dura</td>
            </tr>
            <tr>
              <td>Dos bloques a la vez</td>
              <td>Dura</td>
            </tr>
            <tr>
              <td>GH por debajo del mínimo en una franja</td>
              <td>Blanda</td>
            </tr>
            <tr>
              <td>Fuera del turno del agente</td>
              <td>Blanda</td>
            </tr>
            <tr>
              <td>Trabajo en festivo (compensar con FEST)</td>
              <td>Blanda</td>
            </tr>
            <tr>
              <td>Semana por encima del contrato o del turno</td>
              <td>Blanda</td>
            </tr>
            <tr>
              <td>Demasiadas horas seguidas del mismo cliente</td>
              <td>Blanda</td>
            </tr>
            <tr>
              <td>Saliente fuera del horario de su servicio</td>
              <td>Blanda</td>
            </tr>
          </tbody>
        </table>
        <p>
          Una dura que ya estaba (por ejemplo, una ausencia dada de alta después de generar) no impide otros cambios ese día,
          pero sí publicar. Las <em>informativas</em> son contexto del momento de generar.
        </p>
      </Tema>
    ),
  },
  {
    id: "publicar",
    etiqueta: "Publicar y versiones",
    contenido: (
      <Tema titulo="Publicar y versiones">
        <p>
          Una versión pasa de <em>borrador</em> a <em>publicada</em>, y a <em>sustituida</em> cuando se publica otra del mismo
          mes. Al regenerar, el borrador anterior queda <em>descartada</em>.
        </p>
        <ul>
          <li>
            <strong>Publicar…</strong> pide los cambios guardados y cero incidencias duras. Con avisos blandos, marcar «Publicar
            con N avisos» y escribir un motivo (10 caracteres o más): queda en la versión y en el historial.
          </li>
          <li>
            Una publicada no se edita: <strong>Nuevo borrador desde la vN</strong> la copia tal cual.
          </li>
        </ul>
        <h4>Página Versiones</h4>
        <ul>
          <li>Las versiones del mes: origen, quién y cuándo, motivo, horas y bloques.</li>
          <li>
            <strong>Cambios</strong> entre dos versiones, tramo a tramo («0851 07/10 11-14: UGR → GH»; «libre» = hueco). Dividir
            o unir no cuenta. Arriba, las horas que gana o pierde cada cliente.
          </li>
          <li>
            <strong>Historial</strong>: quién generó, guardó, publicó o cambió ausencias y bolsas, y cuándo.
          </li>
        </ul>
      </Tema>
    ),
  },
  {
    id: "ausencias",
    etiqueta: "Ausencias",
    contenido: (
      <Tema titulo="Ausencias">
        <p>
          Se dan de alta una vez y cuentan al momento en capacidad, barras, saldo e incidencias, sin regenerar. No van por
          versiones.
        </p>
        <table className={T}>
          <thead>
            <tr>
              <th>Tipo</th>
              <th>Cuenta como trabajada</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>VAC · Vacaciones</td>
              <td>Sí</td>
            </tr>
            <tr>
              <td>FEST · Libranza por festivo trabajado</td>
              <td>Sí</td>
            </tr>
            <tr>
              <td>RTO · Retribución de tiempo por objetivos</td>
              <td>Sí</td>
            </tr>
            <tr>
              <td>AUS · Ausencia (médico, asuntos propios…)</td>
              <td>No</td>
            </tr>
          </tbody>
        </table>
        <p>«Cuenta como trabajada»: las horas de turno que cubre suman al saldo como si se hubieran trabajado.</p>
        <ul>
          <li>Agente, tipo, de qué día a qué día (los dos incluidos) y jornada completa o de qué hora a qué hora.</li>
          <li>
            Con «Quitar del borrador los bloques que la pisen» (marcada) esas horas desaparecen del borrador. La publicada no se
            toca: sale como incidencia dura hasta hacer un borrador nuevo.
          </li>
          <li>Borrar una ausencia no devuelve sus horas: se añaden en el tablero o se regenera respetando los cambios.</li>
        </ul>
        <p>
          <strong>Saldo previsto</strong> = planificado + justificado − contrato. El contrato de cada semana se prorratea por
          sus laborables dentro del mes.
        </p>
      </Tema>
    ),
  },
  {
    id: "bolsas",
    etiqueta: "Bolsas, objetivos y fin",
    contenido: (
      <Tema titulo="Bolsas, objetivos y fin de campaña">
        <h4>Bolsas</h4>
        <p>
          La bolsa es el total de horas del mes de un cliente; la de GH la comparten GH, BD y LX. Mientras no se confirme, vale
          la última confirmada prorrateada por días laborables (por ejemplo, 1.324 h × 21/22 = 1.263,82 h). «Confirmar» guarda
          la cifra; «Quitar» vuelve al prorrateo. La de Ávolo es informativa.
        </p>
        <h4>Objetivos semanales</h4>
        <p>
          Para los salientes (UGR, BD, LX, CEFF, CR): contactos que faltan cerrar para dejar la lista en su % de vivos, entre
          su ritmo de cierres por hora, repartidos por semanas. CEFF y BD tienen horas fijas por semana. Un valor «Fijado a
          mano» prevalece; vacío = el calculado.
        </p>
        <h4>Fin estimado de cada campaña</h4>
        <p>
          Nadie sabe la fecha exacta: acaba cuando se agotan los contactos o las horas contratadas. Se dan varias referencias:
        </p>
        <ul>
          <li>al ritmo de cierres de los últimos 10 laborables;</li>
          <li>con las horas planificadas y su ritmo por hora (si no llegan, cuántas faltan);</li>
          <li>por campañas parecidas ya terminadas (para UGR, la de 2025; para Caja Rural, sus listas anteriores);</li>
          <li>
            si se configuran las horas contratadas y su fecha de inicio (parámetros del cliente), cuándo se agotan; además, el
            objetivo del mes nunca pasa de lo que queda.
          </li>
        </ul>
        <p>Los cambios de bolsas y objetivos se aplican al generar o regenerar el borrador.</p>
      </Tema>
    ),
  },
  {
    id: "configuracion",
    etiqueta: "Configuración",
    contenido: (
      <Tema titulo="Configuración">
        <p>Todo lo que usa el motor se cambia aquí, sin tocar código, y queda en el historial. Solo supervisión.</p>
        <table className={T}>
          <tbody>
            <tr>
              <td>
                <strong>Clientes</strong>
              </td>
              <td>
                Código, nombre, color, modo, prioridad, «cuenta como» (BD y LX cuentan como GH), campañas y parámetros (bloques
                candidatos, topes, % de vivos, horas contratadas…). Abajo, los prefijos de usuario de cada cliente.
              </td>
            </tr>
            <tr>
              <td>
                <strong>Agentes</strong>
              </td>
              <td>Alias, contrato semanal, plantilla y equipo, «forzar activo» y notas.</td>
            </tr>
            <tr>
              <td>
                <strong>Patrones</strong>
              </td>
              <td>
                Turnos semanales («9-14, 16-20») y el patrón A y B de cada agente desde una fecha. «Aprender patrones» los
                propone con las 8 últimas semanas.
              </td>
            </tr>
            <tr>
              <td>
                <strong>Parámetros</strong>
              </td>
              <td>Franja, horas del día, semana A, calendario de festivos, inactividad, semanas de datos.</td>
            </tr>
            <tr>
              <td>
                <strong>Tipos de ausencia</strong>
              </td>
              <td>Código, nombre, color y si cuenta como trabajada.</td>
            </tr>
          </tbody>
        </table>
        <p>
          Color, nombre, contrato y ausencias se ven al recargar el tablero. Clientes, patrones, parámetros, bolsas y objetivos
          se aplican al regenerar.
        </p>
      </Tema>
    ),
  },
  {
    id: "hoy",
    etiqueta: "Hoy y alertas",
    contenido: (
      <Tema titulo="Hoy y alertas">
        <p>
          <em>Planificación → Hoy</em> enseña el día en curso y se actualiza sola cada minuto. Por agente, arriba lo planificado
          y abajo lo logado con cada usuario, del color de su cliente (gris: un usuario de otro servicio); la línea roja es la
          hora actual. El plan es el de la versión publicada (si aún no hay, el borrador).
        </p>
        <p>
          <strong>Cobertura de GH</strong>: por franja, agentes conectados con GH o con BD/LX frente al mínimo (rojo por debajo,
          ámbar justo, verde con holgura). En las franjas que faltan, lo planificado.
        </p>
        <h4>Alertas</h4>
        <p>Salen aquí y en la tarjeta «Alertas de planificación» de Supervisión. Las rojas primero.</p>
        <table className={T}>
          <thead>
            <tr>
              <th>Alerta</th>
              <th>Cuándo</th>
              <th>Qué hacer</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Ávolo sin atender</td>
              <td>Hay entrantes sin atender después de la última atendida y nadie conectado con Av_.</td>
              <td>Que alguien con usuario Av_ se conecte.</td>
            </tr>
            <tr>
              <td>GH por debajo del mínimo</td>
              <td>
                Conectados ahora con GH/BD/LX por debajo del mínimo de la franja (si la franja sube el mínimo, pasados los
                minutos de margen).
              </td>
              <td>Pasar a GH a alguien de un saliente o llamar a quien falte.</td>
            </tr>
            <tr>
              <td>Sin conectar</td>
              <td>Agente planificado que no se ha conectado (o se desconectó) hace más de 15 min.</td>
              <td>Comprobar si está o si falta una ausencia.</td>
            </tr>
            <tr>
              <td>Campaña retrasada</td>
              <td>
                Un saliente lleva en la semana menos del 80 % de las horas planificadas hasta ahora (con al menos 2 h
                planificadas).
              </td>
              <td>Revisar quién está en esa campaña; si no se recupera, ajustar el plan.</td>
            </tr>
          </tbody>
        </table>
        <p>
          Los umbrales (15 min, 80 %, 2 h) están en <em>Configuración → Parámetros</em>, grupo «Seguimiento». El tiempo logado de
          hoy llega con uno o dos minutos de retraso.
        </p>
      </Tema>
    ),
  },
  {
    id: "adherencia",
    etiqueta: "Adherencia",
    contenido: (
      <Tema titulo="Adherencia (pestaña del mes)">
        <p>
          Compara, minuto a minuto, lo planificado con el tiempo logado de cada usuario (la misma fuente con que factura
          operaciones). Cada minuto planificado es:
        </p>
        <table className={T}>
          <tbody>
            <tr>
              <td className="font-medium">Correcto</td>
              <td>
                Conectado con un usuario del cliente que tocaba, o con uno que cuenta como él (BD o LX en un bloque de GH). En un
                bloque de Ávolo también vale estar en GH esperando la llamada.
              </td>
            </tr>
            <tr>
              <td className="font-medium">A demanda</td>
              <td>Atendiendo Ávolo durante otro bloque: no es un desvío.</td>
            </tr>
            <tr>
              <td className="font-medium">Otro cliente</td>
              <td>Conectado, pero con el usuario de otro cliente (GH cuando tocaba UGR, por ejemplo).</td>
            </tr>
            <tr>
              <td className="font-medium">Sin conectar</td>
              <td>No estaba logado.</td>
            </tr>
          </tbody>
        </table>
        <ul>
          <li>
            <strong>Por turno</strong> = (correcto + a demanda + otro) ÷ planificado: estaba trabajando cuando le tocaba.
          </li>
          <li>
            <strong>Por cliente</strong> = (correcto + a demanda) ÷ planificado: además, donde le tocaba.
          </li>
          <li>
            <strong>Fuera del plan</strong>: horas logadas sin estar planificado (horas extra o cambios que no se pasaron al
            plan).
          </li>
        </ul>
        <p>
          La tabla de desviaciones lista los agentes y días con 30 min o más en otro cliente o sin conectar. Septiembre (plan
          del Excel) dio un 97,8 % por turno y un 82,6 % por cliente.
        </p>
      </Tema>
    ),
  },
  {
    id: "saldos",
    etiqueta: "Saldos",
    contenido: (
      <Tema titulo="Saldos (pestaña del mes)">
        <p>El «+1 / −1» de cada agente con contrato, día a día:</p>
        <p className="font-medium">saldo = trabajadas + justificadas − contrato del día (+ ajustes)</p>
        <ul>
          <li>
            <strong>Trabajadas</strong>: hasta ayer, las horas logadas de la persona con todos sus usuarios; de hoy en adelante,
            lo planificado (en cursiva: es previsto).
          </li>
          <li>
            <strong>Justificadas</strong>: horas de su turno cubiertas por una ausencia que cuenta como trabajada (vacaciones,
            libranza por festivo, RTO). Las ausencias «AUS» no justifican.
          </li>
          <li>
            <strong>Contrato del día</strong>: el semanal entre cinco, cada laborable (sin festivos).
          </li>
          <li>
            <strong>Arrastre</strong>: saldo real de los meses anteriores, desde el «Inicio del saldo» (parámetro; el 1 de
            octubre de 2026).
          </li>
        </ul>
        <h4>Ajustes manuales</h4>
        <p>
          Para lo que no sale del tiempo logado (una formación fuera del sistema, una corrección acordada): agente, día, horas
          (con signo) y un motivo de al menos 10 caracteres. Quedan en el historial del mes; borrar un ajuste también.
        </p>
      </Tema>
    ),
  },
  {
    id: "cierre",
    etiqueta: "Cierre de mes",
    contenido: (
      <Tema titulo="Cierre de mes (pestaña del mes)">
        <p>Por cliente: bolsa, planificado y real, con las diferencias. Se puede descargar en XLSX.</p>
        <ul>
          <li>
            <strong>Real</strong> = horas logadas con los usuarios de cada cliente (estén o no en la plantilla): lo mismo que
            factura operaciones por horas logadas. Los GH_nnnn_BD son de BD; los GH_nnnn, de GH.
          </li>
          <li>
            <strong>Grupo GH + BD + LX</strong>: comparten la bolsa de GH, así que «Real − bolsa» se mira en esa fila.
          </li>
          <li>Mientras el mes no ha acabado, lo real llega hasta ayer y lo planificado es el del mes entero.</li>
        </ul>
        <p>
          Septiembre de 2026 cuadra con la facturación: GH 1.027,88 h, UGR 195,42 h y Ávolo 23,45 h; el grupo GH + BD + LX
          suma 1.384,22 h, como el Excel de horas de operaciones.
        </p>
      </Tema>
    ),
  },
  {
    id: "glosario",
    etiqueta: "Glosario",
    contenido: (
      <Tema titulo="Glosario">
        <table className={T}>
          <tbody>
            {[
              ["Bloque", "Un agente en un cliente durante unas horas («UGR 11-14»)."],
              ["Franja", "La unidad de tiempo del plan: 1 hora."],
              ["Cliente base", "GH: se queda las horas de turno que no van a otro cliente."],
              ["Cuenta como", "BD y LX cuentan como GH en la cobertura y comparten su bolsa."],
              ["Mínimo", "Agentes que necesita GH en cada franja para atender las entrantes con su nivel de servicio."],
              ["Holgura", "Agentes en GH por encima del mínimo; solo con holgura se dan horas a los salientes."],
              ["Bolsa", "Horas del mes de un cliente."],
              ["Objetivo", "Horas por semana de un cliente saliente para trabajar su lista."],
              ["Ritmo", "Contactos cerrados por hora de trabajo."],
              ["A demanda", "Ávolo: sin bloques, se entra cuando hay una llamada pendiente."],
              ["Semana A / B", "Los turnos se alternan por semanas; cada agente tiene un patrón para cada una."],
              ["Fijado", "Bloque que el motor no cambia al regenerar."],
              ["Saldo previsto", "Planificado + justificado − contrato."],
              ["Saldo real", "Logado + justificado − contrato, en los días ya cerrados (hasta ayer)."],
              ["Adherencia por turno", "Parte de lo planificado en que el agente estaba conectado."],
              ["Adherencia por cliente", "Parte de lo planificado en que estaba conectado con el usuario del cliente que tocaba."],
              ["Real (logado)", "Horas logadas (user_log) de los usuarios de un cliente: lo que factura operaciones."],
            ].map(([termino, texto]) => (
              <tr key={termino}>
                <td className="font-medium whitespace-nowrap">{termino}</td>
                <td>{texto}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Tema>
    ),
  },
];

const TEMA_DE: Record<PantallaAyuda, string> = {
  inicio: "inicio",
  tablero: "tablero",
  ausencias: "ausencias",
  bolsas: "bolsas",
  versiones: "publicar",
  configuracion: "configuracion",
  hoy: "hoy",
  adherencia: "adherencia",
  saldos: "saldos",
  cierre: "cierre",
};

/**
 * Botón «Ayuda» de una pantalla de planificación. Abre en el tema de esa
 * pantalla; con `atajo`, también se abre con la tecla «?» (fuera de campos
 * de texto).
 */
export function BotonAyuda({ pantalla, atajo = false }: { pantalla: PantallaAyuda; atajo?: boolean }) {
  const [abierta, setAbierta] = useState(false);
  const [tema, setTema] = useState(TEMA_DE[pantalla]);

  useEffect(() => {
    if (!atajo) return;
    const alPulsar = (e: KeyboardEvent) => {
      if (e.key !== "?" || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, select, [contenteditable=true], [role=dialog], [role=menu]")) return;
      e.preventDefault();
      setTema(TEMA_DE[pantalla]);
      setAbierta(true);
    };
    window.addEventListener("keydown", alPulsar);
    return () => window.removeEventListener("keydown", alPulsar);
  }, [atajo, pantalla]);

  return (
    <Dialog
      open={abierta}
      onOpenChange={(a) => {
        setAbierta(a);
        if (a) setTema(TEMA_DE[pantalla]);
      }}
    >
      <DialogTrigger render={<Button variant="outline" size="sm" title={atajo ? "Ayuda (tecla ?)" : "Ayuda"} />}>
        <CircleHelp /> Ayuda
      </DialogTrigger>
      <DialogContent className="flex max-h-[85vh] flex-col gap-3 sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Ayuda de planificación</DialogTitle>
          <DialogDescription>Qué hace cada pantalla y cómo se trabaja el plan del mes.</DialogDescription>
        </DialogHeader>
        <Tabs
          orientation="vertical"
          value={tema}
          onValueChange={(v) => setTema(String(v))}
          className="min-h-0 flex-1 flex-col gap-3 md:flex-row"
        >
          <TabsList variant="line" className="w-full shrink-0 flex-row flex-wrap items-stretch md:w-52 md:flex-col md:flex-nowrap">
            {TEMAS.map((t) => (
              <TabsTrigger key={t.id} value={t.id} className="flex-none justify-start px-2 py-1">
                {t.etiqueta}
              </TabsTrigger>
            ))}
          </TabsList>
          {TEMAS.map((t) => (
            <TabsContent key={t.id} value={t.id} className="min-h-0 overflow-y-auto pr-2">
              {t.contenido}
            </TabsContent>
          ))}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
