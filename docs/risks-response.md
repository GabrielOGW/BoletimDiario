# PRÓXIMA ETAPA — RESOLUÇÃO DOS RISCOS E DEFINIÇÕES ARQUITETURAIS

Analise as decisões abaixo como continuação direta da análise técnica já realizada.

Não trate esta mensagem como um novo projeto.

Estas são decisões do proprietário do projeto e devem substituir as mitigações genéricas apresentadas anteriormente quando houver conflito.

O objetivo desta etapa é transformar os riscos levantados em **decisões arquiteturais concretas**, atualizar a documentação e preparar a implementação.

---

# 1. DECISÕES JÁ TOMADAS

## R1 — Migração do LocalStorage

O risco de migração dos dados atuais NÃO é relevante neste momento.

O Boletim de Câmera atual não está em uso com dados reais que precisem ser preservados.

Portanto:

* não precisamos criar uma migração complexa de dados reais de produção;
* não precisamos manter compatibilidade com boletins antigos em produção;
* podemos fazer uma mudança estrutural mais limpa;
* ainda assim, devemos preservar boas práticas de migração de schema para o futuro.

IMPORTANTE:

Não gastar complexidade de arquitetura tentando resolver um problema que atualmente não existe.

Documentar essa decisão em:

`docs/decisions.md`

---

# 2. R2 — OFFLINE-FIRST

Aqui existe uma mudança importante em relação ao prompt anterior.

A aplicação continuará permitindo trabalho offline, porém **não precisamos necessariamente manter a filosofia de "offline-first" como requisito absoluto da nova plataforma colaborativa**.

O requisito real é:

> O profissional deve conseguir continuar trabalhando durante uma diária mesmo que esteja temporariamente sem conexão e os dados devem ser sincronizados posteriormente.

Portanto, o conceito desejado passa a ser:

**OFFLINE CAPABLE + SYNCHRONIZATION**

e não necessariamente:

**OFFLINE-FIRST ABSOLUTO**

A experiência desejada é:

```text
ONLINE
↓
trabalha normalmente
↓
internet cai
↓
continua trabalhando
↓
internet retorna
↓
sincroniza automaticamente
```

O usuário NÃO deve perder trabalho por ficar offline.

Entretanto, não precisamos impor a regra:

> "A UI só pode ler e escrever no banco local."

Reavalie essa arquitetura.

Quero uma solução equilibrada entre:

* simplicidade;
* manutenção;
* confiabilidade;
* experiência offline;
* sincronização;
* custo;
* complexidade do código.

Evitar arquitetura excessivamente sofisticada apenas para cumprir uma definição purista de offline-first.

---

# 3. MODELO DE FUNCIONAMENTO OFFLINE

Defina claramente:

### Quando online

O sistema pode:

* buscar dados do servidor;
* atualizar dados;
* sincronizar;
* receber alterações;
* trabalhar normalmente.

### Quando offline

O sistema deve:

* continuar permitindo criação de dados;
* continuar permitindo edição;
* armazenar alterações localmente;
* manter uma fila de sincronização;
* sincronizar posteriormente.

O usuário deve visualizar claramente:

```text
ONLINE
OFFLINE
SINCRONIZANDO
PENDÊNCIAS
CONFLITO
```

Mas:

**nenhum estado de sincronização deve impedir o preenchimento do boletim.**

---

# 4. R3 — REGRESSÃO DO BOLETIM DE CÂMERA

Não queremos criar uma nova identidade visual.

O Boletim de Câmera atual já possui um design e fluxo que devem ser considerados a referência visual do projeto.

A regra é:

> Tudo que for novo deve seguir o mesmo design system, padrões de interação e linguagem visual do Boletim de Câmera existente.

Isso vale para:

* Boletim de Som;
* Continuidade;
* login;
* salas;
* dashboard;
* sincronização;
* membros;
* configurações;
* equipamentos.

Não quero:

```text
Boletim de Câmera
→ design A

Boletim de Som
→ design B

Continuidade
→ design C
```

Quero:

```text
PLATAFORMA
    ↓
mesmo design system
    ↓
Câmera
Som
Continuidade
Sala
```

Não reescrever a UI existente sem necessidade.

Reutilizar componentes e padrões existentes sempre que possível.

---

# 5. R4 — CONFLITOS DE SINCRONIZAÇÃO

Este é o principal ponto que ainda precisa de definição arquitetural.

Quero que você pense cuidadosamente sobre a melhor estratégia para este produto.

Não quero CRDT.

Não quero uma infraestrutura distribuída excessivamente complexa.

Não quero simplesmente:

```text
última gravação sempre vence
```

porque isso pode causar perda silenciosa de informações.

## Contexto real

Imagine:

