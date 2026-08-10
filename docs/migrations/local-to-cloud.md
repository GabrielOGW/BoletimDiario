# Migração — dados locais → nuvem

O aplicativo **já está em produção e já tem dados de usuários reais**. Esta é a parte
obrigatória e mais arriscada da evolução (§40).

> **Regra número um: não destruir dado existente.** Nenhuma etapa desta migração apaga,
> sobrescreve ou move a base atual. Tudo é aditivo e reversível até o usuário confirmar.

---

## 1. Onde os dados estão hoje

Levantado no código, não presumido:

| Chave LocalStorage | Conteúdo                                      | Escrito por      |
| ------------------ | --------------------------------------------- | ---------------- |
| `bdc:boletins:v1`  | `JSON.stringify(Boletim[])` — **toda a base** | `lib/storage.ts` |
| `bdc:migrated:v2`  | `'true'` após a reescrita proativa v1→v2      | `lib/migrate.ts` |
| `bdc:seeded:v1`    | `'true'` após semear o boletim demo           | `lib/seed.ts`    |

Não há IndexedDB, não há cookie de dado, não há nada no servidor. Toda leitura passa por
`normalizeBoletim()`, então **qualquer** conteúdo dessa chave — v1, v2 ou parcial — já é
coagido para um `Boletim` v2 válido antes de ser visto.

Isso simplifica a migração de forma decisiva: **o migrador só precisa lidar com um formato de
entrada** (`Boletim` v2 normalizado), não com o histórico inteiro do schema.

---

## 2. Fluxo

```
bdc:boletins:v1  (LocalStorage — PRESERVADO, nunca apagado)
        │
        ▼  normalizeBoletim()          ← código existente, já testado
   Boletim v2 em memória
        │
        ▼  mapBoletimToProduction()    ← domain/platform/from-boletim.ts (Fase 1 ✅)
   Production · ShootingDay · Scene · Setup · Take · CameraTakeData · CameraUnit …
        │
        ▼  gravação local (Dexie)      ← Fase 3, isProvisional = true
   banco local da plataforma
        │
        ▼  usuário autentica e escolhe subir
   outbox → /api/sync/push
        │
        ▼
   Neon PostgreSQL
```

As duas primeiras etapas **não precisam de conta, nem de rede**. Quem nunca criar conta fica
com a produção local, funcionando, para sempre.

---

## 3. Etapas

### Etapa 0 — Snapshot (antes de qualquer coisa)

Antes da primeira gravação no Dexie:

1. Copiar `bdc:boletins:v1` para `bdc:backup:pre-platform` com carimbo de data.
2. Gravar `bdc:platform-migration` = `{ startedAt, boletinsCount, status: 'RUNNING' }`.
3. Oferecer o download do backup JSON (opcional, mas sugerido em destaque).

`bdc:boletins:v1` **continua sendo lido e escrito** pelas rotas legadas enquanto elas
existirem. A migração não é um corte.

### Etapa 1 — Agrupamento em produções

Um `Boletim` = uma diária. Várias diárias do mesmo projeto = uma produção.

Chave de agrupamento: `slug(producao.tituloProjeto)` + `slug(producao.produtora)`.
Boletins sem título viram uma produção `"Boletins sem título"`.

```
Boletim "Filme X" 10/08  ┐
Boletim "Filme X" 11/08  ├─► Production "Filme X"  ─► 3 ShootingDay
Boletim "Filme X" 12/08  ┘
Boletim "Curta Y" 03/07  ──► Production "Curta Y"  ─► 1 ShootingDay
```

Agrupar automaticamente é um palpite — por isso a **Etapa 3 mostra o resultado antes de
confirmar**, e o usuário pode separar ou juntar.

Colisão de data na mesma produção (dois boletins no mesmo dia, comum com duas unidades): o
segundo recebe `unit = "2"`, preservando ambos. Nenhum boletim é descartado por colisão.

### Etapa 2 — Mapeamento

