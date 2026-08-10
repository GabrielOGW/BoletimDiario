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

## 5. Relatório

- **PDF** — sound report em A4, mesmo mecanismo de impressão da Câmera.
- **CSV** — prioritário aqui: é o formato que a pós consome para conformar áudio.
  Uma linha por take, colunas de tracks expandidas, cabeçalho estável entre diárias.
- Entra no relatório consolidado da diária (Fase 9), relacionado por cena/setup/take.

---

## 6. Escopo da Fase 6

Entra: configuração da diária, tracks dinâmicas com herança, take com status rápidos e flags,
integração com equipamentos, PDF e CSV.

Não entra: captura automática de timecode por hardware, import de metadados de arquivo BWF,
reconciliação automática com o arquivo do recorder. São extensões naturais, todas dependentes
de acesso a hardware ou arquivo, e nenhuma bloqueia o uso do módulo.
