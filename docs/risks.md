# Riscos técnicos

Ordenados por **impacto × probabilidade**. Cada risco tem sinal de alerta e mitigação
concreta — risco sem mitigação acionável é só pessimismo.

---

## 🔴 Críticos

### R1 — Perda de dado na migração do LocalStorage

**Impacto:** catastrófico e irreversível. Um usuário perde boletins de produções reais e o
produto perde a confiança de vez.
**Probabilidade:** média — é a operação mais delicada de todo o roadmap.

**Mitigação**

- `bdc:boletins:v1` **nunca** é apagado; vira snapshot (`bdc:backup:pre-platform`).
- Toda a gravação local numa única transação Dexie — falha parcial não existe.
- Confirmação explícita do usuário com prévia das contagens antes de aplicar.
- Verificação automática de contagens depois; divergência ⇒ `NEEDS_REVIEW`, nada apagado.
- Ids preservados ⇒ re-executar a migração não duplica.
- Export JSON oferecido em destaque antes de começar.
- Testado sobre um boletim v1 real, no caminho completo `v1 → v2 → plataforma`.

Detalhe em [migrations/local-to-cloud.md](migrations/local-to-cloud.md).

---

### R2 — Perder o offline-first ao introduzir o banco remoto

**Impacto:** catastrófico para o produto. O app existe **porque** funciona em locação sem
sinal. Um app que precisa de rede em set é pior que papel.
**Probabilidade:** **alta** — é o modo de falha natural de toda migração para nuvem. Basta um
`await fetch()` no caminho de leitura para a regressão entrar sem ninguém perceber.

**Mitigação**

- Regra estrutural: **a UI só lê e escreve no banco local.** A Sync Layer é a única que fala
  com o servidor. Não existe componente que chame `/api` diretamente.
- Modo LOCAL (sem conta) é modo de primeira classe e permanece testado.
- Teste E2E obrigatório em toda release: offline → criar → fechar → reabrir → sincronizar.
- Revisão de PR rejeita qualquer `fetch` fora de `lib/sync/`.
- Indicador de sync **informa, nunca bloqueia** — nenhum spinner impede digitar.

---

### R3 — Regressão no Boletim de Câmera (Fase 5)

**Impacto:** alto. É o módulo em produção, com usuários reais e uso diário.
**Probabilidade:** média-alta — reconstruir uma UI madura sempre perde detalhes.

**Mitigação**

