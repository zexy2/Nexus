# 🔴 Nexus Proje Eksiklikleri ve Düzeltme Planı

> **Oluşturulma Tarihi:** 20 Ocak 2026  
> **Amaç:** Proje fikrine tam uyum sağlamak için yapılması gerekenler

---

## Kritiklik Seviyeleri

| Seviye       | Açıklama                                               |
| ------------ | ------------------------------------------------------ |
| 🔴 **KRİTİK** | Projenin temel vaadini etkiliyor, mutlaka düzeltilmeli |
| 🟠 **YÜKSEK** | Kaliteyi ciddi şekilde etkiliyor                       |
| 🟡 **ORTA**   | İyileştirme gerekli                                    |
| 🟢 **DÜŞÜK**  | Nice-to-have                                           |

---

## 1. Zero Sync / Local-First Eksiklikleri

### 🔴 1.1. Gerçek Zero SDK Kullanılmıyor
- **Mevcut Durum:** Custom senkronizasyon simülasyonu (`/lib/zero.tsx`)
- **Beklenen:** `@rocicorp/zero` veya `electric-sql` paketi
- **Çözüm:** Ya gerçek SDK entegre edilecek YA DA README'de custom implementation olduğu açıkça belirtilecek
- **Öncelik:** 🔴 KRİTİK

### 🟠 1.2. Offline-First Demo Eksik
- **Mevcut Durum:** Teorik olarak çalışıyor, kanıtlanmamış
- **Beklenen:** Offline modda işlem yapılabilen, online olunca sync olan demo
- **Çözüm:** E2E test veya video demo
- **Öncelik:** 🟠 YÜKSEK

### 🟡 1.3. CRDT Çakışma Çözümü Test Edilmemiş
- **Mevcut Durum:** Yjs entegrasyonu var ama test yok
- **Beklenen:** İki kullanıcı aynı anda düzenlediğinde çakışma çözümü
- **Çözüm:** Concurrent edit test senaryosu
- **Öncelik:** 🟡 ORTA

---

## 2. LangGraph / Multi-Agent Eksiklikleri

### 🟠 2.1. Döngüsel Akış (Cyclic Flow) Eksik
- **Mevcut Durum:** Linear agent execution
- **Beklenen:** Agent hata yapınca geri dönüp düzeltme (Self-Correction)
- **Çözüm:** Supervisor'a reflection/retry logic ekle
- **Öncelik:** 🟠 YÜKSEK

### 🟠 2.2. Corrective RAG (CRAG) Tam Değil
- **Mevcut Durum:** Basit RAG var
- **Beklenen:** Bulunan dokümanların alakalılık değerlendirmesi
- **Çözüm:** Grader node ekle: "Bu döküman soruyla alakalı mı?"
- **Öncelik:** 🟠 YÜKSEK

### 🟡 2.3. LangSmith/LangFuse Entegrasyonu Yok
- **Mevcut Durum:** Custom observability (`observability.ts`)
- **Beklenen:** Production-grade tracing
- **Çözüm:** LangSmith veya LangFuse SDK entegre et
- **Öncelik:** 🟡 ORTA

### 🟡 2.4. Agent Çalışma Görselleştirmesi Yok
- **Mevcut Durum:** Console log'lar
- **Beklenen:** UI'da "Supervisor → Research → Writer" akışı görsel
- **Çözüm:** Real-time agent status component
- **Öncelik:** 🟡 ORTA

---

## 3. Temporal / Durable Execution Eksiklikleri

### 🟠 3.1. Temporal Çalışıyor mu Belirsiz
- **Mevcut Durum:** Fallback mekanizması var, Temporal opsiyonel
- **Beklenen:** Temporal olmadan proje eksik kalıyor
- **Çözüm:** Temporal'in çalıştığını gösteren demo/test
- **Öncelik:** 🟠 YÜKSEK

### 🟡 3.2. Saga Pattern Örneği Eksik
- **Mevcut Durum:** Workflows tanımlı ama compensation logic belirsiz
- **Beklenen:** Hata durumunda rollback senaryosu
- **Çözüm:** Explicit compensation activity ekle
- **Öncelik:** 🟡 ORTA

