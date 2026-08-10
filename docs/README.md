# Documentação — Boletim Audiovisual

Esta pasta registra a **arquitetura atual** e a **arquitetura proposta** para a evolução do
_Boletim Diário de Câmera_ (PWA local, single-user) em uma **plataforma colaborativa de
documentação de produção audiovisual** (Câmera + Som + Continuidade, multiusuário,
sincronizada, capaz de operar offline).

> **Nome interno provisório da plataforma:** `Boletim Audiovisual`
> **Núcleo preservado:** o Boletim de Câmera continua sendo o módulo principal e **não pode
> regredir** em funcionalidade.

## Por onde começar

1. [plano-arquitetural-v2.md](plano-arquitetural-v2.md) — **as decisões que valem hoje**
   (fronteira offline, conflitos, polling, sem fotos, skills, roadmap, riscos).
2. [decisions.md](decisions.md) — o histórico completo, com os blocos "Revisto em".
3. Os documentos de arquitetura, para o detalhe de cada área.

Onde um documento antigo conflitar com o plano v2, **o plano v2 vence**.

## Índice

### Decisões e planejamento

| Documento                                            | Conteúdo                                                                                                |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| [plano-arquitetural-v2.md](plano-arquitetural-v2.md) | **Decisões finais da rodada 2** — arquitetura, banco, sync, conflitos, offline, skills, roadmap, riscos |
| [risks-response.md](risks-response.md)               | Retorno do proprietário sobre os riscos (entrada da rodada 2)                                           |
| [decisions.md](decisions.md)                         | Registro de decisões (ADR-001 … ADR-028), imutável por reescrita                                        |
| [risks.md](risks.md)                                 | Matriz de risco vigente, com status                                                                     |
| [roadmap.md](roadmap.md)                             | Fases, ordem de implementação e critérios de conclusão                                                  |

### Arquitetura

| Documento                                                          | Conteúdo                                                          |
| ------------------------------------------------------------------ | ----------------------------------------------------------------- |
| [architecture/current-state.md](architecture/current-state.md)     | **Análise do estado atual**: stack, modelo de dados, o que reusar |
| [architecture/overview.md](architecture/overview.md)               | Arquitetura proposta, camadas, estrutura de pastas, princípios    |
| [architecture/database.md](architecture/database.md)               | Modelo relacional (Neon/Postgres) + DDL de referência             |
| [architecture/authentication.md](architecture/authentication.md)   | Avaliação e escolha da solução de autenticação                    |
| [architecture/permissions.md](architecture/permissions.md)         | Papel na sala × Departamento; matriz de autorização               |
| [architecture/offline-first.md](architecture/offline-first.md)     | Fronteira offline, banco local (Dexie), fixação de diária, PWA    |
| [architecture/synchronization.md](architecture/synchronization.md) | Outbox, pull por cursor, conflitos por campo, polling             |
| [migrations/local-to-cloud.md](migrations/local-to-cloud.md)       | Importação opcional dos boletins locais                           |

### Módulos

| Documento                                                  | Conteúdo                                                  |
| ---------------------------------------------------------- | --------------------------------------------------------- |
| [features/camera.md](features/camera.md)                   | Boletim de Câmera — estado atual e evolução               |
| [features/sound.md](features/sound.md)                     | Boletim de Som — modelo, tracks dinâmicas, status rápidos |
| [features/continuity.md](features/continuity.md)           | Boletim de Continuidade — props, figurino, cenografia     |
| [features/production-room.md](features/production-room.md) | Sala / dashboard da produção, visão consolidada da diária |

## Estado da implementação

| Fase                                               | Status                           |
| -------------------------------------------------- | -------------------------------- |
| **Fase 1** — Arquitetura                           | ✅ concluída                     |
| **Fase 1.5** — Preparação (rodada 2)               | ✅ concluída                     |
| **Fase 2** — Fundação servidor (Neon/Drizzle/Auth) | ✅ concluída (falta só o deploy) |
| **Fase 3** — Sala (produções, membros, diárias)    | ✅ concluída                     |
| **Fase 4** — Superfície offline + sync             | ✅ concluída                     |
| Fase 5 — Câmera na plataforma                      | ⏳ próxima                       |
| Fases 6–10                                         | 📋 planejadas                    |

O código da plataforma está em [`domain/platform/`](../domain/platform) (modelo compartilhado,
regras de set e o mapeador do `Boletim` v2), [`lib/db/`](../lib/db) e [`lib/auth/`](../lib/auth)
(schema, queries e guardas), [`app/(app)/`](<../app/(app)>) + `features/production/` (as telas
da sala) e [`lib/offline/`](../lib/offline) + [`lib/sync/`](../lib/sync) + `app/api/sync/` (a
superfície de diária e o motor de sincronização). O aplicativo de câmera segue intacto: fora do reforço do fallback de
[`utils/id.ts`](../utils/id.ts), o que mudou nele foi o modo não controlado de `TextField` e
`TextAreaField` — aditivo, para os formulários de Server Action.