- Checklist de paridade campo a campo antes de considerar a fase pronta
  ([features/camera.md §1](features/camera.md#1-o-que-existe-hoje)).
- Módulo novo atrás de flag; o antigo continua acessível em `/legado`.
- Rollback = desligar a flag.
- Comparação lado a lado do PDF gerado (antigo × novo) na mesma diária.
- Reaproveitar os componentes de UI existentes em vez de reescrever.

---

## 🟠 Altos

### R4 — Conflitos de sincronização mal resolvidos

**Impacto:** alto — sobrescrita silenciosa é pior que erro visível: ninguém descobre até a pós.
**Probabilidade:** média.

**Mitigação**

- A modelagem elimina a maioria: tabelas por departamento + `unique (setup_id, number)` +
  `unique (production_id, number, block)`.
- Payload é **delta**, não registro inteiro.
- Versão otimista com merge automático só de campos disjuntos.
- Conflito real **nunca** resolve sozinho: escala para o usuário, preservando os dois valores.
- Operação em `CONFLICT` jamais é descartada.
- Suíte de testes de conflito na Fase 3, antes de qualquer módulo novo.

Detalhe em [architecture/synchronization.md §4](architecture/synchronization.md#4-conflitos-19).

---

### R5 — Cota de armazenamento estourada pelas fotos

**Impacto:** alto — o navegador pode **despejar** o IndexedDB inteiro sob pressão.
**Probabilidade:** média. 200 fotos/diária × várias diárias chega perto do limite em iOS.

**Mitigação**

- Compressão no cliente antes de gravar (lado maior ~2000 px, WebP/JPEG ≈ 300 KB).
- `navigator.storage.persist()` solicitado no primeiro login.
- `navigator.storage.estimate()` monitorado; aviso em ~80 %.
- Descarte de blob **só** após upload confirmado **e** sob pressão de cota.
- Fotos antigas já sincronizadas podem ser liberadas sob demanda, mantendo a miniatura.
- Export ZIP da diária como válvula de escape.

---

### R6 — Complexidade acima da capacidade de manutenção

**Impacto:** alto — o projeto trava e nada mais é entregue.
**Probabilidade:** média-alta. Sai de ~3.500 linhas sem backend para uma plataforma
multiusuário com sync, auth e três domínios.

**Mitigação**

- Roadmap em fases entregáveis; nenhuma fase é "big bang".
- Não reescrever o que funciona: UI, PWA, impressão e backup são reaproveitados.
- Sem CRDT, sem microserviços, sem monorepo, sem state manager.
- Uma decisão tecnológica por área, registrada em [decisions.md](decisions.md) — nada de
  reavaliar escolha resolvida.
- Cada fase termina com documentação atualizada, não com dívida.

---

### R7 — UX de set degradada pela complexidade nova

**Impacto:** alto — se ficar lento de preencher, a equipe volta para o caderno, e o produto
morre mesmo estando tecnicamente correto.
**Probabilidade:** média.

**Mitigação**

- Herança e incremento automáticos como **regra de domínio** testada (§29/§30), não enfeite
  de UI.
- Status por um toque, sem modal e sem confirmação.
- Sem botão salvar em lugar nenhum.
- Teto de toques por take como critério de aceitação de cada módulo.
- Validar com usuário real (o próprio autor faz diárias) antes de fechar cada fase.

---

## 🟡 Médios

### R8 — Custo e limites da Vercel/Neon

Neon serverless com escala a zero tem **cold start**; funções da Vercel têm limite de duração
que atrapalha SSE de longa duração.

**Mitigação:** SSE com reconexão e fallback para polling; pull em lote em vez de muitas
requisições pequenas; monitorar tempo de resposta; nada disso afeta o uso offline — que é o
uso principal em set.

### R9 — Timezone e datas

`producao.data` hoje é string sem timezone. Diária é dia civil; timestamp é instante. Misturar
os dois gera boletim no dia errado para quem cruza fuso.

**Mitigação:** `date` para diária, `timestamptz` para auditoria, regra explícita no schema, e
teste com fuso deslocado.

### R10 — `crypto.randomUUID` indisponível

Exige contexto seguro. Já há fallback em `utils/id.ts`, **mas** um fallback fraco gera colisão
de PK no servidor, onde o id do cliente é definitivo.

**Mitigação:** reforçar o fallback com `crypto.getRandomValues`; o servidor rejeita id que não
seja UUID v4 bem formado; `unique` nas chaves naturais como segunda linha de defesa.

### R11 — Service Worker servindo versão velha

`VERSION` é bumpado à mão hoje. Esquecer significa usuário preso numa versão antiga —
gravíssimo se essa versão tiver bug de sync.

**Mitigação:** bump automatizado no build; nunca cachear `/api/**`; aviso de atualização
disponível na UI; um caminho de "recarregar agora".

### R12 — Divergência entre documentação e código

Doze documentos envelhecem sozinhos.

**Mitigação:** documento e código no mesmo commit; o DDL de referência é explicitamente
subordinado às migrations do Drizzle (uma fonte de verdade declarada); `decisions.md` registra
quando uma decisão muda, em vez de reescrever a história.

---

## 🟢 Baixos / aceitos

| Risco                                        | Por que é aceitável                                                   |
| -------------------------------------------- | --------------------------------------------------------------------- |
| Duplicação de metadados de cena entre blocos | Metadado descritivo, não unidade de gravação — decisão consciente     |
| Listas ordenadas sem merge por campo         | Último-a-escrever com aviso; CRDT não se paga aqui                    |
| Sem histórico de "de → para" por campo       | `createdBy`/`updatedBy` + `sync_log` cobrem o caso pedido             |
| Dependência do Dexie                         | Exceção registrada; alternativa é pior ([decisions.md](decisions.md)) |
| Departamentos futuros sem UI                 | Enum pronto; a arquitetura não impede a inclusão                      |
| PDF por impressão nativa                     | Funciona offline e já está validado em produção                       |
