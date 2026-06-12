# Esquema real de RDBv2 — introspección 2026-06-12T16:29:14.612Z

Servidor: 192.168.151.21 · BBDD: RDBv2

## 1. Tablas clave y volúmenes

| Tabla | Estado | Filas |
|---|---|---:|
| itr_thread | ✅ | 1127715 |
| itr_global | ✅ | 1023200 |
| itr_segment | ✅ | 3735350 |
| ph_e_user | ✅ | 284 |
| ph_campaign | ✅ | 186 |
| ph_service | ✅ | 33 |
| cp_general_cfg | ✅ | 272 |
| ag_in_cp_log | ✅ | 7072791 |
| user_log | ✅ | 109130 |
| activity | ✅ | 822547 |
| activity_history | ✅ | 1702005 |
| script_session | ✅ | 1099471 |
| not_ready_reason | ✅ | 41 |
| ph_activity_list | ✅ | 579 |
| rdb_enums | ✅ | 314 |
| flat_agent_login | ✅ | 78042 |
| flat_agent_cpg_operations | ✅ | 5662501 |

Total de tablas en la BBDD: 220

## 2. Enumerados (rdb_enums)

### AddressType
- -1 = NoValue
- 0 = Invalid
- 1 = HomePhone
- 10 = HomeFax
- 11 = BusinessFax
- 12 = InstantMessaging1
- 13 = InstantMessaging2
- 14 = InstantMessaging3
- 15 = AdditionalPhone2
- 16 = AdditionalPhone3
- 17 = AdditionalPhone4
- 18 = AdditionalPhone5
- 19 = AdditionalPhone6
- 2 = BusinessPhone
- 20 = AdditionalPhone7
- 21 = AdditionalPhone8
- 22 = AdditionalPhone9
- 23 = AdditionalPhone10
- 24 = AdditionalPhone11
- 25 = AdditionalPhone12
- 26 = AdditionalPhone13
- 27 = AdditionalPhone14
- 28 = AdditionalPhone15
- 29 = Facebook
- 3 = MobilePhone
- 30 = Twitter
- 31 = Instagram
- 32 = LinkedIn
- 33 = FacebookMessenger
- 34 = TwitterIM
- 35 = WhatsApp
- 36 = Sms
- 37 = Viber
- 38 = InstagramMessenger
- 39 = LinkedInMessenger
- 4 = OtherPhone
- 40 = AppleBusinessChat
- 41 = GoogleRcs
- 5 = AdditionalPhone1
- 6 = ReschedulePhone
- 7 = Email1
- 8 = Email2
- 9 = Email3
### AgentInCampaignOperationLogType
- -1 = NoValue
- 0 = OpenClose
- 1 = Ready
- 2 = NotReady
### AgentType
- -1 = NoValue
- 1 = Human
- 3 = Ivr
- 5 = Routing
### BusinessStatus
- -1 = NoValue
- 1 = NonQualified
- 2 = Qualified
- 3 = SuccessActivity
- 4 = Unsuccessful
### CampaignType
- -1 = NoValue
- 0 = Inbound
- 1 = Outbound
- 2 = Blended
- 3 = Repository
### ContactBusinessStatus
- -1 = NoValue
- 1 = NotTouchedScheduled
- 10 = SuccessDone
- 11 = UnsuccessfulScheduled
- 12 = UnsuccessfulDone
- 13 = CanceledBeforeConnection
- 14 = NonQualifiedAborted
- 15 = NonQualifiedCanceled
- 16 = QualifiedAborted
- 17 = QualifiedCanceled
- 18 = SuccessAborted
- 19 = SuccessCanceled
- 2 = NotTouchedDone
- 20 = UnsuccessfulAborted
- 21 = UnsuccessfulCanceled
- 22 = Overflowed
- 3 = AutomaticallyRescheduled
- 4 = AbortedBeforeConnection
- 5 = NonQualifiedScheduled
- 6 = NonQualifiedDone
- 7 = QualifiedScheduled
- 8 = QualifiedDone
- 9 = SuccessScheduled
### ContactEventActionType
- 0 = LoaderCreation
- 1 = SupervisorCreation
- 10 = SupervisorActivate
- 11 = AutomaticOutboundFailureRule
- 12 = NextOutboundRuleResubmit
- 13 = RecoveredBySystem
- 14 = LoaderResubmit
- 15 = LoaderCancel
- 16 = LoaderSuspend
- 17 = ExternalValidationCancel
- 18 = AutomaticOutboundAborted
- 19 = SupervisorOverflow
- 2 = SupervisorUpdate
- 20 = SupervisorActivateFromOverflow
- 21 = InternalReject
- 22 = SupervisorMobilize
- 23 = RemoteMacroDisable
- 24 = RemoteMacroActivate
- 25 = AgentUpdateUnreserved
- 26 = MoveToCampaign
- 27 = MoveToCampaignLoad
- 28 = ExternalValidationFailedTry
- 29 = ExternalValidationUpdate
- 3 = SupervisorResubmit
- 30 = AutomaticOutboundNumberInDoNotCallList
- 31 = AutomaticWorkflowAborted
- 4 = AutomaticOutboundFailedTry
- 5 = AgentCreation
- 6 = AutomaticOutboundAgentScript
- 7 = AgentUpdate
- 8 = SupervisorCancel
- 9 = SupervisorSuspend
### ContactEventOutcomeType
- -1 = NoValue
- 0 = NoOutcome
- 1 = NonQualifiedCall
- 10 = InvalidNumber
- 11 = Overflow
- 12 = TrunkLineOverflow
- 13 = Rona
- 14 = Modem
- 15 = Fax
- 16 = MaxTriesReached
- 17 = Invalid
- 18 = InvalidAddress
- 19 = AgentLost
- 2 = Presentation
- 20 = Timeout
- 21 = Unsuccessful
- 24 = MaxTriesBusy
- 25 = MaxTriesMachine
- 26 = MaxTriesModem
- 27 = MaxTriesFax
- 28 = MaxTriesNoAnswer
- 29 = MaxTriesRejected
- 3 = BusinessSuccess
- 30 = MaxTriesInvalidNumber
- 31 = MaxTriesOverflow
- 32 = MaxOutboundRuleTriesBusy
- 33 = MaxOutboundRuleTriesMachine
- 34 = MaxOutboundRuleTriesModem
- 35 = MaxOutboundRuleTriesFax
- 36 = MaxOutboundRuleTriesNoAnswer
- 37 = MaxOutboundRuleTriesRejected
- 38 = MaxOutboundRuleTriesInvalidNumber
- 39 = MaxAddressTypeTriesBusy
- 4 = Busy
- 40 = MaxAddressTypeTriesMachine
- 41 = MaxAddressTypeTriesModem
- 42 = MaxAddressTypeTriesFax
- 43 = MaxAddressTypeTriesNoAnswer
- 44 = MaxAddressTypeTriesRejected
- 45 = MaxAddressTypeTriesInvalidNumber
- 46 = CustomCallStatus1
- 47 = CustomCallStatus2
- 48 = CustomCallStatus3
- 49 = CustomCallStatus4
- 5 = Machine
- 50 = CustomCallStatus5
- 51 = MaxTriesCustomCallStatus1
- 52 = MaxTriesCustomCallStatus2
- 53 = MaxTriesCustomCallStatus3
- 54 = MaxTriesCustomCallStatus4
- 55 = MaxTriesCustomCallStatus5
- 56 = MaxOutboundRuleTriesCustomCallStatus1
- 57 = MaxOutboundRuleTriesCustomCallStatus2
- 58 = MaxOutboundRuleTriesCustomCallStatus3
- 59 = MaxOutboundRuleTriesCustomCallStatus4
- 6 = NoAnswer
- 60 = MaxOutboundRuleTriesCustomCallStatus5
- 61 = MaxAddressTypeTriesCustomCallStatus1
- 62 = MaxAddressTypeTriesCustomCallStatus2
- 63 = MaxAddressTypeTriesCustomCallStatus3
- 64 = MaxAddressTypeTriesCustomCallStatus4
- 65 = MaxAddressTypeTriesCustomCallStatus5
- 7 = Nuisance
- 8 = Discarded
- 9 = Rejected
### ContactSchedulingStatus
- 0 = Scheduled
- 1 = NotScheduled
### Gender
- -1 = NoValue
- 0 = Male
- 1 = Female
### InteractionDetailedStatus
- -1 = NoValue
- 0 = Started
- 1 = Executing
- 10 = Created
- 16 = Cached
- 17 = AbortedMaxTries
- 18 = RecoveringFromExecuting
- 19 = Canceled
- 2 = Stopped
- 20 = Suspended
- 24 = AbortedBusy
- 25 = AbortedMachine
- 26 = AbortedModem
- 27 = AbortedFax
- 28 = AbortedNoAnswer
- 29 = AbortedNuisance
- 3 = Done
- 30 = AbortedNoAddresses
- 33 = AbortedRejected
- 34 = AbortedInvalidNumber
- 35 = AbortedOverflow
- 36 = AbortedLineOverflow
- 37 = AbortedTimeout
- 38 = AbortedWorkflow
- 39 = BeingSuspended
- 40 = BeingCanceled
- 42 = Aborted
- 43 = Disabled
- 44 = Restart
- 45 = AbortedCustomCallStatus1
- 46 = AbortedCustomCallStatus2
- 47 = AbortedCustomCallStatus3
- 48 = AbortedCustomCallStatus4
- 49 = AbortedCustomCallStatus5
- 6 = AbortedByAgentLost
- 8 = Invalid
- 9 = Rejected
### InteractionOrigin
- -1 = NoValue
- 1 = Inbound
- 2 = Outbound
- 3 = Workflow
- 4 = OnlyData
### InteractionSegmentState
- -1 = NoValue
- 1 = Setup
- 10 = PreviewRetry
- 11 = Handling
- 12 = Retention
- 13 = Interrupted
- 2 = Pending
- 3 = Routing
- 4 = Dialing
- 5 = Alerting
- 6 = Connected
- 7 = Held
- 8 = WrapUp
- 9 = PreviewAnalysis
### InteractionTerminationStatus
- -1 = NoValue
- 1 = Handled
- 10 = TrunkLineOverflow
- 11 = Redirected
- 12 = Modem
- 13 = Fax
- 14 = Discarded
- 15 = Routed
- 16 = AbortedByAgentLost
- 17 = Canceled
- 18 = ReEnqueued
- 19 = CustomCallStatus1
- 2 = Busy
- 20 = CustomCallStatus2
- 21 = CustomCallStatus3
- 22 = CustomCallStatus4
- 23 = CustomCallStatus5
- 3 = Machine
- 4 = NoAnswer
- 5 = Nuisance
- 6 = Abandoned
- 7 = Rejected
- 8 = InvalidNumber
- 9 = Overflow
### NotReadyReasonGuiName
- Cleanup = NREADY_REASON_CLEANUP
- Force Abandon = NREADY_REASON_CP_ABANDON
- Forced = EL_FINREADY_REASON_FORCED
- Not Yet Working = NREADY_REASON_NOT_WORKING
- Rotate On Error = EL_FINREADY_REASON_ROE
- Rotate On No Answer = EL_FINREADY_REASON_RONA
- Sign Off = NREADY_REASON_SIGNOFF
- Unknown = EL_FINREADY_REASON_UNKNOWN
- Voluntary Wrap Up = EL_FINREADY_REASON_WRAPUP
### NotReadyReasonType
- -1 = NoValue
- 0 = NotWorking
- 1 = Working
### RecordingStatus
- 0 = Recorded
- 1 = PartiallyRecorded
- 2 = FailedRecording
- 3 = NotRecorded
### RecordingTerminationReason
- -1 = NoValue
- 1 = Requested
- 10 = ChannelNotReady
- 11 = CallDisconnected
- 2 = Restarted
- 3 = SilenceDetected
- 4 = ConnectionLost
- 5 = Malfunction
- 6 = LowDiskSpace
- 7 = LinkDown
- 8 = FileOperationError
- 9 = HardwareFailure
### RecordingType
- 0 = Telephony
- 1 = Screen
- 2 = ScreenAndTelephony
- 3 = InstantMessaging
- 4 = Email
- 5 = Pbxsim
- 6 = Other
### WorkflowTaskType
- -1 = NoValue
- 0 = Initial
- 1 = Final
- 10 = Assign
- 11 = Delay
- 2 = AgentPush
- 3 = RoutingAgent
- 4 = Subprocess
- 5 = OutboundContact
- 6 = AgentPickUp
- 7 = External
- 8 = WaitForEvent
- 9 = TriggerEvent

