# Módulo Som

Boletim de Som (sound report). Módulo novo, construído **sobre o mesmo** `Cena → Setup → Take`
da Câmera.

> **Restrição de projeto dominante:** o sound mixer preenche **durante a gravação**, muitas
> vezes com uma mão, olhando para o mixer. Se o fluxo custar mais de dois toques por take, o
> módulo não será usado — ele volta para o caderno.

---

## 1. Relação com os outros módulos

O Som **não cria cena nem take próprios**. Ele abre a diária e enxerga o que a Câmera (ou a
Continuidade) já registrou:

```
Cena 24B · Setup C · Take 4        ← criado por quem chegou primeiro
   └── SoundTakeData               ← o Som escreve AQUI
```

Se o Som chegar primeiro (playback, wild track, room tone antes da câmera rodar), ele **pode**
criar o take — a operação é a mesma para todos e é idempotente por `(setupId, number)`.
Wild tracks e room tones que não pertencem a nenhum setup ficam num setup especial da cena
(`WILD`), para não inventar uma hierarquia paralela.

---

## 2. Dados

### Diária (`sound_day_config`, um por `ShootingDay`)

| Grupo        | Campos                                                                                              |
| ------------ | --------------------------------------------------------------------------------------------------- |
| Produção     | herdados da `Production` e da `ShootingDay` (nada é redigitado)                                     |
| Equipe       | sound mixer, boom operator, demais membros (do `production_members`)                                |
| Configuração | sample rate, bit depth, frame rate, timecode source, drop/non-drop, formato, mono/poly, mídia, roll |

Equipamento (recorder, mixer, microfones, transmissores, receptores, timecode boxes) **não**
fica aqui: vive em `equipment` + `equipment_assignments`, compartilhado com os outros
departamentos — é isso que permite a continuísta ver "hoje o som está com MKH 50 e DPA 4060"
(§23).

### Take (`sound_take_data`, um por `Take`)

| Campo                                | Nota                                                                                                   |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `sound_roll`, `file_name`            | herdados/auto-incrementados do take anterior                                                           |
| `tc_start`, `tc_end`, `duration_sec` | timecode fim é opcional                                                                                |
| `status` (`TakeStatus`), `circled`   | **independente** do status da Câmera                                                                   |
| `ng_reason`                          | "NG" sem motivo é anotação inútil na pós                                                               |
| `notes`                              | "avião durante o take"                                                                                 |
| ~~`wild`, `room_tone`, …~~           | **saíram na migration 0006**: viraram `takes.kind`, do take compartilhado ([ADR-029](../decisions.md)) |

### Tracks (`sound_take_tracks`, N por take)

Tabela separada, **sem limite de 4** (§11). `index` (1..N), `name`, `source`, `equipment_id`,
`notes`.

```
Track 1 — Boom  — MKH 416
Track 2 — João  — DPA 4060
Track 3 — Maria — DPA 4060
Track 4 — Plant Mic
```

O layout de tracks é digitado **uma vez** e herdado por todo take novo; a edição por take só é
necessária quando algo muda (personagem sai de cena, lav cai). Esse é o ponto onde o módulo
ganha ou perde o usuário: redigitar quatro tracks a cada take é inaceitável.

