# 🌐 Nexus Web Application

> **Next.js 16 App Router ile Living Plan, Kanban ve AI workflow demo uygulaması**

[![Next.js](https://img.shields.io/badge/Next.js-16.1-black?logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Tailwind](https://img.shields.io/badge/Tailwind-4.0-38B2AC?logo=tailwindcss)](https://tailwindcss.com/)
[![Shadcn/ui](https://img.shields.io/badge/shadcn/ui-latest-black)](https://ui.shadcn.com/)

---

## 📋 Genel Bakış

Bu, Nexus projesinin ana web uygulamasıdır. Modern React patterns ve Next.js App Router kullanarak:

- **📄 Living Plan** - Plan sürümleri, `REQ-001` gereksinimleri ve kapsama takibi
- **🔁 Change Review** - Plan değiştiğinde etkilenen işleri önerir; kullanıcı onayı olmadan Kanban değişmez
- **🤖 Server-managed AI** - Demo kullanıcıdan API key istemez; kota ve unavailable durumları server tarafında yönetilir
- **✅ Kanban Task Board** - Gereksinim bağlantıları ve hizalama durumlarıyla görev yönetimi
- **🔒 Authentication** - Better-Auth ile güvenli kimlik doğrulama

---

## 🏗️ Mimari

```
src/
├── app/                    # Next.js App Router
│   ├── api/               # API Routes
│   │   ├── agents/        # Agent execution endpoints
│   │   ├── chat/          # AI chat with streaming
│   │   ├── docs/          # Document CRUD
│   │   ├── tasks/         # Task management
│   │   ├── sync/          # API-backed sync/offline queue endpoints
│   │   ├── plans/         # Living Plan analysis endpoints
│   │   ├── change-sets/   # Human review queue endpoints
│   │   └── workflows/     # Temporal workflow triggers
│   ├── dashboard/         # Protected dashboard pages
│   │   ├── agents/        # Workflow Center / run history
│   │   ├── chat/          # AI chat interface
│   │   ├── docs/          # Document editor
│   │   ├── tasks/         # Kanban board
│   │   └── settings/      # User preferences
│   ├── login/             # Auth pages
│   └── register/
│
├── components/            # React Components
│   ├── ui/               # Shadcn/ui primitives
│   ├── app-sidebar.tsx   # Navigation sidebar
│   ├── editor.tsx        # Rich text editor
│   └── collaborative-editor.tsx  # Real-time collab
│
├── hooks/                 # Custom React Hooks
│   ├── use-data.ts       # API data fetching
│   └── useCollaboration.ts
│
├── lib/                   # Core Libraries
│   ├── zero.tsx          # API-backed sync/offline queue compatibility layer
│   ├── auth.ts           # Authentication
│   ├── crag.ts           # Corrective RAG
│   ├── observability.ts  # Agent tracing
│   └── yjs.ts            # CRDT collaboration
│
└── __tests__/            # Test suites (733+ test cases)
```

---

## 🛠️ Teknolojiler

| Kategori      | Teknoloji               | Açıklama                        |
| ------------- | ----------------------- | ------------------------------- |
| **Framework** | Next.js 16              | App Router, RSC, Server Actions |
| **Styling**   | Tailwind v4 + Shadcn/ui | Modern component library        |
| **State**     | React hooks + API-backed sync | Optimistic UI and queued mutations |
| **Editor**    | BlockNote / TipTap      | Rich text with CRDT             |
| **Auth**      | Better-Auth             | Session-based authentication    |
| **AI**        | Gemini + workflow guardrails | Server-managed provider, quota, unavailable states |

---

## 🚀 Başlarken

### Gereksinimler

- Node.js 20+
- pnpm 10+
- Docker (PostgreSQL + Temporal için)

### Kurulum

```bash
# 1. Root dizinden bağımlılıkları yükle
cd /path/to/nexus
pnpm install

# 2. Environment variables
cp apps/web/.env.example apps/web/.env.local
# Gerekli değerleri ayarla:
# - DATABASE_URL
# - GEMINI_API_KEY (AI workflow/chat)
# - OPENAI_API_KEY (opsiyonel embeddings/RAG)
# - TAVILY_API_KEY (opsiyonel web search)

# 3. Tek komut lokal demo
pnpm dev:local
```

### Erişim

- **Web App:** http://localhost:3000
- **Temporal UI:** http://localhost:8080

---

## 📁 Önemli Dosyalar

### API Routes

| Endpoint         | Metod    | Açıklama                  |
| ---------------- | -------- | ------------------------- |
| `/api/chat`      | POST     | AI chat with streaming    |
| `/api/agents`    | POST     | Direct agent execution    |
| `/api/docs`      | GET/POST | Document CRUD             |
| `/api/tasks`     | GET/POST | Task management           |
| `/api/sync/push` | POST     | Client → Server sync      |
| `/api/sync/pull` | GET      | Server → Client sync      |
| `/api/workflows` | POST     | Trigger Temporal workflow |

### Key Components

- **`lib/zero.tsx`** - API-backed sync/offline queue compatibility layer
- **`lib/observability.ts`** - Agent execution tracing
- **`components/collaborative-editor.tsx`** - Yjs CRDT editor
- **`app/api/chat/route.ts`** - LangGraph multi-agent orchestration

---

## 🧪 Testing

```bash
# Unit ve integration testleri
pnpm test

# Watch mode
pnpm test:watch

# Coverage raporu
pnpm test:coverage
```

### Test Yapısı

```
__tests__/
├── setup.ts              # Test utilities, mock data
├── auth.test.ts          # Authentication tests
├── docs.test.ts          # Document operations
├── tasks.test.ts         # Task management
├── chat.test.ts          # AI chat tests
├── agents.test.ts        # Multi-agent tests
├── sync.test.ts          # API-backed sync/offline queue tests
└── workflows.test.ts     # Temporal workflow tests
```

---

## 🎯 Özellikler

### API-Backed Sync / Offline Queue

```tsx
// Compatibility hook kullanımı
import { useDocs, useUpdateDoc } from "@/lib/zero";

function DocumentList() {
  const docs = useDocs("workspace-id");  // Optimistic local cache + server sync
  const updateDoc = useUpdateDoc();
  
  // Optimistic update - sunucu beklemeden UI güncellenir
  await updateDoc(docId, { title: "Yeni Başlık" });
}
```

### AI Chat

```tsx
// Streaming chat
const { messages, append } = useChat({
  api: "/api/chat",
  body: { mode: "auto" },  // Supervisor multi-agent
});

// Kullanıcı mesajı
append({ role: "user", content: "Araştırma yap ve rapor oluştur" });
// → Supervisor → Research Agent → Writer Agent → Response
```

### Real-time Collaboration

```tsx
// CRDT-based editing
import { CollaborativeEditor } from "@/components/collaborative-editor";

<CollaborativeEditor
  docId="doc-123"
  onSave={(content) => saveToDatabase(content)}
/>
// Birden fazla kullanıcı aynı anda düzenleyebilir
```

---

## 🔧 Environment Variables

```env
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/nexus

# AI Providers (en az biri gerekli)
GEMINI_API_KEY=your-gemini-key
OPENAI_API_KEY=your-openai-key

# Web Search
TAVILY_API_KEY=your-tavily-key

# Temporal (opsiyonel)
TEMPORAL_ADDRESS=localhost:7233

# Auth
BETTER_AUTH_SECRET=random-secret-key
```

---

## 📊 Performance

| Metrik                     | Hedef   | Açıklama              |
| -------------------------- | ------- | --------------------- |
| **First Contentful Paint** | < 1s    | SSR + RSC             |
| **Data Latency**           | Low     | Optimistic local cache + server sync |
| **Offline Queue**          | Partial | IndexedDB command queue |
| **Bundle Size**            | < 200KB | Code splitting        |

---

## 🐛 Troubleshooting

### "Temporal not available"

```bash
# Temporal container'ı çalışıyor mu kontrol et
docker ps | grep temporal

# Değilse başlat
docker-compose up -d temporal temporal-ui
```

### "Database connection failed"

```bash
# PostgreSQL container
docker ps | grep postgres

# Connection string doğru mu?
echo $DATABASE_URL
```

### "AI response empty"

- Server tarafında `AI_ENABLED=true` ve `GEMINI_API_KEY` ayarlı olduğundan emin ol
- `OPENAI_API_KEY` yalnızca embeddings/RAG için gerekli
- Rate limit kontrolü yap

---

## 📚 İlgili Dokümanlar

- [Root README](../../README.md) - Proje genel bakış
- [ADR-001: Local-First](../../docs/adr/001-local-first-architecture.md)
- [ADR-002: Multi-Agent](../../docs/adr/002-multi-agent-langgraph.md)
- [ADR-003: Temporal](../../docs/adr/003-durable-execution-temporal.md)
- [Test Cases](../../docs/testcases.md)

---

## 🤝 Katkıda Bulunma

1. Feature branch oluştur: `git checkout -b feature/amazing-feature`
2. Değişiklikleri commit et: `git commit -m 'Add amazing feature'`
3. Branch'i push et: `git push origin feature/amazing-feature`
4. Pull Request aç

---

*Bu uygulama [Nexus](../../README.md) monorepo'sunun bir parçasıdır.*