## 3. Verificación de unidades de duration (¿décimas de segundo?)

Muestras: 500 · ratio mediano duration/segundos = 10.00
✅ CONFIRMADO: duration en DÉCIMAS de segundo (dividir entre 10.0).

## 4. Frescura de datos

- Replicación (itr_thread): retraso 5 min
- Flat tables (flat_agent_login): retraso 24 min

## 5. Campañas con actividad (últimos 30 días)

| Campaña | Tipo | Hilos 30d |
|---|---|---:|
| Soc_nuevos | 1 | 13.034 |
| Bol_Fed_Cli_2 | 1 | 10.794 |
| Bol_Fun_Cli_2 | 1 | 10.103 |
| Bol_Fun_Cli_1 | 1 | 9549 |
| IVR_GrupoHuertas | 0 | 7940 |
| Bol_Fed_Cli_1 | 1 | 5560 |
| Bol_Fed_Canarias | 1 | 2881 |
| Bol_Fun_Canarias | 1 | 2506 |
| Soc_Avisos | 1 | 2005 |
| Bol_Fun_N_2 | 1 | 1999 |
| Bol_Fun_N_1 | 1 | 1896 |
| gh_la_mur_toyota | 0 | 1887 |
| gh_dimovil_mer | 0 | 1874 |
| gh_bbdd_dimovil | 1 | 1860 |
| Bol_0567 | 1 | 1850 |
| gh_hm_mur_audi | 0 | 1734 |
| gh_gra_pre_mer | 0 | 1667 |
| gh_us_gougo_mur | 0 | 1421 |
| gh_mg_mur | 0 | 1411 |
| Bol_0506 | 1 | 1247 |
| gh_huertas_ocasion | 0 | 1183 |
| gh_hm_car_audi | 0 | 1148 |
| Bol_0745 | 1 | 1124 |
| Bol_0365 | 1 | 1121 |
| Bol_0556 | 1 | 1115 |
| Wit_Camara_Sub | 1 | 928 |
| Bol_0260 | 1 | 924 |
| gh_mg_alm | 0 | 858 |
| gh_aclasse_mer | 0 | 849 |
| IVR_TMSYSTEM | 0 | 813 |
| gh_la_mur_lexus | 0 | 731 |
| Soc_nuevos_prim | 1 | 664 |
| gh_mur_seat | 0 | 630 |
| gh_us_gougo_car | 0 | 613 |
| gh_cupra_espi | 0 | 582 |
| Bol_1034 | 1 | 581 |
| Soc_repesca | 1 | 569 |
| Avo_Audi_Ren2026 | 0 | 562 |
| gh_hm_mur_vw | 0 | 547 |
| CajaR_Negoc_26 | 1 | 510 |
| IVR_Avolo | 0 | 499 |
| gh_skoda_mur | 0 | 493 |
| gh_bbdd_granada | 1 | 483 |
| gh_motor_peng_ali | 0 | 467 |
| gh_us_gougo_torre | 0 | 423 |
| gh_ebro_mur | 0 | 375 |
| gh_motor_car_hy | 0 | 365 |
| Bol_Incid | 1 | 309 |
| gh_bbdd_autoclasse | 1 | 298 |
| VW_Linares | 0 | 296 |
| gh_hm_vw_lcv | 0 | 292 |
| gh_dim_mer_indu | 0 | 272 |
| gh_car_seat | 0 | 268 |
| Entrantes | 0 | 252 |
| gh_us_gougo_mark | 0 | 251 |
| VW | 0 | 250 |
| VW_Ubeda | 0 | 234 |
| gh_la_car_toyota | 0 | 231 |
| Soc_Incidencias | 1 | 214 |
| Bol_0969 | 1 | 209 |
| Bol_0516 | 1 | 204 |
| gh_hm_car_vw | 0 | 180 |
| Audi | 0 | 167 |
| Wit_Camara | 1 | 157 |
| Bol_0927 | 1 | 129 |
| gh_skoda_torre | 0 | 120 |
| gh_autocarsa | 0 | 105 |
| gh_motor_peng_mur | 0 | 89 |
| gh_cupra_cart | 0 | 75 |
| gh_mg_cart | 0 | 68 |
| Skoda | 0 | 59 |
| Nissan | 0 | 56 |
| IVR_AvoloRenov | 0 | 54 |
| CajaR_Hipotecas_26 | 1 | 54 |
| gh_la_toyota_sj | 0 | 51 |
| gh_hyundai_sj | 0 | 46 |
| IVR_Wit | 0 | 38 |
| gh_skoda_car | 0 | 35 |
| gh_la_toyota_et | 0 | 34 |
| gh_motor_dong_mur | 0 | 25 |
| Test_CajaR_Negoc | 1 | 22 |
| Nissan_Linares | 0 | 21 |
| Soc_GC | 1 | 20 |
| Seat_Linares | 0 | 17 |
| gh_motor_dong_ali | 0 | 14 |
| Seat_Cupra | 0 | 13 |
| Bolsas_GC | 1 | 10 |
| Test_Huertas | 1 | 3 |
| Test_Wit_Camsub | 1 | 2 |
| Audi_Linares | 0 | 2 |
| gh_ind_iveco | 0 | 1 |

## 6. Estructura de activity_history (fecha real de leads finalizados)

| Columna | Tipo | Nulable |
|---|---|---|
| code | bigint | NO |
| activity | int | NO |
| event_moment | datetime | NO |
| event_action | smallint | NO |
| addr_type | smallint | YES |
| event_outcome | smallint | YES |
| schedule_status | smallint | NO |
| event_agent | int | YES |
| script_session | int | YES |
| itr_thread | bigint | YES |
| directory | int | YES |
| contact_profile | int | YES |
| active_campaign | int | YES |

> Con esta estructura, decidir si la fecha de cierre del lead debe salir del último evento de activity_history en lugar de activity.moment (ver CLAUDE.md, validaciones pendientes).