```text
Câmera:
Take 12
camera = "A"
lens = "35mm"

Som:
Take 12
soundRoll = "004"
status = "OK"

Continuidade:
Take 12
note = "João entra pela esquerda"
```

Essas alterações não entram em conflito porque são campos/domínios diferentes.

Portanto, a arquitetura deve aproveitar o próprio domínio para reduzir conflitos.

---

# 6. ESTRATÉGIA DE CONFLITO DESEJADA

Projete uma estratégia baseada em:

## Nível 1 — Sem conflito

Se dois usuários alterarem campos diferentes:

```text
Usuário A:
lens = 35mm

Usuário B:
soundRoll = 004
```

fazer merge automaticamente.

Resultado:

```text
lens = 35mm
soundRoll = 004
```

---

## Nível 2 — Mesmo registro, campos diferentes

Exemplo:

```text
Usuário A:
Take 5
ISO = 800

Usuário B:
Take 5
FPS = 24
```

Merge automático.

---

## Nível 3 — Mesmo campo

Exemplo:

```text
Usuário A:
Take 5
lens = 35mm

Usuário B:
Take 5
lens = 50mm
```

Aqui existe conflito real.

NÃO escolher silenciosamente um dos valores.

Preservar ambos:

```text
CONFLITO

Campo:
Lens

Valor atual:
35mm
por Gabriel

Valor recebido:
50mm
por João
```

Permitir:

```text
[Manter 35mm]
[Usar 50mm]
```

Se fizer sentido:

```text
[Editar]
```

---

# 7. CONFLITO NÃO DEVE BLOQUEAR O RESTANTE DA DIÁRIA

Se existir conflito em:

```text
Take 5
Lens
```

isso NÃO deve impedir:

```text
Take 6
Take 7
Take 8
```

nem impedir o departamento de som de continuar trabalhando.

O conflito deve ser tratado como uma pendência isolada.

---

# 8. PROPOSTA DE MODELO DE CONFLITO

Avalie uma estrutura semelhante a:

```text
SyncConflict

id
productionId
entityType
entityId
field
localValue
remoteValue
localUserId
remoteUserId
localUpdatedAt
remoteUpdatedAt
status
resolvedBy
resolvedAt
resolution
```

Onde:

```text
PENDING
RESOLVED
```

são suficientes inicialmente.

Não implementar um sistema genérico excessivamente complexo.

---

# 9. HISTÓRICO

Não precisamos de um histórico completo de cada alteração de cada campo.

O requisito é apenas conseguir responder:

> "Quem alterou isso e quando?"

Portanto, manter:

```text
createdBy
createdAt
updatedBy
updatedAt
```

e um `sync_log` ou mecanismo equivalente quando necessário.

Não criar auditoria completa se ela não tiver utilidade prática.

---

# 10. R5 — FOTOGRAFIAS

DECISÃO DEFINITIVA:

**Não haverá fotos nesta versão.**

Remover fotos de:

* requisitos;
* modelagem;
* armazenamento;
* sincronização;
* UX;
* gerenciamento de storage.

Não criar infraestrutura de upload de imagens neste momento.

A arquitetura pode ser extensível futuramente, mas não implementar nada agora.

O objetivo é manter o aplicativo:

* leve;
* rápido;
* simples;
* econômico.

---

# 11. R6 — COMPLEXIDADE E MANUTENÇÃO

Existe interesse em utilizar **subagentes e/ou skills especializadas** para reduzir a complexidade e manter cada parte do projeto com foco bem definido.

Quero que você avalie criticamente essa abordagem.

Não assuma que "mais agentes = melhor".

Analise:

### Opção A

Um único agente responsável por tudo.

### Opção B

Agente principal + skills especializadas.

### Opção C

Agente principal + subagentes especializados.

### Opção D

Agentes independentes por domínio.

Exemplo:

```text
Architect
Database
Authentication
Sync
Camera
Sound
Continuity
PWA
Testing
Documentation
UX
```

---

# 12. MINHA PREFERÊNCIA

Minha preferência inicial é:

```text
AGENTE PRINCIPAL
       │
       ├── Architecture Skill
       ├── Database Skill
       ├── Auth Skill
       ├── Sync Skill
       ├── Camera Skill
       ├── Sound Skill
       ├── Continuity Skill
       ├── Testing Skill
       └── Documentation Skill
```

Mas não quero assumir que isso seja necessariamente a melhor arquitetura.

Avalie.

O principal objetivo é:

> Cada parte do sistema deve ter uma responsabilidade clara, contexto limitado e regras explícitas, reduzindo alterações acidentais em outras partes do projeto.

---

# 13. REGRAS PARA AGENTES/SKILLS

Se você concluir que a abordagem é válida:

Cada skill/agente deve possuir:

* responsabilidade;
* escopo;
* arquivos que pode alterar;
* arquivos que não deve alterar;
* pré-condições;
* testes obrigatórios;
* documentação que deve atualizar;
* critérios de conclusão.

