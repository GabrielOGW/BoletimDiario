# Autenticação

Requisitos (§6): cadastro, login, logout, recuperação de senha, sessão persistente, proteção
de rotas privadas e associação usuário↔produção. Restrição explícita: **não implementar
autenticação caseira**.

Restrição implícita, e mais difícil: **a autenticação não pode impedir o app de funcionar
offline**. Um celular em locação sem sinal precisa abrir o app e continuar preenchendo.

---

## 1. Avaliação

| Critério                           | **Better Auth**              | Auth.js v5 (NextAuth)                   | Clerk / serviço externo                     |
| ---------------------------------- | ---------------------------- | --------------------------------------- | ------------------------------------------- |
| E-mail + senha nativo              | ✅ primeira classe           | ⚠️ só via `Credentials`, sem hash/fluxo | ✅                                          |
| Recuperação de senha               | ✅ incluída (token + e-mail) | ❌ por conta do desenvolvedor           | ✅                                          |
| Verificação de e-mail              | ✅ incluída                  | ❌ manual com Credentials               | ✅                                          |
| Adapter Drizzle + Postgres         | ✅ oficial                   | ✅ oficial                              | ❌ dados fora do Neon                       |
| Sessão em DB **e** cookie cache    | ✅ ambos                     | ⚠️ Credentials força JWT                | ✅ (mas remoto)                             |
| Dados de usuário no próprio banco  | ✅                           | ✅                                      | ❌ — quebra o join com `production_members` |
| Custo                              | zero (biblioteca)            | zero                                    | pago por MAU                                |
| Funciona sem rede na inicialização | ✅ cookie assinado local     | ✅ JWT                                  | ⚠️ SDK tende a exigir rede                  |
| Vendor lock-in                     | nenhum                       | nenhum                                  | alto                                        |

### Por que **não** Auth.js v5

O `Credentials` provider do Auth.js, por design, **não gerencia senha**: ele entrega um
callback `authorize()` onde _você_ faz o hash, a comparação, o rate limit, o token de reset,
o e-mail de recuperação e a expiração. Isso é exatamente "implementar autenticação caseira" —
só que com um invólucro que dá a falsa sensação de estar coberto. Além disso, com
`Credentials` o Auth.js força estratégia JWT, o que dificulta revogar sessão de um dispositivo
perdido em set (caso concreto e frequente).

Auth.js seria a escolha certa se o produto fosse só OAuth (Google/Apple). Não é: uma equipe de
set precisa entrar com e-mail e senha, inclusive em conta compartilhada de departamento.

### Por que **não** Clerk (ou similar)

