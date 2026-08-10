# Sala / Produção

A **Sala** é a tela onde os três departamentos se encontram. É a diferença entre "três
formulários digitais" e "uma fonte compartilhada de verdade da diária" (§48).

Lembrando a decisão de modelagem: **sala não é uma tabela**. É a projeção colaborativa de uma
`Production` — ver [../architecture/overview.md §4](../architecture/overview.md#4-conceito-de-sala).

---

## 1. Navegação

```
LOGIN → MINHAS PRODUÇÕES → FILME X → SALA
                                       ├── Diária 12
                                       │     ├── Câmera
                                       │     ├── Som
                                       │     ├── Continuidade
                                       │     └── Consolidado
                                       ├── Equipamentos
                                       ├── Membros
                                       ├── Busca
                                       └── Relatórios
```

## 2. Entrar e sair

| Ação                        | Quem                                               |
| --------------------------- | -------------------------------------------------- |
| Criar produção              | qualquer usuário → vira `OWNER`                    |
| Entrar por código           | qualquer usuário autenticado → `MEMBER`            |
| Ver membros e departamentos | qualquer membro                                    |
| Sair                        | qualquer membro exceto o `OWNER` (transfere antes) |
| Convidar / remover          | `OWNER`, `ADMIN`                                   |

```
Sala: Filme X
Código: FILMEX-8K2P
Data: 10/08/2026

Gabriel — Câmera        Maria  — Continuidade
João    — Som           Carlos — Direção
```

Regras do código de convite em
[../architecture/permissions.md §4](../architecture/permissions.md#4-entrada-na-sala).

## 3. Dashboard (§24)

```
┌─────────────────────────────────────────────────────┐
│ FILME X · DIÁRIA 12 · 10/08/2026        ● ONLINE    │
├─────────────────────────────────────────────────────┤
│ Cena 24B · Setup C · Take 5                         │
├──────────────┬──────────────┬───────────────────────┤
│ CÂMERA       │ SOM          │ CONTINUIDADE          │
│ ARRI Alexa 35│ SD 833       │ Take 5 · CIRCLE       │
│ 35mm T2.8    │ Boom + 2 lav │ João pega o copo com  │
│ ISO 800      │ Roll 004     │ a mão direita         │
│ Card A012    │ TC 14:32:10  │ Maria entra pela esq. │
│ ✔ sincronizado│ ✔ sincronizado│ ⟳ sincronizando      │
├──────────────┴──────────────┴───────────────────────┤
│ Membros online: Gabriel · João · Maria              │
│ Último cartão A012 · Último roll 004                │
└─────────────────────────────────────────────────────┘
```

Cada bloco é **somente leitura** aqui — a sala é o painel de consulta; a edição acontece
dentro do módulo de cada departamento. Isso evita a pior classe de erro possível: alguém
editar o dado de outro departamento por engano de toque.

Origem de cada informação:

| Bloco                 | Fonte                                                                                                              |
| --------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Cena/Setup/Take atual | Take mais recente da diária (`takes.created_at`)                                                                   |
| Câmera                | `camera_take_data` desse take                                                                                      |
| Som                   | `sound_take_data` + `sound_take_tracks`                                                                            |
| Continuidade          | `continuity_take_data`                                                                                             |
| Equipamento do dia    | `equipment_assignments` da diária (§23)                                                                            |
| Membros online        | `production_members.last_seen_at`, atualizado no próprio pull — sem canal separado                                 |
| Status de sync        | fila local **por departamento** — ver [synchronization.md §6](../architecture/synchronization.md#6-estado-visível) |

Offline, o dashboard mostra o **último estado conhecido**, com a hora da última
sincronização — nunca uma tela vazia. Dado velho rotulado é infinitamente melhor que um
spinner em locação sem sinal.

## 4. Equipamentos (§22, §23)

`equipment` é da produção, com `department` e `category`. `equipment_assignments` responde
**"o que estamos usando hoje?"** por diária e por departamento.

```
CÂMERA hoje                     SOM hoje
  Camera A — ARRI Alexa 35        Sound Devices 833
  Cooke S8/i 32mm                 MKH 50 · MKH 416 · DPA 4060
                                  Tentacle Sync
```

Visível a todos os departamentos — é a resposta direta ao objetivo de um departamento saber o
que os outros estão usando.

## 5. Busca e filtros (§35, §36)

Busca **global dentro da produção**, cruzando módulos:

```
"A012"     → todos os takes com esse cartão
"24B"      → a cena, seus setups e takes
"MKH 416"  → o equipamento e as tracks que o usaram
"João"     → membro, personagem, tracks de lav
```

Filtros combináveis: diária, cena, setup, take, departamento, usuário, equipamento, status,
data.

Implementação: **local primeiro** (índices do Dexie), porque busca precisa funcionar offline;
o servidor complementa com full-text quando online, para o que ainda não foi baixado. Os dois
caminhos entregam o mesmo formato de resultado.

## 6. Visão consolidada da diária (§8 do roadmap)

Um take, os três departamentos, lado a lado — relacionados por `take_id`, sem conciliação:

```
Cena 24B · Setup C · Take 5
  CÂMERA        A CAM · A012 · A012C005_001 · 35mm T2.8 · ISO 800 · CIRCLE
  SOM           Roll 004 · 004_005.wav · TC 14:32:10:12 · CIRCLE
  CONTINUIDADE  CIRCLE · João pega o copo com a mão direita
```

É a mesma consulta que alimenta o relatório consolidado (Fase 9).
