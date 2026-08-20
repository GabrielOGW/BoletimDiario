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
> As rotas do boletim local mudaram para `/legado` (ADR-032) e a importação opcional está
> em `/legado/importar`.
>
> A tela `/takes` continua existindo enquanto Som e Continuidade não têm módulo — para eles
> é a única porta. Ela nunca foi o boletim de ninguém.
>
> **Fase 5 fechada em `2026-08-19`**, com Mídia/Suporte (§8) — a última pendência, que
> esperava o catálogo de equipamentos da Fase 8. As lacunas de paridade que sobraram estão
> listadas em §1, cada uma com dono declarado — e uma delas, a câmera do plano, é uma
> **decisão de modelo em aberto** (§7.1), não um item de implementação.

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

### Conferência campo a campo — `2026-08-11`

Campo do editor atual × campo do módulo na plataforma. É a lista que a Fase 5 pedia para
conferir "item a item"; o que está `⚠️` tem justificativa e dono.

| Editor atual                                                 | Módulo da plataforma                              |
| ------------------------------------------------------------ | ------------------------------------------------- |
| `Cena.numero`                                                | ✅ editável (renomeia todos os blocos da cena)    |
| `Bloco.letra`                                                | ✅ editável                                       |
| `Plano.numero`                                               | ✅ `setup.code`                                   |
| `Plano.cameraId`                                             | ⚠️ seletor funciona, mas guardado em `setup.name` |
| `Plano.cameraNome` (texto livre)                             | ⚠️ só o seletor — ver "o que falta" abaixo        |
| `Plano.tipo` (Normal, Série, Insert…)                        | ✅ "Tipo / Captação", com badge (migration 0004)  |
| `tecnica.*` (9 campos)                                       | ✅ todos, no cartão do Plano                      |
| `optica.lentes`, `optica.filtros`                            | ✅                                                |
| `optica.matteBox`                                            | ✅ caixa de seleção no cartão do Plano            |
| `Plano.observacoes`                                          | ✅ "Observações do plano" (`setup.description`)   |
| `Take.numero` · `cartao` · `clipSync` · `notaOperacional`    | ✅                                                |
| `Take.aprovado`                                              | ✅ o mesmo toggle verde, um toque                 |
| `CameraCadastrada.{nomeId,modelo,operador,foco,claquetista}` | ✅ os cinco                                       |
| Auto-save com debounce, sem botão salvar                     | ✅ 500 ms + flush no desmonte                     |
| Cenas do Dia                                                 | ✅ derivado dos takes                             |
| Horários · Equipe · Produção                                 | ✅ somente leitura, dado de sala (ADR-016)        |
| Observações gerais                                           | ✅ `ShootingDay.notes`, editável na sala          |
| PDF A4 com aprovados destacados                              | ✅ §6                                             |
| Mídia/Suporte                                                | ✅ derivada do take + kit da diária — §8          |
| Autocomplete aprendido + presets                             | ⚠️ ainda não — ver abaixo                         |
| Duplicar plano / cena / take                                 | ⚠️ ainda não — ver abaixo                         |
| Backup JSON                                                  | — próprio do modo local; a plataforma sincroniza  |

### O que falta, e por quê

**~~`Plano.tipo` não tem coluna.~~ Resolvido em `2026-08-11`** — migration `0004` acrescentou
`setups.kind`, `SYNC_ENTITIES.setup` ganhou o campo, e o cartão do Plano tem "Tipo /
Captação" com as mesmas sugestões do boletim (`Normal · Série · Insert · Pickup · Drone`),
**texto livre**, porque um seletor fechado viraria perda de dado na importação. O tipo vira
badge no cabeçalho do plano e sai na linha impressa — em ambos, `Normal` é omitido, porque
um selo em todo plano não informa nada. Coberto por `test:import` e `test:camera`.