Implementado e testado em
[`domain/platform/from-boletim.ts`](../../domain/platform/from-boletim.ts). Tabela completa em
[../features/camera.md §2](../features/camera.md#2-mapeamento-para-o-modelo-compartilhado).

Pontos que merecem atenção:

| Item                       | Tratamento                                                                                                                 |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Ids                        | **Preservados** onde existem (`cena_…`, `plano_…`, `take_…`). Um id preservado torna a migração re-executável sem duplicar |
| `Cena` + `Bloco`           | Viram uma `Scene` por bloco (`number` + `block`)                                                                           |
| `Plano`                    | Vira `Setup`; a técnica/óptica é copiada para o `CameraTakeData` de cada take                                              |
| Plano **sem takes**        | Vira `Setup` sem takes — a configuração técnica é preservada no setup                                                      |
| `Take.numero` não numérico | `number` recebe a posição na lista; o texto original vai para `notes`                                                      |
| `Take.aprovado`            | `approved = true` **e** `status = CIRCLE`                                                                                  |
| `equipeCamera[]`           | Vira `ProductionMember` **provisório** (sem `userId`) até alguém entrar na sala                                            |
| `midiaSuporte[]`           | Vira `Equipment` + `EquipmentAssignment` da diária                                                                         |
| `cenasDoDia`               | **Não migrado** — recalculado; `continuidade` vai para `ShootingDay.notes`                                                 |
| `createdAt`/`updatedAt`    | Preservados; `createdBy` fica nulo (não havia identidade)                                                                  |

### Etapa 3 — Confirmação do usuário

Tela **não pulável**, com a prévia do agrupamento:

```
Encontramos 14 boletins neste dispositivo.

  Filme X          8 diárias   126 cenas   410 takes   [ separar ]
  Curta Y          5 diárias    31 cenas    88 takes   [ separar ]
  Sem título       1 diária      2 cenas     4 takes   [ ignorar ]

  Seus boletins atuais continuam disponíveis em "Boletins legados".

  [ Confirmar e importar ]        [ Agora não ]
```

"Agora não" é uma escolha legítima e repetível — o app continua funcionando como hoje. Sem
pressão, sem repetir o prompt a cada abertura.

### Etapa 4 — Gravação local

Tudo dentro de **uma transação Dexie**. Falha no meio deixa o banco local intacto e
`bdc:platform-migration.status = 'FAILED'` com o erro; nada é aplicado pela metade.

Produções nascem `isProvisional = true` (locais, ainda não sincronizadas) e **não** enfileiram
nada no outbox — subir é decisão explícita da Etapa 5.

### Etapa 5 — Subida (opcional, requer conta)

Só quando o usuário autentica e escolhe "sincronizar esta produção":

1. `POST /api/productions` cria a produção remota; o usuário vira `OWNER`.
2. As entidades entram no outbox como `CREATE`, na ordem de dependência
   (production → shootingDay → scene → setup → take → \*TakeData).
3. Sincronização normal, com todas as garantias do push (idempotência, retry, ordem).
4. Concluído: `isProvisional = false`.

Falhar aqui não é perda: as operações ficam na fila e a produção continua local e utilizável.

### Etapa 6 — Verificação

Depois da gravação local e depois da subida, uma checagem automática compara **contagens** por
produção: diárias, cenas, setups, takes, takes aprovados e câmeras.

Divergência ⇒ a migração é marcada como `NEEDS_REVIEW`, nada é apagado, e o usuário vê um
relatório com o que não bateu. Silêncio em migração de dado é como se perde a confiança do
usuário de uma vez só.

---

## 4. O que NÃO acontece

- ❌ `bdc:boletins:v1` **não** é apagado — nem depois da subida bem-sucedida.
- ❌ As rotas `/editar` e `/visualizar` **não** param de funcionar.
- ❌ Nenhum dado é enviado ao servidor sem ação explícita do usuário.
- ❌ Nada exige criar conta.
- ❌ Backups antigos **não** deixam de importar.

A limpeza do LocalStorage, se um dia acontecer, é uma decisão separada, com aviso antecipado,
e nunca antes de várias versões de convivência.

---

## 5. Reversibilidade

| Situação                                 | Recuperação                                                       |
| ---------------------------------------- | ----------------------------------------------------------------- |
| Migração falhou no meio                  | Transação Dexie desfeita; LocalStorage intacto                    |
| Agrupamento errado                       | Desfazer a importação e refazer (ids preservados ⇒ sem duplicata) |
| Usuário quer voltar ao app antigo        | Rotas legadas continuam lendo `bdc:boletins:v1`                   |
| Dispositivo perdido antes de sincronizar | Backup JSON (se exportado) — a exportação é oferecida na Etapa 0  |
| Produção subiu errada                    | `OWNER` exclui a produção remota; a cópia local permanece         |

---

## 6. Testes

Reaproveitando o padrão do `test:migration` já existente:

- [x] `Boletim` v1 → normalização v2 (**22 asserts, já existente**)
- [x] `Boletim` v2 → modelo da plataforma (`test:platform`, **Fase 1**)
- [x] Cena com N blocos → N `Scene` com o mesmo `number`
- [x] Ids preservados ⇒ mapear duas vezes produz o mesmo resultado (idempotência)
- [x] `aprovado` → `approved` + `CIRCLE`
- [x] Contagens conferem (cenas, setups, takes, aprovados)
- [ ] Agrupamento de boletins em produções (Fase 3)
- [ ] Colisão de data → `unit` incrementada (Fase 3)
- [ ] Rollback de transação em falha parcial (Fase 3)
- [ ] Subida completa de uma produção migrada (Fase 5)

Um boletim v1 **real** já serve de fixture em `test/migration-check.mjs`; o mesmo boletim
atravessa agora as duas etapas em `test/platform-mapping-check.mjs`, o que valida o caminho
`v1 → v2 → plataforma` de ponta a ponta.
