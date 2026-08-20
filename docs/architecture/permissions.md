# Permissões

Dois eixos **independentes** (§5). Misturá-los é o erro clássico deste tipo de produto — um
diretor de fotografia pode ser `VIEWER` numa produção e `OWNER` em outra, e continua sendo
`CAMERA` nas duas.

```
role       → o que você PODE FAZER na sala        (OWNER · ADMIN · MEMBER · VIEWER)
department → sobre QUAIS DADOS você trabalha      (CAMERA · SOUND · CONTINUITY · …)
```

São duas colunas separadas em `production_members`, nunca combinadas em um campo só.
Combinações válidas incluem `MEMBER/CAMERA`, `ADMIN/CONTINUITY`, `VIEWER/DIRECTION`,
`OWNER/PRODUCTION`.

---

## 1. Papéis na sala

| Papel    | Descrição                                                       |
| -------- | --------------------------------------------------------------- |
| `OWNER`  | Criou a produção. Único que pode excluí-la e transferir posse   |
| `ADMIN`  | Gerencia sala, membros, código de convite e diárias             |
| `MEMBER` | Trabalha: cria cenas/setups/takes e escreve no seu departamento |
| `VIEWER` | Só leitura. Direção, produção, cliente, pós                     |

### Matriz

| Ação                                   | OWNER | ADMIN | MEMBER | VIEWER |
| -------------------------------------- | :---: | :---: | :----: | :----: |
| Ver produção e todos os boletins       |  ✅   |  ✅   |   ✅   |   ✅   |
| Exportar relatórios                    |  ✅   |  ✅   |   ✅   |   ✅   |
| Criar/editar cena, setup, take         |  ✅   |  ✅   |   ✅   |   ❌   |
| Escrever dados do **próprio** dept.    |  ✅   |  ✅   |   ✅   |   ❌   |
| Escrever dados de **outro** dept.      |  ✅   |  ✅   |   ❌   |   ❌   |
| Criar/editar diária                    |  ✅   |  ✅   |   ❌   |   ❌   |
| Gerenciar equipamentos                 |  ✅   |  ✅   |   ✅   |   ❌   |
| Convidar / remover membro              |  ✅   |  ✅   |   ❌   |   ❌   |
| Alterar papel de membro                |  ✅   |  ✅¹  |   ❌   |   ❌   |
| Rotacionar/desativar código de convite |  ✅   |  ✅   |   ❌   |   ❌   |
| Excluir produção                       |  ✅   |  ❌   |   ❌   |   ❌   |
| Transferir posse                       |  ✅   |  ❌   |   ❌   |   ❌   |
| Sair da produção                       |  ❌²  |  ✅   |   ✅   |   ✅   |

¹ `ADMIN` não pode promover ninguém a `OWNER` nem alterar o `OWNER`.
² O `OWNER` precisa transferir a posse antes de sair — uma produção nunca fica sem dono.

---

## 2. Departamentos

Ativos agora: `CAMERA`, `SOUND`, `CONTINUITY`.
Já previstos no enum, sem UI: `DIRECTION`, `PRODUCTION`, `DIT`, `LIGHTING`, `ART`,
`WARDROBE`, `MAKEUP`, `EDITORIAL`.

### Regra de escrita por departamento

```
Dados COMPARTILHADOS  (scenes, setups, takes, equipment, photos)
    → qualquer MEMBER+ escreve, independentemente do departamento

Dados de DEPARTAMENTO (camera_take_data, sound_take_data, sound_take_tracks,
                       continuity_*)
    → escreve quem é do departamento correspondente (ou ADMIN/OWNER)
    → LÊ todo mundo, sempre
```

A leitura ser sempre irrestrita **é o produto** (§14, §34): a razão de existir da plataforma é
a continuísta ver a lente que a câmera usou e o som ver o take que a câmera acabou de criar.
Restringir leitura por departamento destruiria o valor central.

Mapeamento departamento → tabelas graváveis:

| Departamento | Escreve em                                                                                                             |
| ------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `CAMERA`     | `camera_take_data`, `camera_units`                                                                                     |
| `SOUND`      | `sound_take_data`, `sound_take_tracks`, `sound_day_config`                                                             |
| `CONTINUITY` | `continuity_take_data`, `continuity_props`, `continuity_wardrobe`, `continuity_hair_makeup`, `continuity_set_dressing` |
| qualquer     | `scenes`, `setups`, `takes`, `equipment`, `equipment_assignments`, `photos`                                            |

Um membro pode ter departamentos adicionais em `production_member_departments`; a checagem
considera o conjunto.

### Departamento sem módulo