> **Como ficou (`2026-08-11`):** a herança vem **do take anterior**, e não de um template
> guardado na diária ([ADR-033](../decisions.md#adr-033--o-layout-de-tracks-é-herdado-do-take-anterior-não-guardado-na-diária)).
> `ensureSoundTracks` copia índice, nome e fonte do último take que teve canais — o anterior do
> mesmo plano, ou o último do dia. As `notes` não são herdadas: "lav estalando" é daquele take.
> O efeito para quem usa é o descrito acima; o que muda é que cada take guarda o que ele
> realmente teve, e mudar o canal 3 agora não reescreve o take de uma hora atrás.

---

## 3. Fluxo em set

```
┌──────────────────────────────────────────┐
│ 24B · C · TAKE 4          Roll 004       │  ← contexto, não editável aqui
├──────────────────────────────────────────┤
│  [ OK ]  [ CIRCLE ]  [ NG ]              │  ← um toque, sem modal
│  [ WILD ] [ ROOM TONE ] [ WL ] [ FS ]    │
├──────────────────────────────────────────┤
│ TC  14:32:10:12          [ capturar ]    │
│ Tracks  1 Boom · 2 João · 3 Maria    ▾   │  ← herdadas, dobradas
│ Obs     ________________________________ │
└──────────────────────────────────────────┘
                 [ PRÓXIMO TAKE ]
```

- Um toque marca o status e grava.
- "Próximo take" cria o take seguinte com roll, tracks e configuração herdados.
- Trocar de setup **reseta o take para 1** (§30).
- Trocar o sound roll **persiste** para os próximos (§30).
- Nada nessa tela espera rede.

Os rótulos das ações rápidas são constantes hoje e ficam configuráveis por produção depois.

### Como ficou — Fase 6, `2026-08-11`

A tela é [`features/sound/`](../../features/sound), na rota
`/p/[id]/diarias/[dayId]/som`, e reproduz o formato do módulo de Câmera (ADR-024): mesma
fixação de diária, mesmos cartões colapsáveis, mesmo auto-save de 500 ms sem botão salvar,
mesma folha A4 em sobreposição na própria rota.

O cartão do take, de cima para baixo:

| Onde                  | O quê                                                       | Toques |
| --------------------- | ----------------------------------------------------------- | ------ |
| Fileira de julgamento | OK · Circle · Hold · NG · Parcial (`TakeStatus`)            | **1**  |
| Motivo do NG          | aparece só quando o julgamento é NG                         | —      |
| Natureza (dobrada)    | MOS, Wild, Room tone, Playback, Pick-up, Série, False start | 2      |
| Sound roll e arquivo  | herdados e auto-incrementados                               | 0      |
| Timecode (dobrado)    | TC início e TC fim                                          | 2      |
| Canais (dobrado)      | herdados do take anterior; o resumo aparece dobrado         | 2      |
| Observações           | texto livre                                                 | —      |

**O take normal custa um toque**, que é o critério de conclusão do módulo. Tudo que é dobrado
mostra o conteúdo no próprio rótulo — "1 Boom · 2 João", "MOS", "14:32:10:12" — então quem não
precisa abrir também não precisa adivinhar.

Três decisões que valem registro:

- **A linha de som nasce no primeiro toque**, não ao abrir a diária. O take costuma ser criado
  pela Câmera; materializar dados de som para todo take de todo dia encheria a fila de sync de
  registros vazios.
- **`circled` acompanha o status** em vez de ser um segundo controle — são o mesmo fato dito
  duas vezes no modelo, e divergirem daria um relatório em que o take é `CIRCLE` numa coluna e
  "não" na outra. O julgamento do Som continua **independente** do da Câmera (ADR-010): nada
  aqui toca em `take.status`.
- **A natureza escreve no take compartilhado** (`take.kind`, ADR-029). Marcar MOS no Som é o
  mesmo fato que a Câmera e a Continuidade leem, sem ninguém avisar ninguém.

Wild tracks e room tones que não pertencem a plano nenhum vão para um setup `WILD` da cena
(§1), criado por um botão no bloco; o take nasce com `kind = WILD`.

O jam de timecode é **um toque** ("Jam agora", grava o instante), porque ninguém vai digitar a
hora no momento em que ela acontece.

---

## 4. Integração Câmera ↔ Som (§33)

O objetivo prático é entregar à pós a correspondência entre arquivos:

```
Take 12
  Câmera:  Card A023 · A023C012_001
  Som:     Roll 008  · 008_012.wav
  TC:      10:42:13:05
```

Como os dois lados apontam para o **mesmo** `take_id`, isso é uma consulta, não uma
conciliação. É exatamente o problema que o modelo compartilhado existe para eliminar.

---

## 5. O que a prática exige — levantamento

`2026-08-10`. Confronto do modelo acima com o sound report como ele é usado de fato e com os
metadados que a pós consome (BWF/iXML). O que já existe no schema está marcado ✅; o que falta,
➕.

### O que o relatório precisa dizer sobre o dia

O sound report é, antes de tudo, **cadeia de custódia do áudio**: ele responde "que arquivo é
este, de que take, gravado como, e chegou inteiro?".

| Item                                                  | Estado                                                                           |
| ----------------------------------------------------- | -------------------------------------------------------------------------------- |
| Produção, data, diária, locação                       | ✅ herdados da `Production`/`ShootingDay`                                        |
| Sound mixer, boom operator, equipe                    | ✅ `sound_day_config`                                                            |
| Sample rate, bit depth, frame rate, drop/non-drop     | ✅                                                                               |
| Formato (WAV/BWF), mono/poly, mídia, roll             | ✅                                                                               |
| Modelos de recorder, mixer e microfones **impressos** | ✅ dado existe em `equipment_assignments`; ➕ falta imprimir no cabeçalho do PDF |
| Fonte e **hora do jam** de timecode                   | ✅ `tc_jam_at` (migration 0005)                                                  |
| **User bits** (UBITS)                                 | ✅ `user_bits` (migration 0005)                                                  |
| **Cópias da mídia** — quantos destinos, verificado    | ✅ `media_copies` + `media_verified` (migration 0005)                            |

### O que o relatório precisa dizer sobre cada take

| Item                                     | Estado                                                                                                          |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Cena, setup, take                        | ✅ vêm do take compartilhado, sem redigitar                                                                     |
| Sound roll, nome do arquivo              | ✅ herdados e auto-incrementados                                                                                |
| TC início / TC fim / duração             | ✅                                                                                                              |
| Circled                                  | ✅ independente do circled da câmera                                                                            |
| Wild, room tone, wild lines, false start | ✅ (viram `TakeKind` por [ADR-029](../decisions.md#adr-029--julgamento-e-natureza-do-take-são-eixos-separados)) |
| **MOS** — rodado sem som                 | ✅ `takes.kind = 'MOS'` (migration 0005) — a lacuna mais séria, fechada                                         |
| **Playback**                             | ✅ `takes.kind = 'PLAYBACK'`                                                                                    |
| **Pick-up (PU)** e **série (SER)**       | ✅ `takes.kind` = `PICKUP` / `SERIES`                                                                           |
| **HOLD** e **motivo do NG**              | ✅ `take_status` ganhou `HOLD`; `ng_reason` nos três departamentos                                              |
| Tracks: índice, nome, fonte, microfone   | ✅ `sound_take_tracks`, sem limite de 4                                                                         |
| Observações ("avião no take 3")          | ✅ texto livre, e assim deve continuar                                                                          |

**MOS merece o destaque.** É o cruzamento mais consultado entre câmera e som — o editor abre a
diária justamente para saber por que não há áudio para aquele take. Sem o campo, a ausência de
`sound_take_data` fica ambígua: pode ser MOS, pode ser o som não ter preenchido ainda. Uma
ambiguidade dessas é exatamente o que a plataforma existe para eliminar.

### O que **não** entra, e por quê

- **Estruturar o ruído externo em taxonomia** (avião / gerador / vento). Escrever é mais rápido
  que escolher, e a busca já resolve. Campo livre continua sendo a resposta certa.
- **Captura automática de timecode**, import de BWF, reconciliação com o arquivo do recorder.
  Dependem de hardware ou de acesso a arquivo e nenhum bloqueia o uso.

---

## 6. Relatório

- **PDF** — sound report em A4, mesmo mecanismo de impressão da Câmera. O cabeçalho imprime os
  equipamentos do dia; o corpo, uma linha por arquivo.
- **CSV** — prioritário aqui: é o formato que a pós consome para conformar áudio. Uma linha por
  take, colunas de tracks expandidas, cabeçalho estável entre diárias.

  As colunas espelham os campos de iXML que a pós já espera, com os nomes em pt-BR na
  interface e estáveis no arquivo. Espelhar o padrão não é purismo — é o que faz o arquivo
  abrir do outro lado sem alguém renomear coluna à mão.

- Entra no relatório consolidado da diária (Fase 9), relacionado por cena/setup/take.

### Como ficou — Fase 6, `2026-08-11`

Os três — tela, folha e CSV — leem a **mesma** função,
[`linhasDoRelatorio()`](../../features/sound/estrutura.ts). Três leituras seriam três verdades
sobre o mesmo dia, e a que a pós receberia seria justamente a menos olhada.

**PDF:** [`FolhaSom.tsx`](../../features/sound/FolhaSom.tsx), com as mesmas classes de impressão
do `globals.css`. O cabeçalho traz mixer, boom, sample rate, bit depth, frame rate, formato,
fonte de TC, **hora do jam**, user bits, drop frame, mídia, cópias e "cópias conferidas" — a
custódia impressa, que é o que o sound report existe para responder. O corpo é uma tabela plana,
uma linha por take. _Os modelos de equipamento no cabeçalho continuam pendentes: dependem do
catálogo da Fase 8._

**CSV:** [`csv.ts`](../../features/sound/csv.ts). Colunas na ordem:

```
projeto, data, cena, bloco, plano, take, roll, arquivo, tc_inicio, tc_fim,
duracao_seg, circled, natureza, julgamento, motivo_ng, nota, track_1..N
```

- **Mínimo de quatro colunas de track**, expandindo até o maior índice do dia. A pós monta o
  template dela uma vez, e uma diária que usou três canais não pode deslocar as colunas de quem
  espera quatro. Acima disso o cabeçalho cresce — o limite de 4 é do caderno, não do domínio.
- Aspas por RFC 4180, e **`;` também é protegido**: o Excel em pt-BR o trata como separador ao
  reabrir o arquivo, e uma nota como "avião; helicóptero" quebraria a linha no computador de
  quem recebe. Linhas em `\r\n`, arquivo com BOM.
- O take normal sai como `Sync`, não em branco: célula vazia lê-se como "ninguém preencheu".
- **Todo take entra, inclusive o MOS** — é a linha que o editor abre o arquivo para achar.
- O download é `Blob` + `createObjectURL`, sem passar pelo servidor: o fim da diária é
  exatamente quando a locação está sem sinal.

Verificado por `npm run test:som` (63 checks), que cobre ordenação, MOS, herança na leitura,
resumo do dia, escape e expansão de colunas.

---

## 7. Escopo da Fase 6

Entra: configuração da diária, tracks dinâmicas com herança, take com status rápidos e
natureza, MOS/playback/PU/série, motivo de NG, timecode com jam e user bits, integração com
equipamentos, PDF e CSV.

Não entra: captura automática de timecode por hardware, import de metadados de arquivo BWF,
reconciliação automática com o arquivo do recorder.

### Estado em `2026-08-11`

| Item                                            | Estado                                                               |
| ----------------------------------------------- | -------------------------------------------------------------------- |
| Banco (`0005`/`0006`) e ADR-029                 | ✅                                                                   |
| Sync: `soundDayConfig`, `soundTakeData`, tracks | ✅ protocolo 3, Dexie v3, snapshot                                   |
| Configuração da diária                          | ✅ [`ConfiguracaoSom.tsx`](../../features/sound/ConfiguracaoSom.tsx) |
| Tracks dinâmicas com herança                    | ✅ ADR-033                                                           |
| Status rápidos, natureza, MOS, motivo de NG     | ✅ um toque para o julgamento                                        |
| Timecode com jam e user bits                    | ✅                                                                   |
| PDF e CSV                                       | ✅                                                                   |
| **Equipamentos no cabeçalho do relatório**      | ⛔ depende do catálogo da **Fase 8**                                 |

O único item do escopo que não entrou é a integração com equipamentos — os modelos de recorder,
mixer e microfones impressos no cabeçalho. Não é dívida desta fase: `equipment` e
`equipment_assignments` são da Fase 8, e o dado ainda não existe para ser impresso. O que
depende dele está marcado no lugar certo, e não simulado aqui.

**Fontes do levantamento:** [Sound report (Wikipedia)](https://en.wikipedia.org/wiki/Sound_report) ·
[iXML (Wikipedia)](https://en.wikipedia.org/wiki/IXML) ·
[iXML and BWF Metadata — Metadata Guru](https://metadata.guru/gathering-and-using-technical-metadata/metadata-standards/ixml-and-bwf-metadata/) ·
[How to Make Sound Reports — Beverly Boy](https://beverlyboy.com/filmmaking/how-to-make-sound-reports/)
