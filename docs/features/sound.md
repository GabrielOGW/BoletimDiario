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

| Campo                                            | Nota                                         |
| ------------------------------------------------ | -------------------------------------------- |
| `sound_roll`, `file_name`                        | herdados/auto-incrementados do take anterior |
| `tc_start`, `tc_end`, `duration_sec`             | timecode fim é opcional                      |
| `status` (`TakeStatus`), `circled`               | **independente** do status da Câmera         |
| `wild`, `room_tone`, `wild_lines`, `false_start` | flags booleanas                              |
| `notes`                                          | "avião durante o take"                       |

### Tracks (`sound_take_tracks`, N por take)

Tabela separada, **sem limite de 4** (§11). `index` (1..N), `name`, `source`, `equipment_id`,
`notes`.

```
Track 1 — Boom  — MKH 416
Track 2 — João  — DPA 4060
Track 3 — Maria — DPA 4060
Track 4 — Plant Mic
```

O layout de tracks é configurado **uma vez na diária** e herdado por todo take novo; a edição
por take só é necessária quando algo muda (personagem sai de cena, lav cai). Esse é o ponto
onde o módulo ganha ou perde o usuário: redigitar quatro tracks a cada take é inaceitável.

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
  interface e estáveis no arquivo: `projeto`, `cena`, `take`, `roll`, `arquivo`, `tc_inicio`,
  `tc_fim`, `circled`, `natureza`, `nota`, `track_1..N`. Espelhar o padrão não é purismo — é o
  que faz o arquivo abrir do outro lado sem alguém renomear coluna à mão.

- Entra no relatório consolidado da diária (Fase 9), relacionado por cena/setup/take.

---

## 7. Escopo da Fase 6

Entra: configuração da diária, tracks dinâmicas com herança, take com status rápidos e
natureza, MOS/playback/PU/série, motivo de NG, timecode com jam e user bits, integração com
equipamentos, PDF e CSV.

Não entra: captura automática de timecode por hardware, import de metadados de arquivo BWF,
reconciliação automática com o arquivo do recorder.

**Fontes do levantamento:** [Sound report (Wikipedia)](https://en.wikipedia.org/wiki/Sound_report) ·
[iXML (Wikipedia)](https://en.wikipedia.org/wiki/IXML) ·
[iXML and BWF Metadata — Metadata Guru](https://metadata.guru/gathering-and-using-technical-metadata/metadata-standards/ixml-and-bwf-metadata/) ·
[How to Make Sound Reports — Beverly Boy](https://beverlyboy.com/filmmaking/how-to-make-sound-reports/)
