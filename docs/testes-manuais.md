# Testes manuais pendentes

O que **não** dá para verificar daqui, e por quê. Três motivos aparecem: exige sessão com
senha, exige IndexedDB real, ou exige olhar para papel impresso.

Cada item traz o passo a passo e **o que observar** — a intenção é que a checagem seja
mecânica, não interpretativa. Marque `[x]` quando passar; anote embaixo quando falhar.

> Estes testes viram Playwright na [Fase 10](roadmap.md#-fase-10--hardening). Até lá, a
> lista mora aqui para que "não foi testado" seja uma frase escrita, e não um esquecimento.

---

## 1. Fase 5 — o boletim impresso

### 1.1 Comparação lado a lado do PDF

O critério de conclusão da Fase 5 é literal: **o boletim impresso sai igual ou melhor**.

1. Abra um boletim com conteúdo em `/legado` (ou use o boletim demo) e exporte o PDF pelo
   botão "Imprimir / PDF".
2. Recrie a **mesma** diária na plataforma: `/p/[id]/diarias/[dia]/camera`, com as mesmas
   cenas, blocos, planos, takes, cartões e aprovações.
3. Toque em "Ver boletim para impressão" e exporte o PDF.
4. Coloque os dois lado a lado.

Observar:

- [ ] Cabeçalho: projeto, produtora, data, diária, direção e fotografia nos mesmos lugares
- [ ] Resumo com os mesmos seis números
- [ ] Ordem das cenas **numérica** (cena 3 antes da 24, e a 105 depois das duas)
- [ ] Planos consecutivos com a mesma técnica agrupados em uma linha só
- [ ] Take aprovado com faixa verde, barra à esquerda e selo "✓ Aprovado"
- [ ] Nenhum plano quebrado no meio entre duas páginas
- [ ] Cabeçalho da tabela repetido quando a tabela atravessa a página
- [ ] Margem A4 de 13 mm, sem corte na borda direita
- [ ] Nada da casca do aplicativo no papel: sem cabeçalho fixo, sem botões

### 1.2 Diária inteira offline, do zero ao PDF

Este é o teste que resume a fronteira offline inteira.

1. `npm run build && npm run start` — o Service Worker **só** registra em produção.
2. Entre, abra a diária com rede uma vez (é a fixação) e feche o app.
3. **Modo avião.**
4. Reabra o app pelo ícone e vá até a diária.
5. Crie cena, bloco, plano e três takes. Preencha cartão, clip/sync e nota. Aprove um.
6. Toque em "Ver boletim para impressão" e exporte o PDF.

Observar:

- [ ] A diária abre sem rede e mostra o que já estava lá
- [ ] Nenhuma escrita espera nada: o campo aceita texto na hora
- [ ] O indicador de sync mostra pendências **sem** bloquear a edição
- [ ] A folha abre e o PDF sai completo, sem rede
- [ ] De volta à rede, as pendências sobem sozinhas e o contador zera

### 1.3 O toggle verde não regrediu

- [ ] Aprovar um take custa **um** toque, sem modal e sem confirmação
- [ ] O botão continua verde, largo e com a mesma frase ("Aprovado pelo diretor")
- [ ] Desaprovar custa um toque também

---

## 2. Fase 4 — sync com IndexedDB real

Os dois testes que a suíte `.mjs` não alcança porque não há IndexedDB no Node.

### 2.1 Fechar o PWA e reabrir

1. Com o app em modo avião, edite alguns campos da diária.
2. **Feche o app por inteiro** (não só a aba — encerre o aplicativo).
3. Reabra.

- [ ] Tudo que foi digitado continua lá
- [ ] A fila de pendências continua com os mesmos itens (nada foi perdido nem duplicado)
- [ ] Voltando à rede, sobe tudo e não cria registro repetido

### 2.2 Duas abas ao mesmo tempo

1. Abra a mesma diária em duas abas.
2. Edite um campo na aba A.

- [ ] A aba B reflete a mudança sozinha, sem recarregar (`liveQuery` entre abas)
- [ ] Criar um take na aba A aparece na B com o mesmo número, não com dois

### 2.3 Conflito de verdade, entre dois aparelhos

1. Dois aparelhos (ou dois navegadores com contas diferentes, ambos membros) na mesma diária.
2. Ambos em modo avião. Cada um edita **o mesmo campo** do mesmo take, com valores diferentes.
3. Volte os dois à rede, um de cada vez.

- [ ] O primeiro sobe sem conflito
- [ ] O segundo recebe conflito **daquele campo**, e só dele
- [ ] O valor local converge para o do servidor e o valor do usuário vira pendência visível
- [ ] Resolver em um toque funciona nas duas direções ("meu" e "do servidor")
- [ ] Editar **outro** campo do mesmo take continua funcionando durante o conflito

---

## 3. Fase 3 — sala e permissões

O que a suíte cobre é a regra; o que falta é o caminho pela tela, com duas contas.

1. Conta A cria a produção; conta B entra pelo código.

- [ ] B chega com o papel e o departamento corretos
- [ ] B **não** consegue rodar as ações de ADMIN (o servidor recusa, não só a UI esconde)
- [ ] Uma conta que não é membro recebe **404** em `/p/[id]`, nunca 403
- [ ] Sem sessão, toda rota privada leva para `/login`
- [ ] O OWNER não consegue sair sem transferir a posse

---

## 4. PWA e atualização

- [ ] Instalar pelo ícone funciona e o app abre em `standalone`
- [ ] Publicar uma versão nova mostra o **aviso** de atualização, e a tela **não** recarrega
      sozinha no meio de uma diária
- [ ] Aceitar o aviso troca de versão e mantém o que estava no banco local
- [ ] Um boletim local antigo (`bdc:boletins:v1`) continua abrindo depois da atualização

---

## Falhas encontradas

Anote aqui o que não passou, com o passo em que quebrou. Nada registrado até agora.
