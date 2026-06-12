# Referencia BBDD — Altitude uCI / RDBv2
**Base de datos:** `RDBv2` (Subscription DB) | **Motor:** SQL Server | **Doc oficial:** v8.6.3190
 
> Todas las queries se ejecutan sobre la base de datos **`RDBv2`** en SSMS.
> Esta es la Subscription DB de la replicación — nunca consultar la BBDD principal de Altitude.
 
---
 
## 1. Mapa de tablas disponibles en RDBv2
 
### 1.1 Tablas de replicación (esquema interno Altitude)
Son réplica casi en tiempo real de la BBDD principal. Requieren JOINs pero son las más completas.
 
| Tabla | Descripción |
|---|---|
| `activity` | Actividades / contactos outbound |
| `activity_history` | Historial de intentos de contactos outbound |
| `ag_in_cp_log` | Log de estados del agente en campaña (Ready/NotReady/Open) |
| `cp_general_cfg` | Relación campaña ↔ servicio |
| `default_directory_schema` | Schema del directorio por defecto |
| `dial_rule` | Reglas de marcación outbound |
| `itr_global` | Interacción global completa |
| `itr_recording` | Grabaciones de interacciones |
| `itr_segment` | Segmentos de un hilo (fases: routing, connected, wrapup...) |
| `itr_thread` | Hilo de interacción por agente ← **tabla principal de reporting** |
| `not_ready_reason` | Razones de No Disponible |
| `ph_activity_list` | Listas de contactos |
| `ph_activity_outcome` | Resultados de actividad |
| `ph_business_segment` | Segmentos de negocio |
| `ph_campaign` | Maestro de campañas |
| `ph_contact_profile` | Perfiles de clientes |
| `ph_directory` | Directorios |
| `ph_e_user` | Usuarios / agentes |
| `ph_itr_skill_profile` | Perfiles de habilidades |
| `ph_media_type` | Tipos de medio (voz, email, chat...) |
| `ph_service` | Servicios / colas |
| `ph_site` | Sites del contact center |
| `ph_table_schema_enum_value` | Valores de enumerados personalizados |
| `ph_team` | Equipos de agentes |
| `script_session` | Sesiones de script del agente |
| `table_field` | Campos de atributos personalizados |
| `table_schema` | Schemas de atributos |
| `timezone` | Zonas horarias |
| `user_log` | Histórico de logins de agentes |
 
### 1.2 Tablas de sistema / RDB internas (no usar para reporting)
`MSreplication_objects`, `MSreplication_subscriptions`, `MSsavedforeignkeys*`, `MSsnapshotdeliveryprogress`, `MSsubscription_agents`, `rdb_enums`, `rdb_service_exec_log`, `rdb_service_name_mapping`
 
### 1.3 Tablas personalizadas (específicas de tu instalación)
| Tabla | Descripción probable |
|---|---|
| `desvios` | Tabla personalizada — desvíos de llamadas |
| `festivos_servicio` | Festivos por servicio |
| `horarios_servicio` | Horarios de servicio |
| `HuntGroup_Campaign` | Relación Hunt Group ↔ Campaña |
| `RATIOS_RF` | Ratios personalizados |
 
> ⚠️ Estas tablas no están en la documentación oficial. Explorar con `SELECT TOP 5 * FROM nombre_tabla` para entender su estructura antes de usarlas.
 
---
 
### 1.4 Tablas de actividades por servicio (`act_*`)
Atributos de actividad personalizados por cada servicio. Una tabla por campaña/servicio.
 
