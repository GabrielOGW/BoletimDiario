# Importação — boletins locais → plataforma

> **Reescrito na rodada 2**
> ([ADR-023](../decisions.md#adr-023--a-migração-vira-importação-opcional)). A versão anterior
> descrevia uma migração obrigatória em seis etapas, com snapshot, prévia não pulável,
> verificação de contagens e estado `NEEDS_REVIEW`. Ela resolvia um problema que **não
> existe**: não há dado real de produção a preservar. A cerimônia foi removida; o mapeamento,
> que já está pronto e testado, permanece.

---

## 1. O que mudou e por quê

O Boletim de Câmera **não está em uso com dados reais** que precisem sobreviver. Gastar
complexidade permanente de arquitetura para proteger dado que não existe é o oposto do que o
projeto precisa agora.

| Antes                                               | Agora                                             |
| --------------------------------------------------- | ------------------------------------------------- |
| Etapa obrigatória do roadmap                        | Ação opcional, disponível quando o usuário quiser |
| Snapshot `bdc:backup:pre-platform` + carimbo        | Desnecessário — `bdc:boletins:v1` não é tocado    |
| Tela de confirmação não pulável, com prévia         | Um botão em Configurações                         |
| Verificação automática de contagens, `NEEDS_REVIEW` | Relatório simples do que entrou                   |
| Produção provisória (`isProvisional`) até subir     | Importa direto para a produção escolhida          |
| Reversibilidade em seis cenários                    | Repetir a importação; ids derivados não duplicam  |

**O que permanece obrigatório:** boas práticas de migração de **schema** — upgrade versionado
do Dexie e migrations do Drizzle. O que saiu foi a cerimônia de migração de **dados**.

---

## 2. Onde os dados estão hoje

| Chave LocalStorage | Conteúdo                                      | Escrito por      |
| ------------------ | --------------------------------------------- | ---------------- |
| `bdc:boletins:v1`  | `JSON.stringify(Boletim[])` — **toda a base** | `lib/storage.ts` |
| `bdc:migrated:v2`  | `'true'` após a reescrita proativa v1→v2      | `lib/migrate.ts` |
| `bdc:seeded:v1`    | `'true'` após semear o boletim demo           | `lib/seed.ts`    |

Toda leitura passa por `normalizeBoletim()`, então **qualquer** conteúdo dessa chave — v1, v2 ou
parcial — já chega ao importador como um `Boletim` v2 válido. O importador lida com **um**
formato de entrada, não com o histórico inteiro do schema.

---

## 3. Fluxo

**Implementado na Fase 5.** Tela em `/legado/importar`, ação em
[`features/legado/actions.ts`](../../features/legado/actions.ts), escrita em
[`lib/db/queries/import.ts`](../../lib/db/queries/import.ts).

```
bdc:boletins:v1  (LocalStorage — nunca apagado)
        │
        ▼  o navegador só AGRUPA e CONTA, para mostrar o que vai subir
   groupBoletins() + countBoletins()
        │
        ▼  Server Action recebe o JSON CRU do grupo escolhido
        │
        ▼  normalizeBoletim()            ← no servidor; é a fronteira de confiança
   Boletim v2 em memória
        │
        ▼  mapGroupToSnapshot()          ← domain/platform/from-boletim.ts (Fase 1 ✅)
   Production · ShootingDay · Scene · Setup · Take · CameraTakeData · CameraUnit
        │
        ▼  insert … on conflict do nothing, em lotes, na ordem das dependências
   o sync_log avisa os outros dispositivos como avisaria de qualquer escrita
```

### Três decisões que valem explicação

**O cliente manda o boletim cru, não o modelo mapeado.** Aceitar o modelo já mapeado seria
abrir uma porta de escrita direta nas tabelas — bastaria forjar o payload. Mandando o
boletim, a primeira coisa que acontece no servidor é `normalizeBoletim()`, que já é uma
coerção defensiva sem `any` capaz de transformar _qualquer_ JSON num `Boletim` válido. De
quebra, garante que a importação use exatamente o mapeador testado, e não uma cópia que o
navegador rodou.

**A importação é fora da fronteira offline** (ADR-016), e por isso **não** passa pela
outbox. É uma operação feita sentado, com sinal, uma vez. Fazê-la passar pela fila exigiria
fixar cada diária antes de importar — e `ShootingDay` nem entra no pull, porque é editada
fora da fronteira. Escrever direto é o caminho mais curto e o único que não inventa
mecanismo novo.

**Nada é sobrescrito.** Toda inserção é `on conflict do nothing`, e o relatório mostra o
que **de fato** entrou. Reimportar depois de alguém ter corrigido um cartão na plataforma
não desfaz a correção; devolve zeros, que é a confirmação visível de que nada duplicou.

### O que a importação não leva

| Item               | Por quê                                                                                                                             |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| `equipeCamera[]`   | Membro da sala **é uma conta** (`production_members.user_id` é `not null`). Os nomes continuam no boletim local, que não é apagado. |
| `midiaSuporte[]`   | Depende do catálogo de equipamentos, que é da Fase 8.                                                                               |
| Som e Continuidade | Não existem no boletim de origem.                                                                                                   |

O mapeador continua produzindo esses registros — o que a Fase 5 não faz é gravá-los. Quando
a Fase 8 chegar, é uma chamada a mais no mesmo lugar.

---

## 4. Agrupamento

Um `Boletim` = uma diária. Chave de agrupamento: `slug(producao.tituloProjeto)` +
`slug(producao.produtora)`. Boletins sem título viram `"Boletins sem título"`.

```
Boletim "Filme X" 10/08  ┐
Boletim "Filme X" 11/08  ├─► Production "Filme X"  ─► 3 ShootingDay
Boletim "Filme X" 12/08  ┘
```

Colisão de data na mesma produção (duas unidades no mesmo dia): a segunda recebe `unit = "2"`.
Nenhum boletim é descartado por colisão.

---

## 5. Repetibilidade

Os ids são **derivados** — dos ids legados onde existem, da chave natural onde não
([ADR-019](../decisions.md#adr-019--ids-determinísticos-por-chave-natural)). Consequência
direta: **importar duas vezes produz exatamente o mesmo resultado**, sem duplicata.

É isso que substitui toda a maquinaria de reversibilidade da versão anterior: se saiu errado,
corrija e importe de novo.

### O id da produção inclui quem importa

Correção feita na Fase 5, junto com a implementação. O id da produção derivava só de
`slug(título) + slug(produtora)` — determinístico, como tinha de ser, mas **igual para
pessoas diferentes**. Duas pessoas importando "Filme X · Produtora Y" dos próprios aparelhos
derivariam o mesmo id, e a segunda importação cairia dentro da produção da primeira, onde
ela nem é membro.

Agora `deriveId('production', actorId, group.key)`. O determinismo que a repetibilidade
exige continua valendo — a **mesma** pessoa importando de novo converge para a mesma
produção. As cenas derivam do id da produção e acompanham; diária, setup, take e dados de
câmera derivam do id legado, que já é único por aparelho.

Por precaução, a importação ainda recusa (`NAO_E_DONO`) se encontrar a produção derivada
pertencendo a outra pessoa. Colisão aqui é improvável a ponto de ser sintoma de outra coisa,
e despejar boletins na sala de um desconhecido é o único erro sem conserto desta tela.

---

## 6. Mapeamento

Implementado e testado em
[`domain/platform/from-boletim.ts`](../../domain/platform/from-boletim.ts). Tabela completa em
[../features/camera.md §2](../features/camera.md#2-mapeamento-para-o-modelo-compartilhado).

| Item                       | Tratamento                                                                      |
| -------------------------- | ------------------------------------------------------------------------------- |
| `Cena` + `Bloco`           | Uma `Scene` por bloco (`number` + `block`)                                      |
| `Plano`                    | Vira `Setup`; a técnica/óptica é copiada para o `CameraTakeData` de cada take   |
| Plano **sem takes**        | Vira `Setup` sem takes — a configuração técnica é preservada                    |
| `Take.numero` não numérico | `number` recebe a posição na lista; o texto original vai para `notes`           |
| `Take.aprovado`            | `approved = true` **e** `status = CIRCLE`                                       |
| `equipeCamera[]`           | Vira `ProductionMember` **provisório** (sem `userId`) até alguém entrar na sala |
| `midiaSuporte[]`           | Vira `Equipment` + `EquipmentAssignment` da diária                              |
| `cenasDoDia`               | Não migrado — recalculado; `continuidade` vai para `ShootingDay.notes`          |
| `createdAt`/`updatedAt`    | Preservados; `createdBy` fica nulo (não havia identidade)                       |

---

## 7. O que NÃO acontece

- ❌ `bdc:boletins:v1` **não** é apagado — nem depois de importar.
- ❌ As rotas legadas **não** param de funcionar.
- ❌ Nenhum dado é enviado ao servidor sem ação explícita do usuário.
- ❌ Nenhum prompt insistente a cada abertura.

---

## 8. Testes

- [x] `Boletim` v1 → normalização v2 (**22 asserts**, `npm run test:migration`)
- [x] `Boletim` v2 → modelo da plataforma (`npm run test:mapping`)
- [x] Cena com N blocos → N `Scene` com o mesmo `number`
- [x] Ids derivados ⇒ mapear duas vezes produz o mesmo resultado
- [x] `aprovado` → `approved` + `CIRCLE`
- [x] Contagens conferem (cenas, setups, takes, aprovados)
- [x] Agrupamento de boletins em produções
- [x] Colisão de data → `unit` incrementada
- [x] Importador diferente ⇒ produção diferente (`npm run test:mapping`)
- [x] **Contra o banco real** (`npm run test:import`, 28 checks): a produção é criada com
      quem importa como `OWNER`; reimportar não insere nada e não duplica; reimportar não
      sobrescreve o que alguém editou depois; o mesmo projeto de outra pessoa vira outra
      produção e a primeira não entra nela; payload vazio, não-lista e boletim quase vazio
      respondem sem quebrar

Um boletim v1 **real** já serve de fixture em `test/migration-check.mjs`, e o mesmo boletim
atravessa `test/platform-mapping-check.mjs` — o que valida `v1 → v2 → plataforma` de ponta a
ponta.
