# 🎬 Boletim Diário de Câmera

PWA **offline-first** para criar, editar e exportar **boletins diários de câmera** em set audiovisual.
Feito para uso real em campo: funciona **100% sem internet** (modo avião, Teradek, locação remota), salva tudo **localmente** e é **instalável** como app no celular.

> Sem login. Sem senha. Sem backend. Sem banco de dados. Sem APIs externas.
> Toda a persistência acontece no **LocalStorage** do próprio dispositivo.

---

## ✨ Funcionalidades

- **CRUD completo** de boletins: criar, editar, **duplicar**, excluir
- **Busca** simples por título, produtora, diretor, data ou cena
- **Auto-save** (salva sozinho enquanto você digita) + indicador "Salvando… / Salvo"
- **Módulo de Cenas** dinâmico — cada cena é um **card accordion** com:
  - Configurações técnicas (formato, resolução, frame rate, ISO, obturador, WB, LUT, espaço de cor, diafragma)
  - Óptica (lentes, filtros, **Matte Box** Sim/Não)
  - Mídia (cartão/rolo) e observações
  - **Takes dinâmicos** com **toggle "Aprovado pelo diretor"** → destaque verde, fácil de localizar, múltiplos aprovados
- Blocos de **Mídia/Suporte**, **Cenas do Dia**, **Horários**, **Equipe de Câmera** (lista dinâmica) e **Observações Gerais**
- **Exportar PDF / Imprimir** (layout A4 profissional, takes aprovados destacados)
- **Backup**: **Exportar JSON** e **Importar JSON** (restaure ao limpar o navegador ou trocar de aparelho)
- **PWA instalável** com Service Worker, manifest, ícones e funcionamento offline completo
- **Boletim demo** semeado no primeiro acesso (com os dados de exemplo da especificação)

---

## 🧱 Stack

- **Next.js 15** (App Router) · **React 19** · **TypeScript** (strict, sem `any`)
- **Tailwind CSS** (dark mode profissional, mobile-first)
- **ESLint** + **Prettier**
- **PWA** com Service Worker próprio (sem dependências de runtime)
- **Zero dependências de runtime** além de `next`/`react` — ícones SVG inline, PDF via impressão nativa, IDs via `crypto.randomUUID`

---

## 📁 Estrutura de pastas

```
boletim-diario-de-camera/
├── app/
│   ├── page.tsx                 # 1. Lista de boletins
│   ├── novo/page.tsx            # 2. Criar (cria e redireciona p/ o editor)
│   ├── editar/page.tsx          # 3. Editar boletim   (/editar?id=...)
│   ├── visualizar/page.tsx      # 4. Visualizar / PDF  (/visualizar?id=...)
│   ├── offline/page.tsx         # Fallback offline do Service Worker
│   ├── layout.tsx               # Metadata, PWA, bootstrap
│   └── globals.css              # Tema escuro + estilos de impressão A4
├── components/
│   ├── ui/                      # Button, IconButton, TextField, TextAreaField,
│   │                            #   Toggle, Badge, SearchInput, ConfirmDialog, EmptyState, icons
│   ├── layout/                  # AppHeader, PageContainer, SectionCard,
│   │                            #   StickyActionBar, SaveStateBadge
│   ├── pwa/                     # ServiceWorkerRegister, InstallPrompt, OfflineBadge
│   └── AppBootstrap.tsx         # Semeia o boletim demo no 1º acesso
├── features/
│   ├── boletins/
│   │   ├── BoletimListView.tsx  # Tela de lista
│   │   ├── BoletimCard.tsx      # Item da lista
│   │   ├── BoletimEditor.tsx    # Orquestra o formulário + auto-save
│   │   ├── BoletimView.tsx      # "Folha" A4 para impressão/PDF
│   │   └── sections/            # Produção, Câmera, Cenas, CenaCard, TakeRow,
│   │                            #   Mídia, CenasDoDia, Horários, Equipe, ObservaçõesGerais
│   └── backup/BackupControls.tsx
├── hooks/                       # useBoletim (auto-save), useBoletins, useInstallPrompt,
│                                #   useOnlineStatus, useMounted
├── lib/                         # storage, factory, normalize, seed, backup, constants
├── types/boletim.ts             # Modelo de domínio (tipagem forte)
├── utils/                       # cn, id, date, boletim-stats
├── public/
│   ├── manifest.webmanifest     # Manifesto do PWA
│   ├── sw.js                    # Service Worker (precache + offline)
│   └── icons/                   # icon.svg + PNGs gerados (192, 512, maskable, apple)
├── scripts/generate-icons.mjs   # Gera os PNGs do PWA (sem dependências)
├── next.config.mjs · tailwind.config.ts · postcss.config.mjs
├── tsconfig.json · .eslintrc.json · .prettierrc · .prettierignore
├── .gitignore · .env.example
└── package.json
```