| Tabla | Campaña/Servicio |
|---|---|
| `act_1_Wit` | Wit (variante 1) |
| `act_Aeroprint` | Aeroprint |
| `act_AlAndalus` | Al Andalus |
| `act_Avolo` | Avolo |
| `act_AvoloRenov` | Avolo Renovación |
| `act_AyudaTpymes` | Ayuda T-Pymes |
| `act_Bolsas` | Bolsas |
| `act_CajaRural` | Caja Rural |
| `act_Cetursa` | Cetursa |
| `act_Cuerva` | Cuerva |
| `act_GrupoHuertas` | Grupo Huertas |
| `act_GrupoPacc` | Grupo Pacc |
| `act_Infoautonomos` | Infoautónomos |
| `act_LoMonaco` | Lo Mónaco |
| `act_Mipuf` | Mipuf |
| `act_PruebaEntrantes` | Prueba Entrantes |
| `act_SierraNevada` | Sierra Nevada |
| `act_Socios` | Socios |
| `act_TMSYSTEM` | TM System |
| `act_TopDigital` | Top Digital |
| `act_UGR` | UGR |
| `act_UPTA` | UPTA |
| `act_Wit` | Wit |
| `act_Xperience_Routing` | Xperience Routing |
| `act_Test_*` | Entornos de prueba (no usar en reporting producción) |
 
> Estas tablas contienen los **atributos de actividad personalizados** de cada campaña (campos extra del script). Hacer JOIN por `activity.code` = `act_<servicio>.code` (verificar PK con `SELECT TOP 1 * FROM act_Aeroprint`).
 
---
 
### 1.5 Tablas de resultados de actividad por servicio (`ao_*`)
Outcomes (resultados) personalizados de actividad. Misma lógica que `act_*`.
 
`ao_Aeroprint`, `ao_AlAndalus`, `ao_Avolo`, `ao_AvoloRenov`, `ao_AyudaTpymes`, `ao_Bolsas`, `ao_CajaRural`, `ao_Cetursa`, `ao_Cuerva`, `ao_GrupoHuertas`, `ao_GrupoPacc`, `ao_Infoautonomos`, `ao_LoMonaco`, `ao_Mipuf`, `ao_PruebaEntrantes`, `ao_SierraNevada`, `ao_Socios`, `ao_TMSYSTEM`, `ao_TopDigital`, `ao_UGR`, `ao_UPTA`, `ao_Wit`, `ao_Xperience_Routing` + variantes Test.
 
---
 
### 1.6 Directorios de contactos (`dir_*`)
Una tabla por directorio. Contienen los contactos del directorio con los campos personalizados de ese directorio (extensiones del perfil de contacto).
 
`dir_diraeroprint`, `dir_diralandalus`, `dir_diravolo`, `dir_DirAvoloRenovacion`, `dir_dirayudatpymes`, `dir_dirbolsas`, `dir_dircajarural`, `dir_dircuerva`, `dir_dirEntrantes`, `dir_dirgrupopacc`, `dir_dirlomonaco`, `dir_dirmipuf`, `dir_dirprueba`, `dir_dirsierranevada`, `dir_dirsocios`, `dir_dirtmsystem`, `dir_dirtopdigital`, `dir_dirugr`, `dir_dirupta`, `dir_dirwit`, `dir_Infoautonomos` + variantes Test.
 
> Hacer JOIN con `ph_contact_profile.code` = `dir_<nombre>.easycode` (verificar con `SELECT TOP 1 * FROM dir_diraeroprint`).
 
---
 
## 2. Flat Tables disponibles en RDBv2
 
> Las flat tables están **activadas** en tu instalación. Se actualizan periódicamente (cada ~15 min).
> Son la opción más rápida para KPIs y dashboards.
 
### `flat_agent_login` — Logins de agentes
| Campo | Tipo | Descripción |
|---|---|---|
| `Id` | decimal(10,0) | PK |
| `AgentId` | decimal(10,0) | Identificador del agente |
| `AgentName` | varchar(255) | Nombre de usuario |
| `StartMoment` | datetime | Inicio del login |
| `Duration` | int | Duración en segundos |
| `Extension` | varchar(32) | Extensión del agente |
 