Exemplo:

```text
Sync Skill

Responsável por:
- sync queue
- sincronização
- conflitos
- retry
- estados de sync

Pode alterar:
src/lib/sync/**
src/lib/offline/**

Não deve alterar:
features/camera/**
features/sound/**
features/continuity/**

Deve atualizar:
docs/architecture/synchronization.md

Deve executar:
unit tests
integration tests
```

O mesmo princípio deve ser aplicado aos outros domínios.

---

# 14. AGENTE PRINCIPAL

Mesmo utilizando skills/subagentes, deve existir uma autoridade arquitetural.

O agente principal deve ser responsável por:

* arquitetura;
* decisões entre módulos;
* integração;
* revisão das alterações;
* consistência do banco;
* segurança;
* contratos entre módulos;
* aprovação final.

Um agente especializado NÃO deve modificar arquitetura global por conta própria.

---

# 15. EVITAR AGENTES CONCORRENTES NO MESMO CÓDIGO

Não quero vários agentes editando simultaneamente os mesmos arquivos.

Se houver dependências:

```text
Database
↓
Sync
↓
Camera
```

executar nessa ordem.

A arquitetura deve possuir uma sequência de implementação clara.

---

# 16. R7 — UX

Confirmo a seguinte prioridade:

> A aplicação precisa ser extremamente ágil e leve durante uma diária.

Não adicionar complexidade apenas porque tecnicamente é possível.

Especialmente:

* sem fotos;
* sem formulários excessivos;
* sem modais desnecessários;
* sem salvar manualmente;
* sem espera por sincronização;
* sem telas pesadas;
* sem animações desnecessárias.

Priorizar:

```text
poucos toques
feedback imediato
dados persistentes
incremento automático
herança automática
interface previsível
```

O design atual do Boletim de Câmera continua sendo a referência.

---

# 17. R8 — VERCEL / NEON

Pesquisar e validar a arquitetura mais simples e econômica para:

* Vercel;
* Neon;
* Next.js;
* PostgreSQL;
* sincronização;
* realtime/polling.

Não implementar SSE permanente se isso aumentar desnecessariamente a complexidade ou custo.

Avaliar:

```text
Polling inteligente
```

como alternativa inicial.

Por exemplo:

```text
produção aberta
↓
polling periódico
↓
detectar alterações
↓
atualizar
```

Avaliar também atualização manual/foreground quando necessário.

O objetivo é colaboração suficientemente rápida, não realtime de baixa latência.

Se polling for suficiente para o uso real de uma diária, prefira polling.

---

# 18. R9 — TIMEZONE

Adotar explicitamente:

### Diária

```text
DATE
```

Representa um dia civil.

### Timestamps

```text
TIMESTAMPTZ
```

Representam instantes reais.

Documentar claramente:

```text
ShootingDay.date
```

não é timestamp.

Não converter a data da diária automaticamente para UTC.

Criar testes relacionados a timezone.

---

# 19. R10 — IDENTIFICADORES

Revisar a estratégia de IDs.

Requisitos:

* funcionar offline;
* funcionar online;
* não depender exclusivamente de servidor;
* baixa probabilidade de colisão;
* compatível com PostgreSQL.

Preferência:

UUID v4 gerado no cliente.

Se houver fallback:

usar `crypto.getRandomValues()`.

Não utilizar fallback baseado apenas em:

```text
Date.now()
```

ou combinações frágeis.

Validar IDs no servidor.

---

# 20. R11 — SERVICE WORKER

Melhorar a estratégia de atualização do PWA.

O usuário não pode ficar preso indefinidamente em uma versão antiga.

Implementar:

* versionamento automático;
* estratégia de atualização;
* aviso de nova versão;
* ação "Atualizar agora";
* não cachear APIs de maneira perigosa;
* garantir que uma versão antiga não continue executando uma lógica de sync incompatível.

Avaliar cuidadosamente a ordem:

```text
App Version
↓
DB Schema Version
↓
Sync Protocol Version
```

Caso necessário, criar versionamento do protocolo de sincronização.

---

# 21. R12 — DOCUMENTAÇÃO

Manter:

```text
Código
+
Testes
+
Documentação
```

sempre sincronizados.

A fonte de verdade do banco deve ser:

```text
Drizzle migrations
```

O schema documentado é explicativo, não a fonte executável.

Toda decisão arquitetural relevante deve entrar em:

```text
docs/decisions.md
```

Não apagar decisões antigas.

Quando uma decisão mudar:

```text
DECISION-XXX
Status: Superseded
```

e registrar a nova decisão.

---

# 22. RISCOS ACEITOS

Os seguintes riscos podem permanecer:

### Metadados duplicados de cena