Dos onze departamentos, três têm módulo. Quem não tem nenhum departamento ativo — Direção,
Produção, Elétrica, cliente — entra na sala **para gestão**: cria diária, administra equipe,
lê tudo. A tela de anotação é somente leitura para ele, com o motivo dito na tela
([ADR-031](../decisions.md#adr-031--departamento-sem-módulo-entra-para-gestão-não-para-anotação)).

Vale para qualquer papel, `OWNER` inclusive: quem precisa mexer em dado de câmera acrescenta
`CAMERA` aos próprios departamentos, o que é explícito e visível — não herda o direito por ser
dono da produção.

---

## 3. Aplicação

**Toda decisão de autorização acontece no servidor.** O cliente também aplica as mesmas regras
— mas só para não mostrar botão que não funciona. Nunca como controle.

```ts
// lib/auth/guards.ts
requireMember(productionId, { minRole }); // sessão + pertencimento + papel
requireDepartment(productionId, department); // + permissão de escrita no dept.
```

### Onde mora cada regra (Fase 3)

O guarda responde **"este papel é alto o suficiente?"**. Isso não cobre as regras
_relacionais_ desta página — as que dependem do papel de **quem sofre a ação**:

| Regra                                       | Onde vive                         |
| ------------------------------------------- | --------------------------------- |
| Papel mínimo para a operação                | `requireMember(..., { minRole })` |
| `ADMIN` não altera nem remove o `OWNER` (¹) | `lib/db/queries/members.ts`       |
| `ADMIN` não remove outro `ADMIN`            | `lib/db/queries/members.ts`       |
| Promover a `OWNER` só por transferência     | `lib/db/queries/members.ts`       |
| `OWNER` não sai sem transferir (²)          | `lib/db/queries/members.ts`       |

Elas ficam **junto da escrita**, e não na tela, por um motivo prático: a mesma regra vale para
a Server Action de hoje e para a rota de sync de amanhã. Devolvem
`{ status: 'FORBIDDEN', reason }` em vez de lançar, porque não são erro de programação — são
resposta legítima que a interface precisa mostrar. Cobertas por `npm run test:sala`.

Ordem obrigatória em toda rota/action de escrita:

```
1. sessão válida?                    → 401
2. é membro desta produção?          → 404  (não 403: não vazar existência)
3. papel suficiente?                 → 403
4. departamento permite este dado?   → 403
5. payload válido (Zod)?             → 422
6. versão bate? (conflito)           → 409  → synchronization.md
```

Detalhes de **por que 404 e não 403** no passo 2: responder 403 confirmaria que a produção
existe para quem só tem o id. Produção é identificada por UUID, mas o `joinCode` é curto e
adivinhável — a resposta precisa ser indistinguível de "não existe".

O passo 4 é o que a fila de sincronização precisa respeitar também: uma operação enfileirada
offline por alguém que perdeu a permissão nesse meio-tempo é rejeitada com `403` e marcada
como `FAILED` com motivo explícito, **sem** descartar o conteúdo (o usuário pode exportá-lo).

---

## 4. Entrada na sala

```
ADMIN gera/consulta o código   →  FILMEX-8K2P
                                       ↓
usuário autenticado insere o código
                                       ↓
   join_enabled? código existe? já é membro?
                                       ↓
   cria production_members(role='MEMBER', department=<escolhido no ato>)
```

- O código identifica a **produção**, nunca concede papel elevado — quem entra por código
  entra como `MEMBER`.
- O departamento é escolhido por quem entra e pode ser corrigido depois por um `ADMIN`.
- Código rotacionável (`join_code` novo invalida o anterior) e desativável
  (`join_enabled = false`) sem trocar o código.
- **Rate limit no resgate: 10 tentativas por hora, por usuário** (`lib/auth/limite.ts`,
  Fase 10). O código é curto de propósito — ele é ditado por rádio e digitado com luva —,
  e curto significa adivinhável: quatro caracteres sobre um alfabeto de 32, com o prefixo
  saindo do nome da produção, que quem quer entrar geralmente conhece. Sem limite, o
  espaço inteiro cabe numa tarde.

  Por **usuário** e não por IP: a ação exige sessão, então ganhar paralelismo custa muitas
  contas — e criar conta já é limitado pela Better Auth. Por IP puniria a equipe inteira
  atrás do roteador da base, que é o caso normal e não o suspeito. O contador fica na
  tabela `rate_limits`, a mesma da Better Auth, porque em memória ele valeria por
  instância ([ADR-038](../decisions.md#adr-038--o-limite-de-tentativas-mora-no-banco-rls-fica-de-fora-e-a-sessão-longa-se-paga-com-revogação)).

  O limite é cobrado **depois** da validação de formato: código malformado não é tentativa
  de adivinhar, e gastar a cota de quem errou o hífen seria punir o engano.

- Convite direto por e-mail (com papel e departamento predefinidos) continua para depois —
  depende de haver envio de e-mail ([ADR-028](../decisions.md#adr-028--recuperação-de-senha-sem-provedor-de-e-mail)).

---

## 5. Auditoria

Todo registro carrega `createdBy`/`updatedBy` (§21), o que responde "quem alterou isso?" sem
tabela extra. Um histórico completo (valor anterior por campo) **não** entra na v1: dobraria a
escrita e a complexidade de sync para um caso de uso ainda não pedido. O `sync_log` já guarda
a sequência de operações por entidade, o que dá a trilha "o que mudou e quando" — o
"de → para" por campo é evolução natural em cima dele quando for necessário.