### `flat_agent_cpg_operations` — Operaciones del agente en campaña
| Campo | Tipo | Descripción |
|---|---|---|
| `Id` | decimal(10,0) | PK |
| `AgentId` | decimal(10,0) | Identificador del agente |
| `AgentName` | varchar(255) | Nombre de usuario |
| `CampaignId` | decimal(10,0) | Identificador de campaña |
| `CampaignName` | varchar(20) | Nombre de campaña |
| `StartMoment` | datetime | Inicio de la operación |
| `Duration` | int | Duración en segundos |
| `Operation` | varchar(64) | **`Open`** / **`Ready`** / **`Not Ready`** |
| `NotReadyReasonId` | decimal(10,0) | ID razón de no disponible |
| `NotReadyReasonName` | varchar(32) | Nombre de la razón |
| `NotReadyReasonGuiName` | varchar(32) | Nombre GUI de la razón |
 
### `contacts_<servicio>` — Contactos por servicio (solo estado Done)
Tablas disponibles: `contacts_Aeroprint`, `contacts_AlAndalus`, `contacts_Avolo`, `contacts_AvoloRenov`, `contacts_AyudaTpymes`, `contacts_Bolsas`, `contacts_CajaRural`, `contacts_Cetursa`, `contacts_Cuerva`, `contacts_GrupoHuertas`, `contacts_GrupoPacc`, `contacts_Infoautonomos`, `contacts_LoMonaco`, `contacts_Mipuf`, `contacts_Osoigo`, `contacts_PruebaBolsas`, `contacts_PruebaEntrantes`, `contacts_SierraNevada`, `contacts_Socios`, `contacts_TMSYSTEM`, `contacts_TopDigital`, `contacts_UGR`, `contacts_UPTA`, `contacts_Wit`, `contacts_Xperience Routing` + variantes Test.
 
Campos principales:
| Campo | Descripción |
|---|---|
| `Id` | PK — Identificador del contacto |
| `AgentName` | Nombre de usuario del agente asignado |
| `AgentFullName` | Nombre completo del agente |
| `AgentId` | ID del agente |
| `CampaignName` | Nombre de la campaña |
| `CampaignId` | ID de la campaña |
| `InteractionStatus` | Resultado última interacción: `Handled` / `Busy` / `Machine` / `No answer` / `Abandoned` / `Nuisance` / `Rejected` / `Invalid number` / `Overflow` / `Canceled` / etc. |
| `BusinessStatus` | Estado de negocio: `Success-Done` / `Unsuccessful-Done` / `Qualified-Done` / `Not touched-Done` / etc. |
| `NTriesAuto` | Intentos automáticos |
| `NTriesManual` | Intentos manuales |
| `ContactProfileId` | FK → `ph_contact_profile.code` |
| `FirstName`, `LastName` | Nombre y apellidos del cliente |
| `MobilePhone`, `BusinessPhone`, `HomePhone` | Teléfonos |
| `Email1` | Email del cliente |
| `event_moment` | Momento del último evento |
 
### `flat_int_<servicio>` — Interacciones detalladas por servicio
Tablas disponibles: `flat_int_Aeroprint`, `flat_int_AlAndalus`, `flat_int_Avolo`, `flat_int_AvoloRenov`, `flat_int_AyudaTpymes`, `flat_int_Bolsas`, `flat_int_CajaRural`, `flat_int_Cetursa`, `flat_int_Cuerva`, `flat_int_GrupoHuertas`, `flat_int_GrupoPacc`, `flat_int_Infoautonomos`, `flat_int_LoMonaco`, `flat_int_Mipuf`, `flat_int_Osoigo`, `flat_int_PruebaBolsas`, `flat_int_PruebaEntrantes`, `flat_int_SierraNevada`, `flat_int_Socios`, `flat_int_TMSYSTEM`, `flat_int_TopDigital`, `flat_int_UGR`, `flat_int_UPTA`, `flat_int_Wit`, `flat_int_Xperience Routing` + variantes Test.
 
