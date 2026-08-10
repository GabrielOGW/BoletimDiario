# Riscos técnicos

Matriz refeita depois das decisões de [risks-response.md](risks-response.md) e
[plano-arquitetural-v2.md](plano-arquitetural-v2.md). **Riscos que deixaram de existir foram
removidos, não arquivados** — a versão anterior está no histórico do git.

Status possíveis: `MITIGATED` · `ACCEPTED` · `DEFERRED` · `NEEDS_DECISION`.

---

## Matriz

| #    | Risco                                             | Impacto      | Prob.      | Status      |
| ---- | ------------------------------------------------- | ------------ | ---------- | ----------- |
| R1b  | Perda de dado local no aparelho                   | catastrófico | baixa      | MITIGATED   |
| R2   | Rede virar requisito para preencher               | catastrófico | média      | MITIGATED   |
| R2b  | Fronteira offline mal desenhada                   | alto         | média      | MITIGATED   |
| R3   | Regressão no Boletim de Câmera                    | alto         | média      | MITIGATED   |
| R4   | Conflito mal resolvido / perda silenciosa         | alto         | baixa      | MITIGATED   |
| R6   | Complexidade acima da capacidade de manutenção    | alto         | média-baixa| MITIGATED   |
| R7   | UX de set degradada                               | alto         | baixa      | MITIGATED   |
| R11  | Service Worker servindo versão velha              | alto         | média      | MITIGATED   |
| R8   | Custo e limites de Vercel/Neon                    | médio        | baixa      | MITIGATED   |
| R9   | Timezone e data da diária                         | médio        | média      | MITIGATED   |
| R10  | `crypto.randomUUID` indisponível                  | médio        | baixa      | MITIGATED   |
| R12  | Divergência entre documentação e código           | médio        | média      | MITIGATED   |
| R13  | Renumerar take quebra o id determinístico         | baixo        | baixa      | ACCEPTED    |
| R14  | Conta obrigatória afasta o uso avulso             | baixo        | média      | ACCEPTED    |
| R15  | Polling insuficiente para a colaboração           | baixo        | baixa      | DEFERRED    |
| R16  | Listas ordenadas sem merge por campo              | baixo        | baixa      | ACCEPTED    |
| R17  | Metadado de cena duplicado entre blocos           | baixo        | alta       | ACCEPTED    |

### Removidos

| #   | Risco                                       | Por que deixou de existir                                        |
| --- | ------------------------------------------- | ---------------------------------------------------------------- |
| R1  | Perda de dado na migração do LocalStorage   | Não há dado real a preservar; migração virou importação opcional (ADR-023) |
| R5  | Cota de armazenamento estourada pelas fotos | Não há fotos na v1 (ADR-022)                                     |

---

## 🔴 Críticos

### R1b — Perda de dado local no aparelho

**Impacto:** catastrófico. O boletim de um dia de filmagem não se refaz de memória.
**Probabilidade:** baixa, e é o modo de falha que o design inteiro existe para evitar.

**Decisão:** banco local transacional (Dexie, ADR-003), dentro da fronteira (ADR-016).

**Mitigação**

- Escrita local **e** enfileiramento na **mesma transação**. Se não forem atômicos, existe uma
  janela em que o dado está salvo mas nunca será sincronizado — e ninguém percebe até o fim da
  diária.
- Escrita imediata a cada alteração, mais flush no `unmount` e em `visibilitychange`.
- Outbox persistida: sobrevive a fechar o app, reiniciar o aparelho e dias sem rede.
- `navigator.storage.persist()` solicitado no primeiro login, contra despejo do navegador.
- Export JSON continua funcionando offline — rede de segurança do próprio usuário.
- `bdc:boletins:v1` nunca é apagado.

---

### R2 — Rede virar requisito para preencher

**Impacto:** catastrófico para o produto. Um app que precisa de rede em set é pior que papel.
**Probabilidade:** média — é o modo de falha natural de toda migração para nuvem. Basta um
`await fetch()` no caminho de leitura para a regressão entrar sem ninguém perceber.

**Decisão:** fronteira offline explícita (ADR-016) + banco local como fonte de verdade dentro
dela (ADR-017).

**Mitigação**

- Regra estrutural verificável: **`fetch` é proibido dentro da fronteira** (módulos de
  departamento e telas de diária) e normal fora dela. Revisão de PR rejeita.
