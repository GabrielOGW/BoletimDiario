# Sala / Produção

A **Sala** é a tela onde os três departamentos se encontram. É a diferença entre "três
formulários digitais" e "uma fonte compartilhada de verdade da diária" (§48).

Lembrando a decisão de modelagem: **sala não é uma tabela**. É a projeção colaborativa de uma
`Production` — ver [../architecture/overview.md §4](../architecture/overview.md#4-conceito-de-sala).

> **Status (Fase 3): implementada, sem os blocos de departamento.** Existem hoje
> `/producoes` (listar, criar, entrar por código), `/p/[productionId]` (painel),
> `/p/[productionId]/membros` e `/p/[productionId]/diarias` (listar, criar, abrir, editar,
> excluir). Código em `app/(app)/` e `features/production/`.
>
> Tudo aqui é **Next.js comum**: Server Components lendo Drizzle, Server Actions para mutação,
> zero Dexie e zero outbox. São operações de preparação, feitas sentado e com sinal — a
> fronteira offline (ADR-016) começa só dentro da diária.
>
> O que ainda não existe: os blocos de Câmera/Som/Continuidade do §3 (dependem dos módulos,
> Fases 5–7), equipamentos (§4), busca (§5) e visão consolidada (§6).

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

O código fica visível para **todo membro**, não só para o administrador: quem chegou atrasado
no set precisa entrar sem depender de o `ADMIN` estar por perto. Rotacionar e fechar a sala
continuam sendo `ADMIN`+, e essa decisão é do servidor — a interface só deixa de oferecer o
botão que não funcionaria.

**Diárias** (`ShootingDay`) são criadas por `ADMIN`+ e lidas por qualquer membro; quem não
pode editar vê o mesmo conteúdo sem formulário. Duas unidades no mesmo dia são duas diárias —
a unidade entra na chave. O id é derivado de `(produção, data, unidade)`, o que faz criar a
mesma diária duas vezes convergir para o mesmo registro em vez de duplicar (ADR-019).

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

### Como ficou — Fase 8, `2026-08-12`

Duas telas, ambas **fora da fronteira offline** (ADR-016), porque cadastrar e alocar são
preparação — feitas sentadas, com sinal:

- **`/p/[id]/equipamentos`** — o catálogo da produção, agrupado por departamento.
  [`EquipmentList`](../../features/production/EquipmentList.tsx), formulário não controlado
  de Server Action, como todo formulário da sala.
- **Painel na diária** — [`EquipmentDoDia`](../../features/production/EquipmentDoDia.tsx),
  dentro de `/p/[id]/diarias/[dayId]`. Alocar escolhe do catálogo; o **departamento vem do
  equipamento**, não do formulário, senão a continuísta acabaria procurando o boom na lista
  da câmera.

**Qualquer `MEMBER`+ cadastra e aloca**, de qualquer departamento (permissions.md §3). Quem
chega com o kit não é sempre quem administra a sala, e um catálogo que só o `ADMIN` preenche
nasce vazio — que é o mesmo que não existir.

**Remover é exclusão lógica** (ADR-015): `sound_take_tracks` e `camera_units` apontam para o
equipamento, e um boletim de três meses atrás não pode passar a dizer que o take foi gravado
com nada.

### Como o equipamento chega ao boletim impresso

Esta era a última pendência declarada da Fase 6 — o cabeçalho do sound report precisava
imprimir os modelos do dia, e o catálogo ainda não existia.

O caminho é o **mesmo** de produção, horários e equipe: o Server Component da rota do módulo
resolve a alocação e a passa em `impressao`. A folha continua sem `fetch` e sem consulta —
tudo chega por props (ADR-016). Como o Service Worker guarda a navegação já renderizada, o
cabeçalho sai impresso em locação sem sinal, tão atual quanto a última vez que a tela foi
aberta com rede. **A fronteira offline não mudou**: nenhum dado de servidor passou a ser
exigido durante a diária.

Cada folha imprime só o equipamento **do seu departamento** — o boom não interessa ao
cabeçalho da câmera, nem o contrário.

Verificado por `npm run test:sala` (38 checks, 11 novos) contra o Neon real.

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