Campos principales:
| Campo | Descripción |
|---|---|
| `InteractionGlobalId` | ID global de la interacción (FK → `itr_global.code`) |
| `InteractionThreadId` | ID del hilo (FK → `itr_thread.code`) |
| `InteractionSegmentId` | ID del segmento |
| `AgentId`, `AgentName`, `AgentFullName` | Datos del agente |
| `CampaignId`, `CampaignName`, `CampaignType` | Datos de la campaña |
| `InteractionThreadServiceId`, `ServiceName` | Servicio |
| `InteractionThreadOrigin` | `Inbound` / `Outbound` / `Workflow` |
| `InteractionThreadTerminationStatus` | `Handled` / `Abandoned` / `Busy` / `No answer` / `Machine` / etc. |
| `InteractionThreadMoment` | Inicio del hilo (hora servidor) |
| `InteractionThreadDuration` | Duración total en segundos (talk + wrapup) |
| `InteractionThreadWrapUpDuration` | ACW en segundos |
| `InteractionGlobalDuration` | Duración global de la interacción |
| `InteractionGlobalFrom` | ANI (inbound) / extensión (outbound) |
| `InteractionGlobalTo` | DNIS (inbound) / número marcado (outbound) |
| `InteractionGlobalUcid` | Universal Call ID |
| `ScriptSessionId` | ID sesión de script |
| `ScriptSessionDuration` | Duración sesión de script en segundos |
| `ScriptSessionBusinessStatus` | Estado de negocio del script |
| `ActivityOutcomeId` | ID del outcome (resultado de actividad) |
| `InteractionThreadGmtStartMoment` | Inicio GMT |
| `InteractionThreadGmtEndMoment` | Fin GMT |
 
---
 
## 3. Tablas de replicación — Columnas clave
 
### `ph_e_user` — Agentes (PK: `code`)
| Columna | Tipo | Descripción |
|---|---|---|
| `code` | int | PK |
| `usr_name` | char(255) | Login del agente |
| `fullname` | char(255) | Nombre completo |
| `type` | smallint | **1=Humano · 3=IVR · 5=Routing · 8=Scheduler · 15=Externo** |
| `position_id` | varchar(32) | ID en la centralita |
 
### `ph_campaign` — Campañas (PK: `code`)
| Columna | Tipo | Descripción |
|---|---|---|
| `code` | int | PK |
| `shortname` | char(20) | Nombre corto (único) — es el que aparece en las flat tables |
| `fullname` | varchar(255) | Descripción completa |
| `campaigntype` | smallint | **-1=NoValue · 0=Inbound · 1=Outbound · 2=Blended · 3=Repository** |
 
### `ph_service` — Servicios / Colas (PK: `code`)
| Columna | Tipo | Descripción |
|---|---|---|
| `code` | int | PK |
| `name` | varchar(63) | Nombre del servicio |
 
### `cp_general_cfg` — Relación campaña ↔ servicio
| Columna | Descripción |
|---|---|
| `campaign` | FK → `ph_campaign.code` |
| `service` | FK → `ph_service.code` |
 
### `itr_global` — Interacción global (PK: `code` bigint)
| Columna | Tipo | Descripción |
|---|---|---|
| `code` | bigint | PK |
| `start_time` | datetime | Inicio hora servidor (**filtrar aquí**) |
| `gmt_start_time` / `gmt_end_time` | datetime | Inicio/fin GMT |
| `duration` | int | Duración total en segundos |
| `origin` | smallint | **1=Inbound · 2=Outbound · 3=Workflow** |
| `from_address` | varchar(255) | ANI (inbound) / extensión (outbound) |
| `to_address` | varchar(4000) | DNIS (inbound) / número marcado (outbound) |
| `ucid` | varchar(32) | Universal Call ID |
 
