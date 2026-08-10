---
name: modulo
description: Construção e evolução dos módulos de departamento do Boletim Audiovisual — Câmera, Som e Continuidade — e das telas de diária. Use ao mexer em features/camera, features/sound, features/continuity ou app/(app)/p/[id]/diaria/, e para dúvidas sobre design system, UX de set, herança entre takes ou paridade com o boletim atual.
---

# Skill: modulo

## Responsabilidade

Os três módulos de departamento e as telas de diária. São **um único formato** repetido três
vezes: mesma superfície local, mesmo `Take` compartilhado, mesmo design system. Por isso uma
skill, e não três.

## Escopo

**Pode alterar:** `features/{camera,sound,continuity}/**` · `app/(app)/p/[productionId]/diaria/**` ·
`components/**` (quando um componente existente precisa de uma variante, não de um substituto)

**Não deve alterar:** `lib/sync/**` · `lib/offline/db.ts` · `lib/db/**` · `domain/platform/**` ·
`app/(public)/**` · `features/production/**`

## Pré-condições

- Camada local e sync funcionando para as entidades do módulo (skill `sync` concluída).
- Entidades presentes em `domain/platform/types.ts`.

## A regra número um

> **O Boletim de Câmera é a referência visual e de interação da plataforma inteira.**

Som, Continuidade e qualquer tela nova herdam componentes, padrões e linguagem visual do que já
existe — ADR-024, **sem exceção**. Onde o formato do dado pedir outra tela (tracks de som, por
exemplo), adapta-se a apresentação do dado ao padrão, não o contrário.

Antes de criar componente: **procure o equivalente em `components/`**. Um design system com
dialetos deixa de ser um design system.

## UX de set — critérios de aceite, não recomendações

- **Sem botão salvar** em lugar nenhum. O contrato do `useBoletim` (auto-save com debounce de
  500 ms, flush no unmount) é o padrão.
- **Nenhuma escrita espera rede.** Escrita local imediata, sempre. Indicador de sync informa,
  nunca bloqueia — não existe spinner que impeça digitar.
- **Status por um toque**, sem modal e sem confirmação.
- **Teto de toques por take** é critério de conclusão do módulo. Conte-os.
- Confirmação só para operação destrutiva irreversível (excluir cena/setup com takes).
- Mobile-first, dark, alvos ≥ 44 px, `aria-*` nos controles interativos.
- Sem tela pesada, sem formulário excessivo, sem animação desnecessária.
- **Não há fotografias** (ADR-022).

## Regras de domínio, não de UI

Herança entre takes, incremento automático de número e nome de arquivo, e reset de take na troca
de setup vivem em [`domain/platform/factory.ts`](../../../domain/platform/factory.ts), com teste,
e valem para os três módulos. **Não reimplemente em handler de componente.**

Técnica e óptica ficam no `Take` (ADR-011), mas a UI **continua parecendo igual**: o valor é
herdado do take anterior e só é editado quando muda.

`aprovado` mapeia para `CIRCLE` **e** é preservado em `camera_take_data.approved` (ADR-010) — o
toggle verde "Aprovado pelo diretor" continua existindo como está.

## Acesso a dados

Dentro da fronteira, o módulo conhece **apenas** `lib/offline/repos/*`. **Nenhum `fetch`.**
Reatividade por `useLiveQuery`.

## Testes obrigatórios

- Paridade campo a campo com o editor atual, quando o módulo for Câmera
  ([`docs/features/camera.md §1`](../../../docs/features/camera.md#1-o-que-existe-hoje)).
- Herança e incremento entre takes (nível de domínio, já coberto por `npm run test:platform`).
- Uma diária completa preenchida offline, do zero ao PDF.
- PDF comparado lado a lado com a saída atual, na mesma diária.

## Documentação a atualizar

`docs/features/{camera,sound,continuity}.md` — **no mesmo commit**.

## Critério de conclusão

Um usuário faz uma diária inteira no módulo sem sentir falta de nada, sem esperar rede em
nenhum momento, e o relatório impresso sai igual ou melhor que o atual.

## Escalar para o agente principal

Necessidade de campo novo no modelo compartilhado, de componente que quebre o design system, ou
de qualquer dado que só exista no servidor durante a diária.
