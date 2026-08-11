# Módulo Continuidade / Script Supervisor

Módulo novo, sobre o mesmo `Cena → Setup → Take`. É o módulo com o **maior volume de dados
por take** e o único cujo trabalho principal não é registrar o que foi gravado, mas registrar
**o estado do mundo** durante a gravação.

> A continuidade acompanha muito mais do que "qual take foi rodado": posição, ação, objeto,
> figurino, eyeline, desvio de roteiro. O modelo precisa suportar isso sem virar um formulário
> de sessenta campos.

---

## 1. Cena

A continuísta é normalmente quem preenche os metadados da cena — os outros departamentos
apenas consomem. Campos em `scenes`:

`number` · `block` · `page` · `story_day` · `int_ext` · `day_night` · `location` ·
`characters[]` · `description`

Como uma cena com blocos A/B/C vira três `Scene` que compartilham `number`
([overview §5](../architecture/overview.md#5-cena-setup-e-take--a-decisão-de-modelagem-mais-importante)),
a UI edita esses metadados **no nível do número da cena** e propaga para os blocos. Isso
resolve na interface a duplicação aceita no modelo.

## 2. Setup

Campos em `setups` que são especificamente da continuidade:
`shot_size` · `angle` · `movement` · `screen_direction` · `eyeline` · `description`

`camera` e `lens` **não** são redigitados aqui: vêm de `camera_take_data` do mesmo take. A
continuísta lê o que a câmera registrou (§34) — esse é um dos ganhos mais concretos da
plataforma sobre três cadernos separados.

## 3. Take — continuidade de ação

`continuity_take_data`, um por take:

| Grupo      | Campos                                                        |
| ---------- | ------------------------------------------------------------- |
| Julgamento | `status` (`TakeStatus`), `selected` (circled), `duration_sec` |
| Posição    | `start_position`, `end_position`                              |
| Ação       | `action`, `movement`, `direction`, `entrances_exits`          |
| Olhar      | `eyeline`                                                     |
| Interação  | `object_interaction`, `character_interaction`                 |
| Roteiro    | `dialogue_changes`, `improvisation`, `script_deviation`       |
| Livre      | `notes`                                                       |

Todos são texto livre — tentar estruturar "João entra pela esquerda" em enums seria mais lento
que escrever, e é assim que a ferramenta é abandonada. O que a estrutura entrega é **busca** e
**relacionamento com o take**, não taxonomia.

A UI mostra apenas `status`, `notes` e os campos já preenchidos; o resto fica atrás de um
"mais campos". Preenchimento típico em set usa dois ou três.

## 4. Estado do set

Quatro coleções com a mesma forma, todas podendo se prender a **cena, setup ou take**
(pelo menos um):

| Coleção                   | Campos                                               |
| ------------------------- | ---------------------------------------------------- |
| `continuity_props`        | objeto, posição, estado, quantidade, interação, obs. |
| `continuity_wardrobe`     | personagem, figurino, acessórios, estado, obs.       |
| `continuity_hair_makeup`  | personagem, estado, alterações, obs.                 |
| `continuity_set_dressing` | elemento, posição, estado, obs.                      |

```
Copo · Mesa lado direito · 50% cheio · Ator segura na mão direita
```

O escopo flexível é essencial: um figurino vale para a cena inteira; um copo pela metade vale
para um take específico. Forçar tudo ao mesmo nível obrigaria a repetir o figurino em cada
take ou perder a precisão do copo.

Itens de cena são **herdados** pelos setups e takes na visualização (herança de exibição, sem
cópia de linha) e só viram registro próprio quando o estado muda.

## 5. Fotografias — fora da v1

**Não há fotografias nesta versão**
([ADR-022](../decisions.md#adr-022--sem-fotografias-na-v1)). Elas saem de requisitos, modelo,
armazenamento, sincronização, UX e gestão de cota — não há tabela `photos`, não há blob no
IndexedDB, não há upload.

O objetivo é manter o aplicativo leve, rápido e barato. O modelo continua extensível
(`subject_type` + `subject_id` é o formato natural quando/se voltar), mas **nada é implementado
agora**.

Consequência prática para o módulo: a continuidade de estado é registrada em **texto**, nas
quatro coleções do §4. É como o caderno funciona hoje, e é o que a equipe já sabe fazer.

## 6. Fluxo em set

```
┌────────────────────────────────────────────┐
│ 24B · C · TAKE 5        35mm T2.8 · Roll 004│ ← lido de Câmera e Som
├────────────────────────────────────────────┤
│  [ CIRCLE ]  [ OK ]  [ NG ]                │
│  ⏱ 00:42                                    │
│  Obs  João pega o copo com a mão direita   │
│  ▸ props · figurino · cabelo/maq · cenário │
└────────────────────────────────────────────┘
```

O cabeçalho técnico vem dos outros departamentos, em tempo real quando online. É o §34
funcionando: a continuísta vê lente, T-stop, status de som e timecode enquanto escreve as
próprias observações.

## 7. O que a prática exige — levantamento

`2026-08-10`. Confronto do modelo acima com a papelada que a continuísta de fato entrega. A
descoberta principal não é um campo: é que **falta um documento inteiro**.

### O take: três vereditos, não dois

A prática usa **print / hold / NG**, e o `NG` vem sempre com motivo — "NG" sozinho não ajuda
ninguém na sala de montagem. O modelo hoje tem `status` e `selected` (o circled), e não tem
onde guardar "bom, mas não perfeito" nem o porquê do descarte.

| Item                                                  | Estado                                                                                   |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Circled / print                                       | ✅ `selected`                                                                            |
| **HOLD** e **motivo do NG**                           | ➕ [ADR-029](../decisions.md#adr-029--julgamento-e-natureza-do-take-são-eixos-separados) |
| **Natureza do take**: PU, série, MOS, incompleto      | ➕ mesmo ADR                                                                             |
| Duração cronometrada do take                          | ✅ `duration_sec`                                                                        |
| **Tempo acumulado por cena** e **minutagem estimada** | ➕ derivados, mas hoje ninguém os calcula                                                |
| Posição, ação, direção, entradas/saídas, eyeline      | ✅                                                                                       |
| Alterações de diálogo, improviso, desvio de roteiro   | ✅                                                                                       |
| Lente e câmera do take                                | ✅ lidos de `camera_take_data`, nunca redigitados                                        |

### O documento que falta: o Relatório de Progresso da Diária

É o entregável que a produção consome **todo dia**, e o modelo atual não o contempla em lugar
nenhum. Ele não é um relatório de takes: é o balanço do dia.

| Bloco       | Conteúdo                                                                    |
| ----------- | --------------------------------------------------------------------------- |
| Horários    | call, hora do primeiro take, intervalos, wrap                               |
| Contagens   | cenas rodadas, **páginas em oitavos**, número de setups, minutagem estimada |
| Cobertura   | cenas cobertas, cenas parciais, cenas puladas, cenas adicionadas            |
| Mídia       | cartões de câmera e rolls de som usados no dia                              |
| Observações | descrição livre do dia, e a assinatura de quem preencheu                    |

Quase tudo aí é **derivável** do que a plataforma já vai ter: cenas e setups saem dos
registros, cartões e rolls saem de câmera e som, horários saem da `ShootingDay`. O que precisa
de entrada humana é pouco — páginas em oitavos, minutagem estimada e as observações.

Esse é o argumento mais forte a favor da plataforma que apareceu no levantamento: hoje esse
relatório é montado à mão, no fim do dia, somando números de três cadernos. Aqui ele é uma
consulta com três campos preenchidos.

> **Página em oitavos** é a convenção do setor: uma página de roteiro vale 8/8, e a cobertura
> se mede em frações dela. `scenes.page` hoje é texto livre; para somar, precisa aceitar
> `2 4/8` e guardar o total em oitavos como inteiro.

### O que **não** entra na v1

- **Fotografias** ([ADR-022](../decisions.md#adr-022--sem-fotografias-na-v1)) — decisão firme.
- **Lined script e facing pages.** É o formato tradicional, e reproduzi-lo exige importar o
  roteiro e marcar cobertura linha a linha. Fica para depois, e o que ele entrega de mais
  valioso — que take cobre que trecho — já é aproximado pela descrição do setup.
- **Timing automático.** Cronômetro continua sendo o dedo da continuísta.

---

## 8. Relatório

- **PDF de continuidade** em A4 (mesmo mecanismo): por cena, com setups, takes, selecionados
  destacados e notas de ação.
- **Relatório de Progresso da Diária**, do §7 — em PDF, com os números calculados e os campos
  livres preenchidos na hora do wrap.

## 9. Escopo da Fase 7

Entra: cena, setup, take, notas de ação, três vereditos com motivo de NG, natureza do take,
props, figurino, cabelo/maquiagem, cenografia, PDF de continuidade e **Relatório de Progresso
da Diária**.

Não entra: **fotografias** (ADR-022), import de roteiro (PDF/Final Draft), lined script,
marcação de cobertura por linha de diálogo, timing automático. São o passo seguinte natural e
nenhum bloqueia o uso.

**Fontes do levantamento:** [Script supervisor (Wikipedia)](https://en.wikipedia.org/wiki/Script_supervisor) ·
[Script Supervisor Report Explained — SetHero](https://sethero.com/blog/script-supervisor-report-explained/) ·
[Ultimate Guide to Script Supervisors — StudioBinder](https://www.studiobinder.com/blog/script-supervisor-forms-template/) ·
[How to Read a Lined Script — EditStock](https://editstock.com/blogs/all/how-to-read-a-lined-script)