### `itr_thread` — Hilo de interacción (PK: `code` bigint) ← tabla más usada
| Columna | Tipo | Descripción |
|---|---|---|
| `code` | bigint | PK |
| `itr_global` | bigint | FK → `itr_global.code` |
| `e_user` | int | FK → `ph_e_user.code` |
| `team` | int | FK → `ph_team` |
| `site` | int | FK → `ph_site.code` |
| `service` | int | FK → `ph_service.code` |
| `campaign` | int | FK → `ph_campaign.code` |
| `contact` | int | FK → `activity.code` (outbound) |
| `activity_list` | int | FK → `ph_activity_list.code` |
| `contact_profile` | int | FK → `ph_contact_profile.code` |
| `media_type` | int | FK → `ph_media_type.code` |
| `origin` | smallint | **1=Inbound · 2=Outbound · 3=Workflow · 4=SoloData** |
| `start_time` | datetime | Inicio hora servidor (**filtrar aquí**) |
| `gmt_start_time` / `gmt_end_time` | datetime | Inicio/fin GMT |
| `duration` | int | **Duración TOTAL en seg. (talk + wrapup)** |
| `wrapup_duration` | int | **Duración ACW en seg.** |
| `termination_state` | smallint | Ver tabla abajo |
| `from_address` | varchar(255) | ANI / extensión origen |
| `to_address` | varchar(4000) | DNIS / número marcado |
 
**`itr_thread.termination_state`:**
| Valor | Nombre |
|---|---|
| 1 | **Handled** (atendida) |
| 2 | Busy (ocupado) |
| 3 | Machine (contestador) |
| 4 | NoAnswer (no contesta) |
| 5 | Nuisance |
| **6** | **Abandoned** (abandonada) |
| 7 | Rejected |
| 8 | InvalidNumber |
| 9 | Overflow |
| 10 | TrunkLineOverflow |
| 11 | Redirected |
| 17 | Canceled |
| 18 | ReEnqueued |
 
> **Fórmulas clave:**
> - **Talk Time** = `duration - wrapup_duration`
> - **AHT** = `duration` (talk + wrapup)
> - **ACW** = `wrapup_duration`
 
### `itr_segment` — Segmentos del hilo (PK: `code` bigint)
| Columna | Tipo | Descripción |
|---|---|---|
| `code` | bigint | PK |
| `itr_thread` | bigint | FK → `itr_thread.code` |
| `e_user` | int | FK → `ph_e_user.code` |
| `start_time` | datetime | Inicio del segmento |
| `duration` | int | Duración en segundos |
| `seg_order` | smallint | Orden del segmento |
| `state` | smallint | `1`=Setup · `2`=Pending · `3`=Routing · `5`=Alerting · **`6`=Connected** · `7`=Held · **`8`=WrapUp** · `11`=Handling |
| `extension` | varchar(32) | Extensión del agente |
 
> Usar para calcular **tiempo de cola** (state 2 ó 3) o **tiempo en conversación real** (state 6).
 
### `ag_in_cp_log` — Estados del agente en campaña (PK: `code`)
| Columna | Tipo | Descripción |
|---|---|---|
| `code` | int | PK |
| `campaign` | int | FK → `ph_campaign.code` |
| `agent` | int | FK → `ph_e_user.code` |
| `start_time` | datetime | Inicio del estado |
| `duration` | int | Duración en segundos |
| `op_type` | smallint | **0=OpenClose · 1=Ready · 2=NotReady** |
| `reason` | int | FK → `not_ready_reason.code` (solo cuando op_type=2) |
 
### `user_log` — Logins de agentes (PK: `code`)
| Columna | Tipo | Descripción |
|---|---|---|
| `code` | int | PK |
| `e_user` | int | FK → `ph_e_user.code` |
| `start_time` | datetime | Momento de login |
| `duration` | int | Tiempo logado en segundos |
| `extension` | char(33) | Extensión del agente |
 
### `activity` — Contactos outbound (PK: `code`)
| Columna | Tipo | Descripción |
|---|---|---|
| `code` | int | PK |
| `campaign` | int | FK → `ph_campaign.code` |
| `status` | smallint | `0`=Started · `1`=Executing · `2`=Stopped · **`3`=Done** · `6`=Aborted · `17`=AbortedMaxTries · `19`=Canceled · `24`=AbortedBusy · `25`=AbortedMachine · `28`=AbortedNoAnswer |
| `business_status` | smallint | `1`=NotTouched · `3`=AutoRescheduled · `7`=QualifiedScheduled · **`8`=QualifiedDone** · **`9`=SuccessScheduled** · **`10`=SuccessDone** · `11`=UnsuccessfulSched · `12`=UnsuccessfulDone |
| `agent` | int | FK → `ph_e_user.code` |
| `moment` | datetime | Momento programado |
| `ntries_auto` | smallint | Intentos automáticos acumulados |
| `ntries_manual` | smallint | Reintentos manuales acumulados |
| `contact_profile` | int | FK → `ph_contact_profile.code` |
| `act_list` | int | FK → `ph_activity_list.code` |
 
