# ADR-001: Local-First Architecture with Zero Sync

## Status
**Accepted** - 18 Ocak 2026

## Context

Modern web uygulamaları için veri yönetimi konusunda kritik bir karar vermemiz gerekiyordu:

1. **Geleneksel REST API yaklaşımı**: Manuel endpoint'ler, loading state'leri, error handling
2. **GraphQL**: Overfetching çözümü, ama hala sunucu-bağımlı
3. **Local-First (Zero Sync)**: Offline-first, optimistic updates, CRDT-based sync

## Decision

**Zero Sync** kullanarak Local-First mimari uyguluyoruz.

## Rationale

### Neden Zero Sync?

1. **0ms Gecikme**: Veri yerel IndexedDB'den okunuyor, UI anında güncelleniyor
2. **Offline Çalışma**: İnternet olmadan tam fonksiyonellik
3. **Optimistic Updates**: Sunucu cevabı beklenmeden UI güncelleniyor
4. **CRDT Tabanlı Sync**: Çakışmalar otomatik çözülüyor
5. **API Eliminasyonu**: Manuel endpoint yazmaya gerek yok

### Trade-offs

| Avantaj                       | Dezavantaj                    |
| ----------------------------- | ----------------------------- |
| Instant UI response           | Öğrenme eğrisi                |
| Offline support               | Zero Sync'e bağımlılık        |
| No loading spinners           | Daha karmaşık debug           |
| Automatic conflict resolution | Server-side validation farklı |

## Consequences

### Pozitif
- Kullanıcı deneyimi dramatik şekilde iyileşti
- Network kodu %80 azaldı
- Real-time collaboration doğal olarak geldi

### Negatif
- Takımın Zero API'yi öğrenmesi gerekti
- Bazı edge-case'ler için custom sync logic yazdık

## Implementation

```typescript
// packages/zero-schema/src/index.ts
import { createSchema, createTableSchema } from "@rocicorp/zero";

export const schema = createSchema({
  version: 1,
  tables: {
    docs: docSchema,
    tasks: taskSchema,
    // ...
  },
});

// apps/web/src/lib/zero.tsx
export function ZeroProvider({ children }) {
  const engine = useMemo(() => new SyncEngine(serverUrl), [serverUrl]);
  // ...
}
```

## Related Decisions
- ADR-002: Multi-Agent AI with LangGraph
- ADR-003: Durable Execution with Temporal