Aceito quando for informação descritiva e não uma unidade de gravação.

### Listas ordenadas

Não precisamos de merge sofisticado.

Última alteração com aviso/conflito quando necessário é suficiente.

### Histórico detalhado

Não precisamos de histórico completo "de → para" de todos os campos.

### Dexie

Aceito como dependência para armazenamento local, se a análise confirmar que continua sendo a melhor escolha.

### Departamentos futuros

Não implementar UI agora.

### PDF

Continuar utilizando impressão nativa se já estiver funcionando bem.

---

# 23. NOVA MATRIZ DE RISCO

Depois de incorporar todas as decisões acima, refaça a matriz de riscos.

Para cada risco:

```text
Risco
Impacto
Probabilidade
Decisão
Mitigação
Status
```

Status possíveis:

```text
MITIGATED
ACCEPTED
DEFERRED
NEEDS_DECISION
```

Não mantenha riscos que deixaram de existir.

---

# 24. ARQUITETURA DE SINCRONIZAÇÃO QUE QUERO AVALIAR

Antes de implementar, compare pelo menos estas duas opções:

## Opção A — Server-oriented

```text
UI
↓
Server
↓
Postgres

offline:
local queue
↓
sync posteriormente
```

## Opção B — Local cache + sync

```text
UI
↓
Local DB
↓
Sync Layer
↓
Server
↓
Postgres
```

Compare:

* complexidade;
* UX;
* confiabilidade;
* offline;
* conflitos;
* manutenção;
* custo;
* implementação no Next.js;
* impacto no PWA.

Escolha uma.

Não implemente ambas.

---

# 25. DEFINIÇÃO DE "ONLINE"

Não confiar apenas em:

```text
navigator.onLine
```

Ele pode indicar conexão de rede sem que o servidor esteja realmente acessível.

Considerar:

```text
NETWORK
SERVER_REACHABLE
SYNC_STATUS
```

se isso puder ser feito sem complexidade excessiva.

Exemplo:

```text
Online + sincronizado
Online + pendências
Online + erro
Offline + pendências locais
```

---

# 26. REGRAS DE SINCRONIZAÇÃO

Definir formalmente:

### CREATE

Registro criado localmente:

```text
local create
↓
queue
↓
server create
↓
ack
↓
synced
```

### UPDATE

```text
local update
↓
queue delta
↓
server compare version
↓
merge ou conflict
```

### DELETE

Nunca excluir silenciosamente um registro que ainda possa estar pendente de sincronização.

Avaliar soft delete/tombstone para entidades sincronizáveis.

---

# 27. CONFLITO DE DELETE

Não esquecer este caso.

Exemplo:

```text
Usuário A:
edita Take 5

Usuário B:
remove Take 5
```

Definir explicitamente o comportamento.

Preferência:

não apagar silenciosamente alterações que ainda não foram sincronizadas.

Se necessário:

```text
DELETED
```

pode ser tratado como estado sincronizável até que todos os dispositivos relevantes tenham recebido a alteração.

Não implementar garbage collection agressivo na primeira versão.

---

# 28. CRITÉRIO PARA ACEITAR A ARQUITETURA

Antes de começar a implementação, quero receber um documento contendo:

## A. Decisões finais

O que foi decidido.

## B. Decisões rejeitadas

O que foi considerado e descartado.

## C. Arquitetura

Diagrama textual completo.

## D. Banco

Entidades e relações.

## E. Sync

Fluxo completo.

## F. Conflitos

Exemplos reais e resolução.

## G. Offline

Comportamento online/offline.

## H. Skills/Subagentes

Estrutura proposta e responsabilidades.

## I. Roadmap

Ordem exata de implementação.

## J. Riscos

Nova matriz de risco.

---

# 29. NÃO IMPLEMENTAR AINDA

Nesta etapa:

**não comece a implementar as funcionalidades novas imediatamente.**

Primeiro:

1. incorporar minhas decisões;
2. resolver o desenho de conflitos;
3. avaliar server-oriented vs local-cache+sync;
4. avaliar skills/subagentes;
5. atualizar arquitetura;
6. atualizar documentação;
7. apresentar o plano final.

Somente depois de essa arquitetura ser aprovada devemos começar a implementação.

---

# 30. OBJETIVO FINAL

Quero uma plataforma que tenha a seguinte característica:

```text
SIMPLES PARA QUEM ESTÁ NO SET
+
ROBUSTA POR BAIXO
```

Para o usuário:

```text
abrir
↓
entrar na sala
↓
registrar
↓
continuar trabalhando
```

Por baixo:

```text
Auth
Database
Sync
Conflict Detection
Offline Storage
Permissions
Audit
PWA
```

A complexidade deve existir na arquitetura, não na experiência do profissional.

Essa deve ser a regra central para todas as decisões futuras.