### `script_session` — Sesiones de script (PK: `code`)
| Columna | Tipo | Descripción |
|---|---|---|
| `code` | int | PK |
| `service` / `campaign` | int | FK servicio / campaña |
| `e_user` | int | FK → `ph_e_user.code` |
| `start_time` | datetime | Inicio |
| `duration` | int | Duración en segundos |
| `business_status` | smallint | **1=NonQualified · 2=Qualified · 3=Success · 4=Unsuccessful** |
 
---
 
## 4. Relaciones clave
 
```
itr_global  (1) → (N) itr_thread    Una llamada puede tener varios hilos (transferencias)
itr_thread  (1) → (N) itr_segment   Un hilo tiene varios segmentos (routing/connected/wrapup)
itr_thread       →    ph_e_user      Agente que maneja
itr_thread       →    ph_campaign    Campaña
itr_thread       →    ph_service     Servicio
itr_thread       →    ph_activity_list  Lista de contactos
itr_thread       →    ph_contact_profile  Perfil del cliente
ph_campaign      →    cp_general_cfg →  ph_service   (servicio de la campaña)
ag_in_cp_log     →    ph_e_user      Estados del agente
ag_in_cp_log     →    not_ready_reason  Causa de no disponible
user_log         →    ph_e_user      Logins
activity         →    ph_campaign    Contactos outbound
activity         →    activity_history  Historial de intentos
itr_thread       →    activity       Contacto outbound asociado al hilo
flat_int_*       ≈    itr_thread + itr_global + script_session  (ya pre-joineado)
contacts_*       ≈    activity + ph_contact_profile  (ya pre-joineado, solo Done)
```
 
---
 
## 5. Cuándo usar flat tables vs. tablas de replicación
 
| Necesidad | Usar |
|---|---|
| KPI diario / semanal ya calculado | `flat_int_<servicio>` o `contacts_<servicio>` |
| Dashboard con datos de las últimas horas | `flat_int_<servicio>` (retraso ~15 min) |
| Logins y tiempo logado de agentes | `flat_agent_login` o `user_log` |
| Ready/NotReady de agentes | `flat_agent_cpg_operations` o `ag_in_cp_log` |
| Tiempo de cola exacto por segmento | `itr_segment` (solo tablas de replicación) |
| Cruzar con atributos personalizados del script | `act_<servicio>` + `itr_thread` |
| Cruzar con outcomes del script | `ao_<servicio>` + `script_session` |
| Datos en tiempo real (menos de 15 min de retraso) | Tablas de replicación directamente |
 
---
 
## 6. Reglas de rendimiento
 
1. **Filtrar siempre por fecha** con rangos explícitos sobre columnas indexadas:
   - ✅ `WHERE start_time >= '2024-01-01' AND start_time < '2025-01-01'`
   - ❌ `WHERE YEAR(start_time) = 2024` (no usa índice)
2. **`itr_thread`**: tabla de mayor volumen. Siempre filtrar por `start_time`.
3. **`activity_history`**: puede ser enorme en campañas outbound activas. Filtrar por `event_moment`.
4. **Flat tables con espacios en el nombre** (ej. `contacts_Xperience Routing`): usar corchetes:
   ```sql
   SELECT * FROM [contacts_Xperience Routing]
   ```
5. **Talk Time** = `itr_thread.duration - itr_thread.wrapup_duration`
6. **AHT** = `itr_thread.duration`
7. **Tiempo de cola** = suma de `itr_segment.duration` donde `state IN (2,3)`
---
 
## 7. Queries de referencia validadas
 