### 🟢 3.3. Temporal UI Link README'de Yok
- **Mevcut Durum:** Docker'da UI var ama dokümante edilmemiş
- **Beklenen:** "Temporal UI: http://localhost:8080" README'de
- **Çözüm:** README güncelle
- **Öncelik:** 🟢 DÜŞÜK

---

## 4. Test Eksiklikleri

### 🔴 4.1. Integration Test Yok
- **Mevcut Durum:** Mock-ağırlıklı unit testler
- **Beklenen:** Gerçek API çağrıları yapan testler
- **Çözüm:** `__tests__/integration/` klasörü oluştur
- **Öncelik:** 🔴 KRİTİK

### 🟠 4.2. E2E Test Yok
- **Mevcut Durum:** Playwright/Cypress kurulu değil
- **Beklenen:** User journey testi (login → chat → agent → result)
- **Çözüm:** Playwright ekle, temel E2E yaz
- **Öncelik:** 🟠 YÜKSEK

### 🟡 4.3. Agent Pipeline Test Eksik
- **Mevcut Durum:** Agent testleri mock obje kontrolü
- **Beklenen:** Gerçek LangGraph invoke testi
- **Çözüm:** Supervisor integration test
- **Öncelik:** 🟡 ORTA

---

## 5. Dokümantasyon Eksiklikleri

### 🔴 5.1. apps/web/README.md Default Next.js
- **Mevcut Durum:** create-next-app default README
- **Beklenen:** Proje-spesifik içerik
- **Çözüm:** Web app README yaz
- **Öncelik:** 🔴 KRİTİK

### 🟠 5.2. Demo Video Yok
- **Mevcut Durum:** Sadece yazılı dokümantasyon
- **Beklenen:** 3-5 dakikalık kullanım videosu
- **Çözüm:** Loom veya screen recording
- **Öncelik:** 🟠 YÜKSEK

### 🟠 5.3. Mermaid Diyagramları ASCII
- **Mevcut Durum:** ASCII art diyagramlar
- **Beklenen:** GitHub'da render edilen Mermaid
- **Çözüm:** README'deki diyagramları Mermaid'e çevir
- **Öncelik:** 🟠 YÜKSEK

### 🟡 5.4. API Dokümantasyonu Eksik
- **Mevcut Durum:** API route'ları dokümante edilmemiş
- **Beklenen:** Swagger/OpenAPI veya en azından endpoint listesi
- **Çözüm:** `/docs/API.md` oluştur
- **Öncelik:** 🟡 ORTA

### 🟢 5.5. CONTRIBUTING.md Yok
- **Mevcut Durum:** Katkıda bulunma rehberi yok
- **Beklenen:** Open source standardı
- **Çözüm:** CONTRIBUTING.md ekle
- **Öncelik:** 🟢 DÜŞÜK

---

## 6. UI/UX Eksiklikleri

### 🟡 6.1. Agent Execution Feedback Zayıf
- **Mevcut Durum:** "Processing..." mesajı
- **Beklenen:** Hangi ajan çalışıyor, ne yapıyor görsel feedback
- **Çözüm:** Step-by-step progress indicator
- **Öncelik:** 🟡 ORTA

### 🟡 6.2. Offline Status Indicator Belirsiz
- **Mevcut Durum:** Sync status var ama küçük
- **Beklenen:** Belirgin offline/online göstergesi
- **Çözüm:** Header'a prominent status badge
- **Öncelik:** 🟡 ORTA

### 🟢 6.3. Dark/Light Theme Toggle Eksik
- **Mevcut Durum:** Sistem temasına bağlı
- **Beklenen:** Manuel toggle
- **Çözüm:** Theme switcher ekle
- **Öncelik:** 🟢 DÜŞÜK

---

## 7. DevOps/CI Eksiklikleri

### 🟡 7.1. GitHub Actions CI/CD Eksik
- **Mevcut Durum:** CI pipeline yok veya belirsiz
- **Beklenen:** PR'larda otomatik test, lint, build
- **Çözüm:** `.github/workflows/ci.yml` oluştur
- **Öncelik:** 🟡 ORTA

