# Documentação — Boletim Audiovisual

Esta pasta registra a **arquitetura atual** e a **arquitetura proposta** para a evolução do
_Boletim Diário de Câmera_ (PWA local, single-user) em uma **plataforma colaborativa de
documentação de produção audiovisual** (Câmera + Som + Continuidade, multiusuário,
offline-first, sincronizada).

> **Nome interno provisório da plataforma:** `Boletim Audiovisual`
> **Núcleo preservado:** o Boletim de Câmera continua sendo o módulo principal e **não pode
> regredir** em funcionalidade.

## Índice

### Análise e decisões

| Documento                                                          | Conteúdo                                                                    |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| [architecture/current-state.md](architecture/current-state.md)     | **Análise do estado atual**: stack, modelo de dados, o que reusar/refatorar |
| [architecture/overview.md](architecture/overview.md)               | Arquitetura proposta, camadas, estrutura de pastas, princípios              |
| [architecture/database.md](architecture/database.md)               | Modelo de dados relacional (Neon/Postgres) + DDL de referência              |
| [architecture/authentication.md](architecture/authentication.md)   | Avaliação e escolha da solução de autenticação                              |
| [architecture/permissions.md](architecture/permissions.md)         | Papel na sala × Departamento; matriz de autorização                         |
| [architecture/offline-first.md](architecture/offline-first.md)     | Banco local (IndexedDB/Dexie), fotos offline, PWA                           |
| [architecture/synchronization.md](architecture/synchronization.md) | Sync queue, pull incremental, conflitos, realtime                           |
| [migrations/local-to-cloud.md](migrations/local-to-cloud.md)       | Migração dos dados locais existentes para o novo modelo                     |
| [roadmap.md](roadmap.md)                                           | Roadmap por fases + critérios de conclusão                                  |
| [risks.md](risks.md)                                               | Riscos técnicos, impacto e mitigação                                        |
| [decisions.md](decisions.md)                                       | Registro enxuto de decisões (ADR)                                           |

### Módulos

| Documento                                                  | Conteúdo                                                  |
| ---------------------------------------------------------- | --------------------------------------------------------- |
| [features/camera.md](features/camera.md)                   | Boletim de Câmera — estado atual e evolução               |
| [features/sound.md](features/sound.md)                     | Boletim de Som — modelo, tracks dinâmicas, status rápidos |
| [features/continuity.md](features/continuity.md)           | Boletim de Continuidade — props, figurino, fotos          |
| [features/production-room.md](features/production-room.md) | Sala / dashboard da produção, visão consolidada da diária |

## Estado da implementação

| Fase                            | Status        |
| ------------------------------- | ------------- |
| **Fase 1** — Arquitetura        | ✅ concluída  |
| Fase 2 — Backend (Neon/Drizzle) | ⏳ próxima    |
| Fases 3–10                      | 📋 planejadas |

O que a Fase 1 entregou em **código** (além desta documentação) está em
[`domain/platform/`](../domain/platform) — o modelo de domínio compartilhado, as regras de
automação de set (herança, incremento, reset de take) e o mapeador do `Boletim` v2 para o novo
modelo. É código puro, sem dependências e sem I/O; **nada do aplicativo atual foi alterado**.