### 7.1 Explorar estructura de cualquier tabla
```sql
-- Cambiar 'itr_thread' por la tabla que quieras inspeccionar
SELECT COLUMN_NAME AS columna, DATA_TYPE AS tipo,
       IS_NULLABLE AS nulable, CHARACTER_MAXIMUM_LENGTH AS longitud
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'itr_thread'
ORDER BY ORDINAL_POSITION;
```
 
### 7.2 Ver campañas disponibles y su tipo
```sql
SELECT
    code            AS id_campania,
    shortname       AS nombre_corto,
    fullname        AS descripcion,
    CASE campaigntype
        WHEN 0 THEN 'Inbound'
        WHEN 1 THEN 'Outbound'
        WHEN 2 THEN 'Blended'
        WHEN 3 THEN 'Repository'
        ELSE 'Desconocido'
    END             AS tipo_campania
FROM ph_campaign
ORDER BY shortname;
```
 
### 7.3 Ver servicios y su campaña asociada
```sql
SELECT
    s.name          AS servicio,
    c.shortname     AS campania,
    CASE c.campaigntype
        WHEN 0 THEN 'Inbound'
        WHEN 1 THEN 'Outbound'
        WHEN 2 THEN 'Blended'
        ELSE 'Otro'
    END             AS tipo
FROM ph_service s
LEFT JOIN cp_general_cfg cfg ON s.code = cfg.service
LEFT JOIN ph_campaign    c   ON cfg.campaign = c.code
ORDER BY s.name;
```
 
### 7.4 Volumen de interacciones por día
```sql
DECLARE @FechaInicio DATE = '2024-01-01';
DECLARE @FechaFin    DATE = '2024-01-31';
 
SELECT
    CAST(t.start_time AS DATE)                                AS fecha,
    COUNT(DISTINCT g.code)                                    AS total_interacciones,
    SUM(CASE WHEN t.origin = 1 THEN 1 ELSE 0 END)            AS inbound,
    SUM(CASE WHEN t.origin = 2 THEN 1 ELSE 0 END)            AS outbound,
    SUM(CASE WHEN t.termination_state = 1 THEN 1 ELSE 0 END) AS atendidas,
    SUM(CASE WHEN t.termination_state = 6 THEN 1 ELSE 0 END) AS abandonadas,
    AVG(t.duration)                                           AS aht_medio_seg,
    AVG(t.wrapup_duration)                                    AS acw_medio_seg,
    AVG(t.duration - t.wrapup_duration)                       AS talk_time_medio_seg
FROM itr_thread t
INNER JOIN itr_global g ON t.itr_global = g.code
WHERE t.start_time >= @FechaInicio
  AND t.start_time <  DATEADD(DAY, 1, @FechaFin)
GROUP BY CAST(t.start_time AS DATE)
ORDER BY fecha;
```
 
### 7.5 Productividad de agentes por día
```sql
DECLARE @FechaInicio DATE = '2024-01-01';
DECLARE @FechaFin    DATE = '2024-01-31';
 
SELECT
    u.usr_name                             AS agente,
    u.fullname                             AS nombre_completo,
    CAST(t.start_time AS DATE)             AS fecha,
    COUNT(t.code)                          AS llamadas_atendidas,
    AVG(t.duration - t.wrapup_duration)    AS talk_time_medio_seg,
    AVG(t.wrapup_duration)                 AS acw_medio_seg,
    AVG(t.duration)                        AS aht_medio_seg,
    SUM(t.duration)                        AS tiempo_productivo_seg
FROM itr_thread t
INNER JOIN ph_e_user u ON t.e_user = u.code
WHERE t.start_time >= @FechaInicio
  AND t.start_time <  DATEADD(DAY, 1, @FechaFin)
  AND t.termination_state = 1   -- Solo atendidas
  AND u.type = 1                -- Solo agentes humanos
GROUP BY u.usr_name, u.fullname, CAST(t.start_time AS DATE)
ORDER BY fecha, agente;
```
 
