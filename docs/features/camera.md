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

> **Status (Fase 5): o módulo existe e imprime** em `/p/[id]/diarias/[dayId]/camera`, com
> Cena → Bloco → Plano → Take, câmeras cadastradas, técnica e óptica no cartão do Plano,
> cartão/clip-sync/nota no take, o toggle verde intacto e a folha A4. Código em
> `features/camera/` e `lib/offline/repos/camera.ts`.
>
> A tela `/takes` continua existindo enquanto Som e Continuidade não têm módulo — para eles
> é a única porta. Ela nunca foi o boletim de ninguém.
>
> **Falta para fechar a fase:** mover as rotas atuais para `/legado` e a importação
> opcional dos boletins locais.

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

### Como a técnica do Plano se comporta na tela

Decisão do proprietário, `2026-08-10`. Os campos técnicos continuam **no cartão do Plano**,
como sempre estiveram, mas o valor mora nos takes (ADR-011). Editar um campo ali **acompanha
todos os takes que ainda tinham o valor anterior** e não toca no take que alguém ajustou à
mão:

```
PLANO 3 · 35mm · T2.8 · ISO 800
  Take 1  [ISO 800]     Take 2  [ISO 800]     Take 3  [ISO 1600] ← ajustado à mão

muda o ISO do plano para 400
  Take 1 → 400          Take 2 → 400          Take 3 → 1600 (intocado)
```

É o que a pessoa quer dizer com "mudei o ISO do plano": conserta o plano sem apagar a exceção
que ela mesma criou dois takes atrás. Regra em `patchPlanoTecnica`, não no componente.

Plano ainda sem take guarda os valores num **rascunho local** (`meta`, sem sincronizar) que
vira dado de verdade quando o take 1 nasce — o boletim sempre permitiu configurar o plano
antes de rodar, e essa possibilidade não podia sumir.

### Produção, Horários e Equipe

Decisão do proprietário, `2026-08-10`: aparecem no boletim, no mesmo lugar de sempre, **em
somente leitura**, com link para editar na sala. São dados de servidor, fora da fronteira
offline (ADR-016); editá-los aqui exigiria rede no meio da diária, e nada na diária espera
rede.

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

### Como ficou (Fase 5)

[`features/camera/FolhaCamera.tsx`](../../features/camera/FolhaCamera.tsx) é a folha; ela
reusa as mesmas classes de impressão do `globals.css` (`print-sheet`, `pdf-cena`,
`pdf-plano`, `pdf-table`) que o boletim atual usa — a saída em papel é a mesma linguagem.

Três decisões valem registro:

**A folha abre na própria rota da diária, em sobreposição — não numa página separada.** Uma
rota nova exigiria ir ao servidor buscar o cabeçalho, e o momento de fechar o boletim é
exatamente o momento em que a locação não tem sinal. Como sobreposição, tudo que ela precisa
já está na tela: o cabeçalho veio com a página, cena/plano/take vêm do banco local. Imprimir
em modo avião funciona sem caminho especial. O botão "Ver boletim para impressão" fica no fim
da diária, e a folha fecha por botão ou `Esc`.

**A técnica impressa do Plano é a do seu primeiro take** — o valor com que o plano foi
configurado. Quando um take diverge dele, a diferença sai **na linha daquele take**, em
itálico ao lado da nota (`T4 · ISO 1600`). Sem isso, o dado que ADR-011 passou a permitir
registrar — o foquista abrindo meio ponto no take 3 — existiria no banco e não apareceria no
papel, que é o que sai do set. A comparação é contra o primeiro take e não contra o anterior:
assim o take 4, que herdou o valor novo, também o mostra, em vez de parecer ter voltado atrás.

**Cena → Bloco e a linha técnica moram em
[`features/camera/estrutura.ts`](../../features/camera/estrutura.ts)**, lido pela tela _e_
pela folha. Duplicar o agrupamento nos dois lugares acabaria em um PDF que mostra a diária
diferente de como ela foi preenchida. Coberto por `npm run test:camera` (25 checks).

O que a folha ainda não tem, por depender de outra fase: Mídia/Suporte (equipamentos,
Fase 8) e o CSV para a pós (Fase 9). A seção "Cartões usados" já sai, derivada dos takes,
com a lista de rolls quando houver.

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
