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

```
bdc:boletins:v1  (LocalStorage — nunca apagado)
        │
        ▼  normalizeBoletim()            ← código existente, testado
   Boletim v2 em memória
        │
        ▼  mapBoletimToProduction()      ← domain/platform/from-boletim.ts (Fase 1 ✅)
   Production · ShootingDay · Scene · Setup · Take · CameraTakeData · CameraUnit
        │
        ▼  grava na produção escolhida (Dexie da diária + outbox)
   sincroniza como qualquer outra escrita
```

Não há caminho especial de subida: o que a importação produz entra na fila normal, com
idempotência, ordem e retry. Menos código, menos superfície de bug.

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
- [ ] Agrupamento de boletins em produções
- [ ] Colisão de data → `unit` incrementada

Um boletim v1 **real** já serve de fixture em `test/migration-check.mjs`, e o mesmo boletim
atravessa `test/platform-mapping-check.mjs` — o que valida `v1 → v2 → plataforma` de ponta a
ponta.