### 7.6 Estados de agente en campaña (Ready / Not Ready / Logado)
```sql
DECLARE @FechaInicio DATE = '2024-01-01';
DECLARE @FechaFin    DATE = '2024-01-31';
 
SELECT
    u.usr_name                                                             AS agente,
    c.shortname                                                            AS campania,
    CAST(l.start_time AS DATE)                                             AS fecha,
    SUM(CASE WHEN l.op_type = 0 THEN ISNULL(l.duration,0) ELSE 0 END)    AS seg_logado,
    SUM(CASE WHEN l.op_type = 1 THEN ISNULL(l.duration,0) ELSE 0 END)    AS seg_ready,
    SUM(CASE WHEN l.op_type = 2 THEN ISNULL(l.duration,0) ELSE 0 END)    AS seg_no_ready,
    CASE
        WHEN SUM(CASE WHEN l.op_type = 0 THEN ISNULL(l.duration,0) ELSE 0 END) > 0
        THEN CAST(
            SUM(CASE WHEN l.op_type = 1 THEN ISNULL(l.duration,0) ELSE 0 END) * 100.0 /
            SUM(CASE WHEN l.op_type = 0 THEN ISNULL(l.duration,0) ELSE 0 END)
            AS DECIMAL(5,2))
        ELSE 0
    END                                                                    AS pct_ready
FROM ag_in_cp_log l
INNER JOIN ph_e_user   u ON l.agent    = u.code
INNER JOIN ph_campaign c ON l.campaign = c.code
WHERE l.start_time >= @FechaInicio
  AND l.start_time <  DATEADD(DAY, 1, @FechaFin)
GROUP BY u.usr_name, c.shortname, CAST(l.start_time AS DATE)
ORDER BY fecha, agente;
```
 
### 7.7 Penetración de lista outbound por campaña
```sql
DECLARE @FechaInicio DATE = '2024-01-01';
DECLARE @FechaFin    DATE = '2024-01-31';
 
SELECT
    c.shortname                                                     AS campania,
    al.name                                                         AS lista,
    COUNT(a.code)                                                   AS total_contactos,
    SUM(CASE WHEN a.status = 3               THEN 1 ELSE 0 END)    AS done,
    SUM(CASE WHEN a.business_status IN (9,10)  THEN 1 ELSE 0 END)  AS exitos,
    SUM(CASE WHEN a.business_status IN (11,12) THEN 1 ELSE 0 END)  AS sin_exito,
    SUM(CASE WHEN a.business_status IN (1,2,3) THEN 1 ELSE 0 END)  AS sin_contacto,
    AVG(CAST(a.ntries_auto AS FLOAT))                               AS intentos_auto_medio
FROM activity a
INNER JOIN ph_campaign      c  ON a.campaign = c.code
INNER JOIN ph_activity_list al ON a.act_list  = al.code
WHERE a.moment >= @FechaInicio
  AND a.moment <  DATEADD(DAY, 1, @FechaFin)
GROUP BY c.shortname, al.name
ORDER BY campania, lista;
```
 
### 7.8 Razones de No Disponible por agente
```sql
DECLARE @FechaInicio DATE = '2024-01-01';
DECLARE @FechaFin    DATE = '2024-01-31';
 
SELECT
    u.usr_name                       AS agente,
    ISNULL(r.name, 'Sin razón')      AS razon_no_disponible,
    COUNT(*)                         AS veces,
    SUM(ISNULL(l.duration, 0))       AS segundos_total,
    AVG(ISNULL(l.duration, 0))       AS segundos_medio
FROM ag_in_cp_log l
INNER JOIN ph_e_user       u ON l.agent  = u.code
LEFT  JOIN not_ready_reason r ON l.reason = r.code
WHERE l.op_type = 2   -- Solo registros No Disponible
  AND l.start_time >= @FechaInicio
  AND l.start_time <  DATEADD(DAY, 1, @FechaFin)
GROUP BY u.usr_name, ISNULL(r.name, 'Sin razón')
ORDER BY agente, segundos_total DESC;
```