---

## 🚀 Setup e como rodar

Pré-requisito: **Node.js 18.18+** (recomendado 20+).

```bash
# 1. Instalar dependências
npm install

# 2. Rodar em desenvolvimento
npm run dev        # http://localhost:3000

# 3. Build de produção
npm run build

# 4. Servir o build de produção (necessário para testar o PWA/offline)
npm run start      # http://localhost:3000
```

Outros scripts:

```bash
npm run lint          # ESLint
npm run format        # Prettier (--write)
npm run format:check  # Prettier (--check)
npm run icons         # Regenera os ícones PNG do PWA
```

> **Dica de teste offline:** o Service Worker é registrado **apenas em produção** (para não atrapalhar o hot-reload do `dev`).
> Para validar o offline localmente: `npm run build && npm run start`, abra o app, depois ative o **modo avião** e recarregue.

---

## 💾 Persistência & offline

- Todos os boletins ficam no **LocalStorage** (chave `bdc:boletins:v1`).
- Não há servidor: abrir, editar e exportar funciona **sem rede**.
- O **Service Worker** (`public/sw.js`) faz precache do app shell e cacheia os assets em runtime, garantindo carregamento offline após o primeiro acesso online.
- Os dados são por **dispositivo + navegador**. Para mover entre aparelhos, use o **backup JSON** (abaixo).

---

## 📲 Como instalar o PWA

**Android (Chrome/Edge):**
1. Abra o app no navegador.
2. Toque no banner **"Instalar como app"** (ou menu ⋮ → **Instalar aplicativo / Adicionar à tela inicial**).
3. O app abre em tela cheia, com ícone próprio, e funciona offline.

**iPhone/iPad (Safari):**
1. Abra o app no Safari.
2. Toque em **Compartilhar** (ícone de caixa com seta).
3. Selecione **Adicionar à Tela de Início**.

**Desktop (Chrome/Edge):**
1. Clique no ícone de **instalar** na barra de endereço (ou menu → **Instalar**).

---

## 💾 Exportar / Importar backup (JSON)

Na tela inicial (lista), use o bloco de **backup**:

- **Exportar backup** → baixa um arquivo `boletins-backup_AAAA-MM-DD_HH-mm.json` com **todos** os boletins.
- **Importar backup** → selecione um `.json` exportado; os boletins são **mesclados** (atualizados por id, sem apagar os existentes).
- Na tela de **Visualizar**, há também **Exportar este boletim em JSON** (backup individual).

Use isso para **restaurar** ao limpar o navegador ou **migrar** para outro aparelho.

---

## 🖨️ Exportar PDF / Imprimir

Abra um boletim em **Visualizar** e toque em **Imprimir / PDF**:

- Abre o diálogo de impressão nativo com layout **A4** otimizado (cabeçalho, produção, câmera, cenas, **takes aprovados destacados em verde**, observações).
- Para **PDF**, escolha **"Salvar como PDF"** como destino da impressão.
- Para **papel**, escolha sua impressora.

Funciona **100% offline** — sem bibliotecas externas, com tipografia limpa e legível.

---

## ▲ Deploy na Vercel

O app é estático/client-side — o deploy é só hospedagem de frontend.

**Opção A — CLI:**
```bash
npm i -g vercel
vercel          # segue o assistente (preview)
vercel --prod   # produção
```

**Opção B — Git:**
1. Faça push do repositório para o GitHub/GitLab/Bitbucket.
2. Em [vercel.com](https://vercel.com), **Import Project** e selecione o repositório.
3. A Vercel detecta o Next.js automaticamente — **não há variáveis de ambiente** para configurar.
4. **Deploy**.

> O arquivo `.env.example` existe apenas por convenção: **nenhuma variável de ambiente é necessária**.

---

## 🧪 Boletim demo

No primeiro acesso, o app cria automaticamente um **boletim de exemplo** com as cenas da especificação
(Cena 2: `R3D MQ · 5K 17:9 · 23.98 · ISO 640 · 180 · 5300K · 709 · T2.8`, óptica `25mm` + `ND 0.9 + ND 0.6` + Matte Box;
além das Cenas 1, 16 e 17.1 e takes aprovados). Você pode editá-lo ou excluí-lo — ele **não volta** depois de removido.

---

## ♿ Qualidade

- TypeScript **strict**, **sem `any`**, tipagem forte do domínio.
- Acessibilidade básica: `aria-label`/`aria-expanded`/`role="switch"`, foco visível, alvos de toque ≥ 44px.
- Mobile-first, dark mode legível em externa/set escuro, áreas de toque grandes.
- Build estático e enxuto (First Load JS ~100 kB).

---

Feito para a equipe de câmera. 🎥