### 🟢 7.2. Vercel/Deployment Config Eksik
- **Mevcut Durum:** Manual deploy
- **Beklenen:** Otomatik preview deployments
- **Çözüm:** Vercel bağla veya dokümante et
- **Öncelik:** 🟢 DÜŞÜK

---

## 8. Kod Kalitesi Eksiklikleri

### 🟡 8.1. Error Boundary Eksik
- **Mevcut Durum:** Hatalar sayfayı çökertiyor
- **Beklenen:** Graceful error handling
- **Çözüm:** React Error Boundary ekle
- **Öncelik:** 🟡 ORTA

### 🟢 8.2. Loading Skeleton'lar Tutarsız
- **Mevcut Durum:** Bazı sayfalarda Loader, bazılarında yok
- **Beklenen:** Tutarlı loading states
- **Çözüm:** Skeleton component'ları standartlaştır
- **Öncelik:** 🟢 DÜŞÜK

---

## Öncelik Sıralaması (Düzeltme Planı)

### Faz 1: KRİTİK (Hemen Yapılmalı)
1. [x] apps/web/README.md güncelle ✅
2. [x] Zero Sync durumunu README'de açıkça belirt ✅
3. [x] Integration test klasörü ve temel testler ✅

### Faz 2: YÜKSEK (Bu Hafta)
4. [x] Mermaid diyagramlarına geç ✅
5. [x] LangGraph Self-Correction ekle ✅
6. [x] CRAG (Corrective RAG) implementasyonu ✅ (zaten vardı)
7. [x] Temporal demo/test ✅
8. [x] E2E test kurulumu (Playwright) ✅

### Faz 3: ORTA (Sonraki Hafta)
9. [x] Agent execution UI feedback ✅
10. [ ] LangSmith/LangFuse entegrasyonu
11. [x] API dokümantasyonu ✅
12. [x] GitHub Actions CI ✅
13. [ ] Saga Pattern compensation örneği

### Faz 4: DÜŞÜK (Zaman Kalırsa)
14. [x] CONTRIBUTING.md ✅
15. [x] Theme toggle ✅
16. [ ] Vercel deployment
17. [x] Loading skeleton standardizasyonu ✅
18. [x] Error Boundary ✅

---

## İlerleme Takibi

| #   | Eksiklik             | Durum                         | Tamamlanma   |
| --- | -------------------- | ----------------------------- | ------------ |
| 1   | apps/web/README.md   | ✅ Tamamlandı                  | 20 Ocak 2026 |
| 2   | Zero Sync açıklaması | ✅ Tamamlandı                  | 20 Ocak 2026 |
| 3   | Integration tests    | ✅ Tamamlandı                  | 20 Ocak 2026 |
| 4   | Mermaid diyagramlar  | ✅ Tamamlandı                  | 20 Ocak 2026 |
| 5   | Self-Correction      | ✅ Tamamlandı                  | 20 Ocak 2026 |
| 6   | CRAG                 | ✅ Doğrulandı (zaten mevcuttu) | 20 Ocak 2026 |
| 7   | Temporal demo        | ✅ Tamamlandı                  | 21 Ocak 2026 |
| 8   | E2E tests            | ✅ Tamamlandı                  | 20 Ocak 2026 |
| 9   | API dokumentasyonu   | ✅ Tamamlandı                  | 20 Ocak 2026 |
| 10  | GitHub Actions CI    | ✅ Tamamlandı                  | 21 Ocak 2026 |
| 11  | CONTRIBUTING.md      | ✅ Tamamlandı                  | 21 Ocak 2026 |
| 12  | Error Boundary       | ✅ Tamamlandı                  | 21 Ocak 2026 |
| 13  | Theme Toggle         | ✅ Tamamlandı                  | 21 Ocak 2026 |
| 14  | Agent Feedback UI    | ✅ Tamamlandı                  | 21 Ocak 2026 |
| 15  | Loading Skeletons    | ✅ Tamamlandı                  | 21 Ocak 2026 |

---

*Son güncelleme: 21 Ocak 2026*