Tira o usuário do Neon. `production_members.user_id` passaria a referenciar um id externo,
sem FK, sem join, sem integridade — e a query mais executada da plataforma ("quais produções
esse usuário acessa") viraria uma chamada de rede. Some-se custo por usuário ativo numa
ferramenta cujo público é equipe de produção rotativa.

---

## 2. Decisão

> **Better Auth**, com e-mail + senha, adapter Drizzle sobre o mesmo banco Neon.

Configuração:

> **Status: implementado.** Configuração em [`lib/auth/config.ts`](../../lib/auth/config.ts),
> schema em [`lib/db/schema/auth.ts`](../../lib/db/schema/auth.ts), telas em `app/(public)/`.

| Item                  | Valor                                                                   |
| --------------------- | ----------------------------------------------------------------------- |
| Método                | `emailAndPassword` (OAuth Google/Apple fica como extensão futura)       |
| Hash de senha         | padrão da biblioteca (scrypt) — **nunca** implementação própria         |
| Sessão                | persistida em tabela + cookie assinado                                  |
| Expiração             | **90 dias**, renovada a cada 7 dias de uso — ver abaixo                 |
| Cookie                | `httpOnly`, `secure`, `sameSite=lax`                                    |
| Id de usuário         | **`uuid`** (`advanced.database.generateId: 'uuid'`) — ver abaixo        |
| Verificação de e-mail | **desligada** enquanto não houver provedor de envio (ADR-028)           |
| Recuperação de senha  | fluxo nativo completo, token de uso único válido por 1 h                |
| Envio de e-mail       | **sem provedor**; interface em `lib/auth/mailer.ts` (ADR-028)           |
| Tabelas               | `users`, `sessions`, `accounts`, `verifications` (schema da biblioteca) |

### Os dois desvios do padrão, e por quê

**Id `uuid`.** Sem isso a Better Auth gera id em texto, e **toda** coluna
`created_by`/`updated_by` do domínio — que é `uuid references users(id)` — perde a FK. Com
`generateId: 'uuid'` e `usePlural: true`, o schema gerado pela CLI da biblioteca coincide
exatamente com o que o domínio precisa. Verificado: uma conta criada pelo endpoint de cadastro
nasce com id UUID e serve de `created_by` numa produção real.

**Sessão de 90 dias**, renovada a cada 7. Não é relaxamento de segurança: a sessão persistir é
o que sustenta a promessa de offline (ADR-025). Em locação sem sinal, uma sessão expirada não
tem como ser renovada — e o profissional fica sem conseguir preencher a diária. Revogar
dispositivo perdido continua possível porque a sessão vive **no banco**, não num JWT.

As tabelas de auth ficam em `lib/db/schema/auth.ts`, no mesmo banco, permitindo
`production_members.user_id → users.id` com FK real. Elas seguem o contrato da biblioteca, não
as convenções do domínio: sem `production_id`, sem soft delete, sem `version`, sem trigger de
`sync_log`.

---

## 2b. Recuperação de senha sem provedor de e-mail

O fluxo está **completo e testado** de ponta a ponta: pedir link → gerar token → redefinir →
entrar com a nova senha → a senha antiga deixa de funcionar. O que não existe é o **envio**.

`lib/auth/mailer.ts` define a interface e traz uma implementação que registra a mensagem no log
do servidor em vez de enviar. É deliberado que isso seja visível e feio: recuperação que depende
de alguém ler log de servidor não pode parecer um estado normal do produto.

Por que não provisionar um provedor agora (ADR-028): sem domínio próprio, o remetente não é
verificável e a entrega vai para spam — o que é **pior** que não ter, porque aparenta funcionar.
Quando houver domínio, ligar o Resend é escrever um segundo `Mailer` e trocar uma linha; nada
do fluxo muda.

Duas telas assumem essa limitação sem mentir para o usuário: a confirmação diz que o link foi
**gerado** (não "enviado") e orienta a falar com quem administra a produção.

---

## 3. Autenticação × offline

Este é o ponto que a maioria das integrações erra, então fica explícito.

**Regra: sessão expirada nunca apaga dado local e nunca bloqueia edição local.**

```
App abre
   │
   ├── tem sessão válida em cookie? ──► modo ONLINE, sincroniza
   │
   ├── sem rede, mas há identidade em cache? ──► modo OFFLINE AUTENTICADO
   │        edita normalmente; outbox acumula; revalida quando voltar
   │
   └── nenhuma identidade ──► modo LOCAL
            app funciona exatamente como a v1 (sem sala, sem sync)
```

Mecanismos:

1. **Cookie cache**: a Better Auth grava um cookie assinado de curta duração contendo os dados
   da sessão, evitando ida ao banco a cada request. Offline, é ele que sustenta o boot.
2. **Snapshot de identidade no IndexedDB** (`identity`): `userId`, nome, e-mail, produções e
   papéis, atualizado a cada sync bem-sucedido. É o que permite a UI renderizar "você é
   MEMBER/CAMERA nesta produção" sem rede.
   **Esse snapshot é conveniência de UI, jamais autorização.** O servidor revalida tudo.
3. **Sessão longa (30 dias)** para que uma diária inteira sem sinal não expire ninguém.
4. **Falha de auth no sync não é destrutiva**: um `401` no push marca a fila como
   `PENDING` com motivo `AUTH`, exibe "reconecte sua conta" e **mantém as operações
   enfileiradas**. Nada é descartado.
5. **Logout offline** limpa o cookie e o snapshot, mas **preserva** os dados locais e a fila.
   No próximo login do mesmo usuário, a fila retoma. Login de **outro** usuário no mesmo
   dispositivo não pode enxergar a fila anterior — a fila é particionada por `userId`.

---

## 4. Proteção de rotas

Três camadas, da mais fraca para a mais forte:

| Camada                 | O que faz                                                     | Confiável?              |
| ---------------------- | ------------------------------------------------------------- | ----------------------- |
| `middleware.ts`        | Redireciona não-autenticado para `/login` (só olha o cookie)  | ❌ UX apenas            |
| Layout de `app/(app)/` | Server component que resolve a sessão e falha cedo            | ⚠️ parcial              |
| `lib/db/queries/*`     | Recebe `userId` + `productionId` e checa `production_members` | ✅ **fonte de verdade** |

O middleware **não** decide autorização — ele nem consulta o banco (na Vercel isso encareceria
todo request). Ele evita flash de tela privada. A decisão real acontece na camada de query.

```ts
// forma canônica de toda mutação de servidor
const ctx = await requireMember(productionId, { minRole: 'MEMBER' });
// ctx: { userId, memberId, role, department }
```

`requireMember` lança quando não há sessão, quando o usuário não é membro, ou quando o papel é
insuficiente. Toda função de `lib/db/queries/` exige esse contexto como argumento — não há
sobrecarga sem ele. Detalhes da matriz em [permissions.md](permissions.md).

> **Status (Fase 3): implementado sem `middleware.ts`.** O layout de
> [`app/(app)/`](<../../app/(app)/layout.tsx>) chama `requireUser()` — uma vez, para todo o
> grupo de rotas —, e o layout da sala chama `requireMember()`. Middleware entraria só para
> evitar o flash de tela privada, e não há flash: as telas são Server Components, então o
> redirecionamento acontece **antes** de qualquer HTML sair. Uma camada a menos para manter.
>
> As páginas filhas repetem `requireMember` porque precisam do papel para decidir o que
> mostrar. A repetição é barata e proposital: uma `page.tsx` nova nasce protegida mesmo que
> alguém mova o layout de lugar.
>
> `requireMember` também recusa `productionId` fora do formato UUID como "não é membro" — sem
> isso, `/p/qualquer-coisa` viraria erro do Postgres em vez de 404.
>
> Verificado por exercício HTTP contra o build de produção: `/producoes`, `/p/<uuid>`,
> `/p/<uuid>/membros` e `/p/<uuid>/diarias/nova` respondem `307 → /login` sem sessão; com
> sessão de quem não é membro, `/p/<uuid>` responde **404**, não 403.

---

## 5. Variáveis de ambiente

```bash
DATABASE_URL=                 # Neon, pooled — SERVIDOR APENAS, nunca NEXT_PUBLIC_
BETTER_AUTH_SECRET=           # segredo de assinatura (rotacionável)
BETTER_AUTH_URL=              # https://<app>.vercel.app
EMAIL_FROM=
EMAIL_API_KEY=                # provedor transacional
NEXT_PUBLIC_APP_URL=          # único público; usado em links de e-mail no cliente
```

`.env.example` é atualizado na Fase 2, quando essas variáveis passam a ser lidas de fato.
Hoje o app continua não exigindo nenhuma.

---

## 6. Hardening (Fase 10)

- Rate limit em login, cadastro e recuperação (por IP e por e-mail).
- Bloqueio progressivo após tentativas falhas.
- Registro de sessões ativas por dispositivo + revogação individual.
- Rotação de `BETTER_AUTH_SECRET` documentada.
- 2FA opcional para papéis `OWNER`/`ADMIN`.
- Enumeração de conta: respostas idênticas para e-mail existente e inexistente na recuperação.

---

## 7. Verificação antes de implementar

As APIs exatas (nomes de opção, formato do adapter Drizzle, schema das tabelas) **devem ser
conferidas na documentação oficial da versão instalada** no início da Fase 2. Este documento
fixa a **decisão** e as **restrições**; a assinatura da configuração acompanha a versão.