- Dentro da fronteira os módulos conhecem apenas `lib/offline/repos/*`; quem fala com o
  servidor é `lib/sync`.
- Teste E2E obrigatório em toda release: offline → criar → fechar o PWA → reabrir →
  sincronizar → outro dispositivo recebe.
- Indicador de sync **informa, nunca bloqueia**. Nenhum spinner impede digitar, nem mesmo com
  protocolo incompatível.

---

## 🟠 Altos

### R2b — Fronteira offline mal desenhada

**Impacto:** alto. Chegar na locação sem sinal e descobrir que a diária não abre é pior do que
não ter prometido offline.
**Probabilidade:** média — é o risco que a própria ADR-016 introduz.

**Decisão:** aceitar a fronteira, defendendo a borda.

**Mitigação**

- **Fixação automática:** estando online, a produção ativa baixa a diária de hoje e a de amanhã
  em background. Chegar com a diária pronta é o caso normal, não a sorte.
- **Criar diária offline funciona** — id derivado de `(productionId, date)`, converge depois com
  a que outro dispositivo tiver criado para o mesmo dia.
- Diária não fixada e sem rede mostra estado explícito ("conecte-se uma vez para trabalhar nela
  offline"), não uma tela de erro.
- Revisitar a fronteira sempre que um campo novo pedir dado do servidor em set.

---

### R3 — Regressão no Boletim de Câmera

**Impacto:** alto. É o módulo maduro e a referência do produto.
**Probabilidade:** média — reconstruir uma UI madura sempre perde detalhes.

**Decisão:** câmera é a **última** fase de módulo (Fase 5), sobre fundação já estável, e é
migração, não redesenho (ADR-024).

**Mitigação**

- Checklist de paridade campo a campo antes de considerar a fase pronta
  ([features/camera.md §1](features/camera.md#1-o-que-existe-hoje)).
- Reaproveitar os componentes existentes em vez de reescrever.
- Módulo novo atrás de flag; o antigo permanece em `/legado`. Rollback = desligar a flag.
- Comparação lado a lado do PDF gerado (antigo × novo) na mesma diária.

---

### R4 — Conflito mal resolvido / perda silenciosa

**Impacto:** alto — sobrescrita silenciosa é pior que erro visível: ninguém descobre até a pós.
**Probabilidade:** baixa, depois das decisões.

**Decisão:** compare-and-set por campo (ADR-018) + ids determinísticos (ADR-019) +
convergência com pendência (ADR-020).

**Mitigação**

- A modelagem elimina a maioria: tabelas por departamento, e chave natural única por entidade.
- Ids derivados fazem "dois dispositivos criam o mesmo take" convergir, em vez de colidir.
- Campos disjuntos fazem merge automático, sem diálogo no meio da filmagem.
- Conflito real **nunca** resolve sozinho, é sempre **de um campo** e nunca bloqueia o resto do
  take, da diária ou o outro departamento.
- Operação em conflito jamais é descartada; o valor do usuário fica em `syncConflicts`.
- Suíte de testes de conflito escrita **junto** com o sync (Fase 4), antes de qualquer módulo.

Detalhe em [plano-arquitetural-v2.md §F](plano-arquitetural-v2.md#f-conflitos--exemplos-reais).

---

### R6 — Complexidade acima da capacidade de manutenção

**Impacto:** alto — o projeto trava e nada mais é entregue.
**Probabilidade:** média-baixa, depois dos cortes.

**Decisão:** cortar escopo antes de organizar escopo.

**Mitigação**

- Fronteira offline: o sync cobre ~9 tabelas, não ~20.
- Fora: fotos, SSE, CRDT, histórico campo a campo, migração cerimonial, modo local duplo.
- Cinco skills com escopo declarado (ADR-027), não onze, e não subagentes concorrentes.
- Roadmap em fases entregáveis e desligáveis; nenhuma é "big bang".
- Uma decisão tecnológica por área, registrada em [decisions.md](decisions.md).
- Cada fase termina com documentação atualizada, não com dívida.

---

### R7 — UX de set degradada pela complexidade nova

**Impacto:** alto — se ficar lento de preencher, a equipe volta para o caderno.
**Probabilidade:** baixa.

**Decisão:** critério de aceite, não recomendação.

**Mitigação**

- Teto de toques por take como critério de conclusão de cada módulo.
- Herança e incremento automáticos como **regra de domínio** testada, não enfeite de UI.
- Status por um toque, sem modal e sem confirmação. Sem botão salvar em lugar nenhum.
- Sem espera por sincronização, sem tela pesada, sem animação desnecessária.
- Validar com usuário real (o próprio autor faz diárias) antes de fechar cada fase.

---

### R11 — Service Worker servindo versão velha

**Impacto:** alto — usuário preso numa versão antiga, gravíssimo se ela tiver bug de sync.
**Probabilidade:** média. Hoje `VERSION` é `'v1'`, bumpado à mão.

**Decisão:** três versões encadeadas (ADR-026).

**Mitigação**

- `VERSION` e `APP_SHELL` gerados no build, não escritos à mão.
- `/api/**` **nunca** em cache — resposta de sync em cache é corrupção silenciosa.
- Aviso "nova versão disponível" com ação **Atualizar agora** (via `registration.waiting`).
- Protocolo de sync versionado: cliente velho é recusado (`426`) e avisado, mas **continua
  editando** — o bloqueio é da sincronização, nunca do preenchimento.

---

## 🟡 Médios

### R8 — Custo e limites da Vercel/Neon

Neon com escala a zero tem cold start; funções da Vercel têm limite de duração.

**Decisão:** polling adaptativo, sem SSE (ADR-021).
**Mitigação:** nenhuma função de longa duração; polling para completamente com a aba oculta;
pull sem novidade é consulta por índice; pull em lote em vez de muitas requisições pequenas.
Nada disso afeta o uso offline — que é o uso principal em set.

### R9 — Timezone e data da diária

Diária é dia civil; timestamp é instante. Misturar os dois gera boletim no dia errado para quem
cruza fuso.

**Decisão:** `date` para `shooting_days.date`, `timestamptz` para auditoria.
**Mitigação:** regra explícita no schema, a data da diária **nunca** é convertida para UTC, e
teste com fuso deslocado. A data também entra na derivação do id da diária (ADR-019), então
tratá-la como instante duplicaria diárias.

### R10 — `crypto.randomUUID` indisponível

Exige contexto seguro, e um fallback fraco gera colisão de PK no servidor, onde o id do cliente
é definitivo.

**Decisão:** corrigido já na preparação.
**Mitigação:** fallback reescrito sobre `crypto.getRandomValues` em [utils/id.ts](../utils/id.ts),
com falha explícita se não houver fonte criptográfica — melhor erro que id ruim. O servidor
valida formato de UUID; `unique` nas chaves naturais é a segunda linha de defesa; e onde há
chave natural o id é derivado (ADR-019), não sorteado.

### R12 — Divergência entre documentação e código

**Decisão:** documento e código no mesmo commit.
**Mitigação:** cada skill declara qual documento é obrigada a atualizar; as migrations do
Drizzle são a fonte executável e o schema documentado é explicitamente subordinado a elas;
`decisions.md` registra quando uma decisão muda, com bloco "Revisto em", em vez de reescrever a
história.

---

## 🟢 Aceitos e adiados

| #   | Risco                                     | Decisão   | Por que é aceitável                                                          |
| --- | ----------------------------------------- | --------- | ----------------------------------------------------------------------------- |
| R13 | Renumerar take quebra o id determinístico | ACCEPTED  | O número é automático; renumerar é raro e cai no caminho de conflito explícito |
| R14 | Conta obrigatória afasta o uso avulso     | ACCEPTED  | `/legado` permanece sem conta, offline, com PDF                               |
| R15 | Polling insuficiente para a colaboração   | DEFERRED  | SSE documentado como upgrade sobre o **mesmo** cursor — troca só o gatilho    |
| R16 | Listas ordenadas sem merge por campo      | ACCEPTED  | Último-a-escrever na lista, com aviso na UI; CRDT não se paga aqui            |
| R17 | Metadado de cena duplicado entre blocos   | ACCEPTED  | Metadado descritivo, não unidade de gravação; a UI edita no nível do `number` |
| —   | Dependência do Dexie                      | ACCEPTED  | Exceção registrada; alternativa é pior ([ADR-003](decisions.md))              |
| —   | Departamentos futuros sem UI              | ACCEPTED  | Enum pronto; a arquitetura não impede a inclusão                              |
| —   | PDF por impressão nativa                  | ACCEPTED  | Funciona offline e já está validado em produção ([ADR-014](decisions.md))     |
