import type { Metadata } from "next";
import { requireRol } from "@/lib/auth/rbac";
import { umbralSlaSeg } from "@/lib/db/settings";
import { agentesHoy, estadoAgentes, kpisCampaniasHoy } from "@/lib/rdb/queries/supervision";
import { PanelSupervision } from "./panel-supervision";

export const metadata: Metadata = { title: "Supervisión" };
export const dynamic = "force-dynamic";

export default async function PaginaSupervision() {
  await requireRol("supervision");
  const umbral = umbralSlaSeg();
  const [agentes, kpis, top] = await Promise.all([
    estadoAgentes(),
    kpisCampaniasHoy(umbral),
    agentesHoy(),
  ]);

  return (
    <PanelSupervision
      inicial={{
        agentes,
        kpis,
        top,
        umbral,
        actualizado: new Date().toISOString(),
      }}
    />
  );
}
