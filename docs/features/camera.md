# Módulo Câmera

O núcleo do produto e o único módulo **já em produção**. A regra que governa este documento:

> **Nada do que existe hoje pode ser removido ou piorar.** Toda mudança aqui é aditiva ou
> equivalente. Se uma decisão de plataforma exigir regredir uma funcionalidade de câmera,
> a decisão é que está errada.

E, desde `2026-08-10`, a regra tem uma segunda metade
([ADR-030](../decisions.md#adr-030--o-módulo-de-câmera-reproduz-o-boletim-tela-por-tela)):

> **A paridade é de tela, não só de campo.** A hierarquia visível continua sendo
> **Cena → Bloco → Plano → Take**, com os mesmos cartões, a mesma ordem de seções e os mesmos
> gestos. `Setup` é o nome do conceito no modelo; na tela de câmera ele se chama **Plano**,
> como sempre se chamou.

> ⚠️ **A tela `/p/[id]/diarias/[dayId]/takes` não é o módulo de câmera.** Ela é a superfície
> mínima da Fase 4, criada para provar o sync com o menor consumidor possível, e é
> **provisória**. Quem quiser o boletim usa o boletim; a Fase 5 entrega o módulo real e essa
> tela sai de cena.

---

## 1. O que existe hoje

Inventário em [../architecture/current-state.md](../architecture/current-state.md). Resumo do
que **precisa continuar funcionando** depois da migração:

- CRUD de boletins: criar, editar, duplicar, excluir
- Busca por título, produtora, diretor, data e cena
- Auto-save com debounce e indicador "Salvando… / Salvo" — **sem botão salvar**
- Multicam: câmeras cadastradas + seleção por plano (chip rápido ou texto livre)
- Hierarquia Cena → Bloco → Plano → Take
- Configurações técnicas e óptica no plano; tipo de plano com badge
- Take com cartão, clip/sync, nota operacional e **aprovado pelo diretor**
- Autocomplete aprendido do uso real + presets
- Migração automática de boletins v1
- Mídia/Suporte, Cenas do Dia, Horários, Equipe, Observações Gerais
- Exportar PDF / imprimir em A4 com takes aprovados destacados
- Backup: exportar e importar JSON
- PWA instalável, offline completo, boletim demo no primeiro acesso

---

## 2. Mapeamento para o modelo compartilhado

Implementado e testado em
[`domain/platform/from-boletim.ts`](../../domain/platform/from-boletim.ts).

| Boletim v2                                                     | Plataforma                                                                                                                                    |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `Boletim`                                                      | `ShootingDay` (+ `Production` deduzida do título/produtora)                                                                                   |
| `producao.{produtora,tituloProjeto,diretor,diretorFotografia}` | `Production`                                                                                                                                  |
| `producao.{data,diaDiaria}`                                    | `ShootingDay.{date,dayNumber}`                                                                                                                |
| `horarios.*`                                                   | `ShootingDay.{callTime,wrapTime,lunchStart,lunchEnd}`                                                                                         |
| `camerasCadastradas[]`                                         | `CameraUnit[]`                                                                                                                                |
| `Cena.numero` + `Bloco.letra`                                  | **`Scene`** (`number` + `block`) — ver [overview §5](../architecture/overview.md#5-cena-setup-e-take--a-decisão-de-modelagem-mais-importante) |
| `Plano`                                                        | **`Setup`** + a parte técnica em `CameraTakeData`                                                                                             |
| `Plano.{tecnica,optica,cameraId}`                              | `CameraTakeData` de cada take do setup (valor herdado)                                                                                        |
| `Take`                                                         | `Take` + `CameraTakeData`                                                                                                                     |
| `Take.{cartao,clipSync}`                                       | `CameraTakeData.{card,fileName}`                                                                                                              |
| `Take.notaOperacional`                                         | `CameraTakeData.notes`                                                                                                                        |
| `Take.aprovado`                                                | `CameraTakeData.approved` **e** `status = CIRCLE`                                                                                             |
| `midiaSuporte[]`                                               | `Equipment` (categoria de mídia) + `EquipmentAssignment` na diária                                                                            |
| `equipeCamera[]`                                               | `ProductionMember` (departamento `CAMERA`) — sem conta enquanto não convidado                                                                 |
| `cenasDoDia`                                                   | **Derivado**, não migrado — já é calculável (`computeStats`)                                                                                  |
| `observacoesGerais`                                            | `ShootingDay.notes`                                                                                                                           |

### Duas decisões que valem explicação

**Técnica e óptica passam do setup para o take.** No modelo atual estão no `Plano`; no modelo
novo estão em `CameraTakeData`, por take. Motivo: na prática o foquista troca o T-stop entre
takes do mesmo setup, e hoje o app não consegue registrar isso — ou você cria um plano novo
(poluindo o boletim) ou perde a informação. A UI **continua parecendo igual**: o valor é
herdado do take anterior e só é editado quando muda (§29). O `Setup` guarda o valor corrente
como padrão de herança.

**`cenasDoDia` não é migrado.** Os quatro campos já são calculáveis a partir dos takes
(`utils/boletim-stats.ts` faz isso hoje para dois deles). Migrar como texto criaria dois
números divergentes na mesma tela. `continuidade`, o único campo genuinamente livre, vai para
`ShootingDay.notes`.

---

## 3. Organização dos campos (§10)

A UI atual já cobre quase tudo. Campos **novos** marcados com ➕:

| Grupo       | Campos                                                                                                                                                    |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Projeto** | produção, diretor, DoP, operador, 1º AC, 2º AC ➕ (via `CameraUnit`), data, diária                                                                        |
| **Câmera**  | câmera, body ➕, número da câmera, lente, focal ➕, T-stop, filtro, ISO, FPS, shutter, WB, resolução, codec ➕, aspect ratio ➕, LUT, VFX ➕, observações |
| **Mídia**   | cartão, roll ➕, volume ➕, nome do arquivo, observações de mídia ➕                                                                                      |
| **Take**    | cena, setup, take, status ➕ (enum, hoje só booleano), observações                                                                                        |
| **Extras**  | fotografia de referência ➕, localização ➕, observações para pós ➕                                                                                      |

`codec` e `formatoGravacao` são campos distintos e ambos existem no modelo novo — hoje o app
tem só `formatoGravacao`, que costuma receber os dois valores misturados. A migração leva o
valor atual para `codec` e deixa `formatoGravacao` livre, sem perder nada.

---

## 4. Status do take

`aprovado: boolean` → `TakeStatus` (`RECORDED · CIRCLE · NG · PARTIAL · WILD · ROOM_TONE ·
FALSE_START`), preservando `approved` como campo próprio.

O toggle verde grande "Aprovado pelo diretor" **continua existindo exatamente como está** — é
o gesto mais usado do app. O enum aparece como uma fileira de ações rápidas ao lado, opcional.
Trocar o toggle por um seletor de status seria uma regressão de UX em nome de pureza de
modelo.

---

## 5. Automações preservadas e novas

| Automação                                         |    Hoje    | Depois                                      |
| ------------------------------------------------- | :--------: | ------------------------------------------- |
| Novo take herda o cartão anterior                 |     ✅     | ✅ generalizado (`inheritFromPreviousTake`) |
| Auto-incremento de Clip/Sync                      |     ✅     | ✅ mesmo `incrementSuffix`                  |
| Número do take = anterior + 1                     |     ✅     | ✅ agora numérico                           |
| Trocar de setup **reseta o take para 1**          |     ❌     | ➕ §30                                      |
| Trocar cartão **persiste** para os próximos takes | ⚠️ parcial | ➕ o novo cartão vira o padrão de herança   |
| Herança de ISO/fps/lente/T-stop entre takes       |    n/a     | ➕ §29                                      |

Todas vivem em [`domain/platform/factory.ts`](../../domain/platform/factory.ts) — regra de
domínio pura, com teste, compartilhada pelos três módulos.

---

## 6. Relatório

Mantém a abordagem atual: **HTML + CSS de impressão A4 + `window.print()`**, sem biblioteca de
PDF. Funciona offline, imprime bem e já está validada.

Preservados: `groupPlanos()` (agrupamento de planos consecutivos com mesma assinatura
técnica), destaque de aprovados, `break-inside: avoid` por plano, `thead` repetido.

Acréscimos: CSV de câmera para a pós, e a coluna de som/continuidade no relatório consolidado
(Fase 9).

---

## 7. Compatibilidade

1. `/`, `/novo`, `/editar?id=`, `/visualizar?id=` continuam funcionando sobre LocalStorage
   até a Fase 5.
2. Depois da Fase 5, permanecem acessíveis em `/legado` para os boletins ainda não migrados.
3. `bdc:boletins:v1` **não é apagado**. Ver
   [../migrations/local-to-cloud.md](../migrations/local-to-cloud.md).
4. Importar backup no formato antigo continua funcionando — passa por `normalizeBoletim` e
   depois pelo mapeador.
5. Uso **sem conta** continua sendo um modo suportado, não uma versão degradada.
