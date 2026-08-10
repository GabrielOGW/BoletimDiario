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

## 5. Fotografias (§13)

O recurso mais importante do módulo, e o que mais depende do offline funcionar: fotos de
continuidade são tiradas em locação, sem sinal.

Uma foto pode se associar a cena, setup, take, personagem, figurino, prop ou cenário
(`subject_type` + `subject_id`).

```
tira foto → comprime no cliente → blob no IndexedDB → aparece na UI IMEDIATAMENTE
                                        ↓ (quando houver rede)
                              upload → blob storage → remote_url
```

A foto **nunca** espera upload para existir. Mecânica completa em
[../architecture/offline-first.md](../architecture/offline-first.md#fotografias).

Consequências dimensionadas: ~200 fotos por diária a ~300 KB comprimidas ≈ 60 MB no
dispositivo. Confortável para IndexedDB, inviável para LocalStorage — é a razão técnica mais
direta da troca de banco local.

## 6. Fluxo em set

```
┌────────────────────────────────────────────┐
│ 24B · C · TAKE 5        35mm T2.8 · Roll 004│ ← lido de Câmera e Som
├────────────────────────────────────────────┤
│  [ CIRCLE ]  [ OK ]  [ NG ]                │
│  ⏱ 00:42                    📷 foto        │
│  Obs  João pega o copo com a mão direita   │
│  ▸ props · figurino · cabelo/maq · cenário │
└────────────────────────────────────────────┘
```

O cabeçalho técnico vem dos outros departamentos, em tempo real quando online. É o §34
funcionando: a continuísta vê lente, T-stop, status de som e timecode enquanto escreve as
próprias observações.

## 7. Relatório

PDF em A4 (mesmo mecanismo): por cena, com setups, takes, selecionados destacados, notas de
ação e miniaturas das fotos. Fotos em alta resolução ficam no ZIP da diária (§26).

## 8. Escopo da Fase 7

Entra: cena, setup, take, notas de ação, props, figurino, cabelo/maquiagem, cenografia, fotos
offline, PDF.

Não entra: import de roteiro (PDF/Final Draft), lined script, marcação de cobertura por linha
de diálogo, timing automático. São o passo seguinte natural e nenhum bloqueia o uso.
