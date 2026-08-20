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
          │                            ├── Diária 12
          │                            │     ├── Câmera
          │                            │     ├── Som
          │                            │     ├── Continuidade
          │                            │     └── Consolidado
          │                            ├── Equipamentos
          │                            ├── Membros
          │                            ├── Busca
          └── CONTA                    └── Relatórios
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
[../architecture/permissions.md §4](../architecture/permissions.md#4-entrada-na-sala) —
incluindo o limite de **10 tentativas por hora, por usuário**, que entrou na Fase 10 e é o
que impede alguém de adivinhar o código de fora.

O código fica visível para **todo membro**, não só para o administrador: quem chegou atrasado
no set precisa entrar sem depender de o `ADMIN` estar por perto. Rotacionar e fechar a sala
continuam sendo `ADMIN`+, e essa decisão é do servidor — a interface só deixa de oferecer o
botão que não funcionaria.

**Diárias** (`ShootingDay`) são criadas por `ADMIN`+ e lidas por qualquer membro; quem não
pode editar vê o mesmo conteúdo sem formulário. Duas unidades no mesmo dia são duas diárias —
a unidade entra na chave. O id é derivado de `(produção, data, unidade)`, o que faz criar a
mesma diária duas vezes convergir para o mesmo registro em vez de duplicar (ADR-019).

### A conta e os aparelhos — Fase 10, `2026-08-20`

`/conta`, no cabeçalho de "Minhas produções", ao lado de "Sair". Ela mostra **onde a conta
está aberta** — navegador, sistema, IP e desde quando — e derruba qualquer aparelho, ou todos
os outros de uma vez.

Ela existe por causa do offline, não apesar dele. A sessão dura 90 dias e nunca é reverificada
para editar, porque em locação sem sinal uma sessão expirada não tem como ser renovada
(ADR-025). O preço é que um telefone perdido continua entrando na produção por três meses — e
a resposta certa não é encurtar a sessão de todo mundo, é **poder revogar a de um**
([ADR-038](../decisions.md#adr-038--o-limite-de-tentativas-mora-no-banco-rls-fica-de-fora-e-a-sessão-longa-se-paga-com-revogação)).

O aparelho atual não tem botão de desconectar: ele tem "Sair", no cabeçalho. São coisas
diferentes, e juntá-las faria alguém se deslogar tentando derrubar o outro.

Não é uma aba da sala: entrar na conta é raro, e uma aba permanente custaria espaço na barra
de quem só quer chegar na diária.

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

### Como ficou — Fase 8, `2026-08-12`

A busca **da diária** existe e é local: [`filtraLinhas`](../../features/diaria/consolidado.ts),
na visão consolidada (§6). Cada palavra do termo precisa aparecer, então "24 boom" é o take da
cena 24 com nota de boom, e não tudo que tem 24 **ou** boom.

Ela alcança cartão, arquivo, roll, cena, plano, take e as notas dos três departamentos — o
índice é pré-calculado por linha, porque o filtro roda a cada tecla com o dedo esperando.

### A busca da produção — `2026-08-19`, fecha a Fase 8

A outra metade existe: `/p/[id]/busca`, Server Component lendo
[`lib/db/queries/search.ts`](../../lib/db/queries/search.ts). Alcança **toda diária da
produção**, inclusive as que este aparelho nunca baixou — e por isso **exige rede**, como o
resto da sala (ADR-016).

**Os dois alcances não viram uma lista só**
([ADR-036](../decisions.md#adr-036--a-busca-tem-dois-alcances-declarados-e-eles-não-viram-uma-lista-só)).
Uma lista misturada teria metade offline e metade não: quando o sinal caísse, o mesmo termo
devolveria menos resultados sem nada explicando por quê — e uma busca que encolhe em silêncio
faz alguém concluir "esse take não existe". O que é fundido é a **semântica**: as duas exigem
que cada palavra apareça, as duas concatenam o texto antes de comparar (as palavras podem vir
de campos e departamentos diferentes) e as duas devolvem cena · plano · take mais onde bateu.

E uma leva à outra **com o termo na mão**: a diária oferece "procurar em todas as diárias"
assim que há termo digitado, e o resultado da produção abre a diária com `?q=` preenchido.

**Por trecho, não full-text.** O que se procura aqui é quase sempre identificador — `A023`,
`A023C012_001`, `008_012`, `24B`. `to_tsvector` trata `A023C012_001` como um lexema só, então
buscar `A023` não acharia: exatamente o sintoma de "a busca não acha nada". O índice
`scenes_search` (migration `0001`) continua servindo à descrição de cena.

O resultado sai agrupado por diária, com a mais recente primeiro, cena em ordem **numérica**
(105 depois de 24) e teto de 60 — quando bate no teto, a tela pede uma palavra a mais, que é a
mesma regra que a busca já ensina.

Verificado por `npm run test:sala` (51 checks, +13, contra o Neon real).

## 6. Visão consolidada da diária (§8 do roadmap)

Um take, os três departamentos, lado a lado — relacionados por `take_id`, sem conciliação:

```
Cena 24B · Setup C · Take 5
  CÂMERA        A CAM · A012 · A012C005_001 · 35mm T2.8 · ISO 800 · CIRCLE
  SOM           Roll 004 · 004_005.wav · TC 14:32:10:12 · CIRCLE
  CONTINUIDADE  CIRCLE · João pega o copo com a mão direita
```

É a mesma consulta que alimenta o relatório consolidado (Fase 9).

### Como ficou — Fase 8, `2026-08-12`

`/p/[id]/diarias/[dayId]/consolidado`, com a leitura em
[`features/diaria/consolidado.ts`](../../features/diaria/consolidado.ts).

**Dentro da fronteira offline, e somente leitura.** Tudo que ela mostra já está fixado no banco
local pela mesma fixação que os módulos fazem, então ela não acrescenta **nenhuma** requisição
— aberta uma vez com rede, funciona em modo avião como o resto da superfície de diária. Não há
guarda por departamento: leitura é livre para todo membro, sempre (§3 de permissions.md).

Três decisões que o teste guarda:

- **Multicam não perde a segunda câmera.** `camera_take_data` tem uma linha por câmera por
  take; mostrar só a primeira esconderia metade do material de um take de duas câmeras — que é
  exatamente o dado que a pós vem procurar aqui. As linhas viram uma coluna só, com o rótulo da
  câmera na frente de cada arquivo.
- **"O que falta" é uma contagem.** Com três cadernos separados, "que take ficou sem som?" só
  se descobre no dia seguinte, na pós. Aqui é uma leitura da diária fixada.
- **MOS não é lacuna.** É um take que declaradamente não tem áudio, e contá-lo como "sem som"
  desfaria justamente o que [ADR-029](../decisions.md#adr-029--julgamento-e-natureza-do-take-são-eixos-separados)
  resolveu. A coluna do som mostra "MOS — sem áudio", em cinza, e não o alerta.

Verificado por `npm run test:consolidado` (31 checks).

### O que ela passou a entregar — Fase 9, `2026-08-19`

A tela deixou de ser só consulta e virou o lugar de onde a diária **sai**:

- **Relatório consolidado em A4** ([`FolhaConsolidada.tsx`](../../features/diaria/FolhaConsolidada.tsx)),
  em sobreposição na própria rota, como as três folhas de departamento. Ele responde ao que
  nenhuma delas responde sozinha: o dia take a take, com Câmera, Som e Continuidade na mesma
  linha, e as lacunas no cabeçalho. Quem recebe as três folhas separadas ainda tem de
  casá-las à mão — que é exatamente o trabalho que o `take_id` compartilhado acabou.
  Departamento que não anotou imprime **traço**, não célula vazia: em branco lê-se "não sei".
- **JSON da diária** ([`export.ts`](../../features/diaria/export.ts)): entidades **cruas**
  dos três departamentos — mais tracks de som, as quatro coleções de estado do set e o
  relatório de progresso —, sem os campos de sincronização (`_dirty` é contabilidade deste
  aparelho; `version` fica, porque é do servidor). Exportar a leitura consolidada seria
  exportar uma interpretação, e interpretação se refaz — dado perdido, não.

Os dois são gerados **no cliente**, do banco local, por `Blob`: fechar a diária é o momento
em que a locação está sem sinal. A tela passou a ler também o que só o arquivo precisa (som,
estado do set, relatório) — um export que carrega meia diária só é descoberto quando o dado
já não existe mais.

Verificado por `npm run test:consolidado` (56 checks, +25).