**A câmera do plano ainda mora em `setup.name`.** É a última lacuna, e ela **não é uma
migration óbvia** — é uma decisão de modelo que eu não vou adivinhar. Ver
[§7.1](#71-a-decisão-em-aberto-a-câmera-do-plano).

**Autocomplete.** `lib/suggestions.ts` colhe valores dos boletins do LocalStorage; na
plataforma a fonte é o Dexie da diária. É um módulo novo, não uma adaptação — e é uma
funcionalidade de **velocidade em set**, então não pode entrar meia-boca.

**Duplicar plano/cena/take.** `lib/factory.ts` faz isso regenerando ids; na plataforma os
ids são derivados de chave natural (ADR-019), então duplicar significa escolher a chave
natural do clone. É uma decisão de domínio, não de UI.

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

### Como ficou (Fase 5)

Os campos novos que **já tinham coluna** entraram, cada um onde pertence:

| Campo                          | Onde ficou                                           |
| ------------------------------ | ---------------------------------------------------- |
| `focalLength`                  | Óptica, ao lado da lente                             |
| `aspectRatio`                  | Técnica, depois da resolução                         |
| `vfx`                          | Sozinho e por último no cartão do Plano — ver abaixo |
| `bodySerial`                   | Cartão da câmera; sai impresso como `s/n`            |
| `roll`, `volume`, `mediaNotes` | Take, numa área **"Mídia" fechada** — ver abaixo     |

**VFX fica sozinho e por último** porque não é configuração de captação: é um recado para a
pós ("marcadores no chão", "green screen"). Entre o ISO e o obturador, ele faria o olho de
quem preenche em set atravessar um campo que quase nunca muda.

**Roll, volume e observações de mídia ficam fechados.** Pertencem ao take, mas quase nunca
mudam de um para o outro — herdam do anterior — e o **teto de toques por take é critério de
conclusão do módulo**, não recomendação. Quem precisa deles abre uma vez; quem não precisa
nem os vê. O rótulo fechado já mostra o roll, então o valor é conferível sem abrir.

Os demais itens de §3 não são campo de câmera: `2º AC` é `ProductionMember` na sala,
`localização` é `ShootingDay.location` (e `Scene.location`), `observações para pós` são
`vfx` e `mediaNotes`, e **fotografia de referência não existe**
([ADR-022](../decisions.md#adr-022--sem-fotografias-na-v1)). `Plano.tipo` (`Setup.kind`)
ganhou coluna na migration `0004` e está no cartão do Plano — §1.

---

## 4. Status do take

`aprovado: boolean` → `TakeStatus` (`RECORDED · CIRCLE · NG · PARTIAL · WILD · ROOM_TONE ·
FALSE_START`), preservando `approved` como campo próprio.

O toggle verde grande "Aprovado pelo diretor" **continua existindo exatamente como está** — é
o gesto mais usado do app. O enum aparece como uma fileira de ações rápidas ao lado, opcional.
Trocar o toggle por um seletor de status seria uma regressão de UX em nome de pureza de
modelo.

### Como ficou (Fase 5)

**O toggle escreve nos dois lugares.** Aprovar continua sendo um toque, e grava
`camera_take_data.approved = true` **e** `takes.status = 'CIRCLE'` — o mesmo fato dito no
vocabulário compartilhado, que é o que Som e Continuidade leem. Antes ele gravava só
`approved`, e a diária digitada aqui divergia da importada, onde o mapeador já produzia
`CIRCLE` (ADR-010). Desaprovar volta para `RECORDED` **só** se o status era `CIRCLE`: um take
que alguém pôs em outro status por outro caminho não é rebaixado por uma desaprovação.

**A fileira de julgamento é secundária e opcional.** "Câmera: NG · Parcial", menor e abaixo
do toggle, escrevendo `camera_take_data.status` — o julgamento **da câmera**, que é outro eixo
que a aprovação do diretor. Tocar de novo no mesmo botão limpa; em set, desfazer não pode
custar um menu. Um take normal não precisa de nenhum toque aqui.

Só entraram `NG` e `PARTIAL`. `WILD`, `ROOM_TONE` e `FALSE_START` mudam para `TakeKind` na
Fase 6 ([ADR-029](../decisions.md#adr-029--julgamento-e-natureza-do-take-são-eixos-separados)),
e construir uma fileira agora para desmanchá-la daqui a uma fase seria trabalho negativo.

No papel, o julgamento sai ao lado do selo de aprovado — um take pode ser aprovado pelo
diretor e NG para a câmera, e a pós precisa saber. `RECORDED` e `CIRCLE` não viram marca:
o primeiro é o padrão de todo take, e o segundo já tem selo próprio.

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

A seção **Mídia/Suporte** saiu com a Fase 8 e substituiu "Cartões usados" na folha (§8).
O que ainda falta, por depender de outra fase: o CSV para a pós (Fase 9).

---

## 7. Compatibilidade

1. `/`, `/novo`, `/editar?id=`, `/visualizar?id=` continuam funcionando sobre LocalStorage
   até a Fase 5.
2. **Feito na Fase 5** ([ADR-032](../decisions.md#adr-032--legado-recebe-as-rotas-do-boletim-mas--continua-sendo-o-boletim)):
   o editor local mora em `/legado`, `/legado/novo`, `/legado/editar`, `/legado/visualizar`.
   **`/` renderiza a mesma lista** — é o `start_url` do PWA já instalado, e trocá-lo pela
   plataforma cobraria um toque a mais, todo dia, de quem só quer os boletins que já estão
   no aparelho. As três URLs antigas continuam navegáveis por **rewrite**, não por
   redirect: uma resposta redirecionada guardada em cache é recusada pelo navegador numa
   navegação, e o sintoma seria o app parar de abrir offline em quem criou o atalho.
3. `bdc:boletins:v1` **não é apagado**. Ver
   [../migrations/local-to-cloud.md](../migrations/local-to-cloud.md).
4. Importar backup no formato antigo continua funcionando — passa por `normalizeBoletim` e
   depois pelo mapeador.
5. Uso **sem conta** continua sendo um modo suportado, não uma versão degradada.

---

### 7.1 A decisão em aberto: a câmera do plano

Hoje a câmera de um plano é guardada em `setup.name`. Está documentado no código e **está
errado**: `name` é "Master, Close João" semanticamente, e um dia alguém vai preenchê-lo.

A correção parece uma migration de uma coluna. Não é — porque as três saídas dizem coisas
diferentes sobre o modelo, e escolher errado deixa uma coluna no schema para sempre.

**(a) `setups.camera_unit_id`.** Direto, uma migration, uma linha no contrato. Mas põe um
campo de **câmera** na `Setup`, que é a entidade **compartilhada** entre Câmera, Som e
Continuidade — e contradiz o próprio motivo de `CameraTakeData` ser por _(take, câmera)_:
um setup multicam tem duas câmeras, não uma.

**(b) Uma tabela do departamento** (`camera_setup_defaults`). Honesta com a fronteira: o
padrão de câmera do plano é assunto da Câmera. Custa uma entidade nova, uma linha em
`SYNC_ENTITIES` e uma tabela que existe só para guardar um id.

**(c) Nenhuma coluna — derivar.** A câmera do plano já é observável: é a dos
`CameraTakeData` dos seus takes. `planoTecnica` já lê a técnica assim, e `getPlanoDraft` já
cobre o plano sem takes. Custo zero de schema, e resolve o abuso de `name` de imediato. O
preço: um plano criado com câmera escolhida **e nenhum take ainda** não mostra essa escolha
em outro aparelho, porque o rascunho é local e não sincroniza.

**Recomendação: (c)**, e reavaliar se a queixa aparecer em set. É a única que não acrescenta
schema para um problema que ainda pode não existir, e é reversível — (a) e (b) continuam
possíveis depois, com dado real para justificar qual.

**Por que não foi decidido aqui:** a resposta depende de como o multicam é usado de verdade
nas produções deste app — se plano é por câmera ou se um plano é rodado por duas ao mesmo
tempo. Isso é conhecimento de set, não de código.

---

## 8. Mídia/Suporte — Fase 5, fechada em `2026-08-19`

Era a última pendência do módulo. Não entrou antes porque dependia do catálogo de
equipamentos da Fase 8: sem catálogo, "suporte" não tinha de onde vir.

### O que ela era, e por que não voltou como era

No boletim local, **Mídia/Suporte** é uma tabela digitada à mão — tipo de mídia, nº do
cartão, quantidade, responsável — e o número do cartão ainda é **digitado outra vez** em
cada take. Duas fontes para o mesmo dado, que divergem no primeiro dia corrido: a tabela diz
que rodaram três cartões e os takes mostram quatro, e ninguém sabe qual das duas está certa.

Na plataforma a seção voltou **derivada**, com as duas metades vindo de onde já existem:

| Metade                   | De onde vem                                                                                |
| ------------------------ | ------------------------------------------------------------------------------------------ |
| **O uso** — o que gravou | `CameraTakeData.{card,roll,volume}` de cada take, anotado no instante em que a câmera roda |
| **O suporte** — o que é  | `Equipment` de categoria `MEDIA` alocado na diária (`EquipmentAssignment`, Fase 8)         |

Ninguém redigita nada, e por isso a seção é **somente leitura**: ela é consequência do que
já foi preenchido. O cadastro do suporte é na sala, com sinal — o catálogo está fora da
fronteira offline (ADR-016) — e o cartão tem link para lá.

### O que ela mostra

`resumoDeMidia()` em [`features/camera/estrutura.ts`](../../features/camera/estrutura.ts) é
a leitura única, lida pela tela **e** pela folha, como o resto do módulo:

- **cartões**, cada um com quantos takes gravou e em que rolls apareceu — ordem natural
  (`A2` antes de `A10`), e espaço em volta do número não cria um cartão fantasma;
- **rolls** e **volumes** do dia, sem repetição;
- **suporte alocado** na diária, nos departamentos `CAMERA` e `DIT` — cartão e SSD costumam
  estar cadastrados no DIT, mas é o boletim de câmera que responde por eles no fim do dia.
  O cartão do gravador de som fica de fora: ele responde pelo sound report;
- **takes sem cartão anotado** — a pergunta que o DIT faz no fim do dia e que a tabela
  manual nunca respondeu. É lacuna, não erro: some quando alguém preenche.

Na folha, a seção substituiu "Cartões usados" no bloco de resumo, e o equipamento de câmera
que **não** é mídia continua na linha de "Equipamento" — repetir o mesmo SSD em duas linhas
da mesma folha é como o leitor passa a achar que são dois.

A filtragem por departamento e a seleção do suporte moram em
[`features/diaria/equipamentos.ts`](../../features/diaria/equipamentos.ts), fora do módulo,
porque a alocação é da **diária**: os três departamentos recebem a mesma lista e cada um lê
a sua fatia. Três filtros copiados seriam três respostas para "o que estamos usando hoje".

Coberto por `npm run test:camera` (60 checks, +22).

### Efeito colateral: um link que não existia

`SectionCard` recolhível descartava a `action` em silêncio — dentro de um `<button>` não
pode haver link, e o componente simplesmente não a renderizava. As três telas de diária
passavam um "Editar na sala" que **nunca aparecia**. Agora a ação desce para o fim do corpo
do cartão, e os links de equipe de Câmera, Som e Continuidade passaram a existir.
