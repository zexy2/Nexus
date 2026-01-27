# Contributing to Nexus

Nexus'a katkıda bulunmak istediğiniz için teşekkürler! 🎉

## 🚀 Hızlı Başlangıç

### Geliştirme Ortamını Kurma

1. **Repository'yi Fork'layın ve Klonlayın**
```bash
git clone https://github.com/YOUR_USERNAME/nexus.git
cd nexus
```

2. **Bağımlılıkları Kurun**
```bash
pnpm install
```

3. **Environment Variables**
```bash
cp .env.example .env.local
```

4. **Veritabanını Başlatın**
```bash
docker-compose up -d
pnpm db:push
```

5. **Geliştirme Sunucusunu Başlatın**
```bash
pnpm dev
```

## 📋 Katkıda Bulunma Süreci

### 1. Issue Açın veya Mevcut Bir Issue Seçin

- Yeni bir özellik veya bug fix için önce issue açın
- `good first issue` etiketli issue'lar yeni başlayanlar için uygundur
- Issue'yu üstlendiğinizi belirtin

### 2. Branch Oluşturun

```bash
# Feature için
git checkout -b feature/your-feature-name

# Bug fix için
git checkout -b fix/bug-description

# Docs için
git checkout -b docs/what-you-are-documenting
```

### 3. Değişikliklerinizi Yapın

- Küçük, odaklı commit'ler yapın
- Conventional Commits formatını kullanın:
  - `feat:` - Yeni özellik
  - `fix:` - Bug düzeltmesi
  - `docs:` - Dokümantasyon
  - `style:` - Kod formatı (fonksiyonelliği etkilemez)
  - `refactor:` - Refactoring
  - `test:` - Test ekleme/düzeltme
  - `chore:` - Build, tooling değişiklikleri

### 4. Testleri Çalıştırın

```bash
# Unit testler
pnpm test

# Lint
pnpm lint

# Type check
pnpm type-check

# E2E testler (Playwright kurulu olmalı)
pnpm --filter @nexus/web test:e2e
```

### 5. Pull Request Açın

- Main branch'e PR açın
- PR template'i doldurun
- Reviewer bekleyin

## 🎨 Kod Standartları

### TypeScript

- Strict mode aktif
- `any` kullanmaktan kaçının
- Tüm public fonksiyonlara JSDoc yazın

```typescript
/**
 * Kullanıcı dokümanlarını getirir
 * @param userId - Kullanıcı ID'si
 * @returns Doküman listesi
 */
export async function getUserDocuments(userId: string): Promise<Document[]> {
  // ...
}
```

### React

- Functional component'lar kullanın
- Custom hook'ları `use` prefix'i ile adlandırın
- Component'ları küçük tutun (<200 satır)

### CSS/Styling

- Tailwind CSS kullanın
- Custom CSS'ten kaçının
- Dark mode desteği ekleyin

### Testing

- Her yeni özellik için test yazın
- Coverage düşürmekten kaçının
- Integration testleri önemseyin

## 📁 Proje Yapısı

```
nexus/
├── apps/
│   └── web/              # Next.js frontend
│       ├── src/
│       │   ├── app/      # App router pages
│       │   ├── components/
│       │   ├── hooks/
│       │   └── lib/
│       └── e2e/          # Playwright tests
├── packages/
│   ├── agents/           # LangGraph agents
│   ├── database/         # Drizzle schema
│   ├── workflows/        # Temporal workflows
│   └── zero-schema/      # Zero sync schema
└── docs/                 # Documentation
```

## 🔧 Araçlar

- **pnpm** - Package manager
- **Turborepo** - Monorepo build system
- **Vitest** - Unit testing
- **Playwright** - E2E testing
- **ESLint** - Linting
- **Prettier** - Formatting

## 🐛 Bug Report

Bug report açarken şunları ekleyin:

1. Beklenen davranış
2. Gerçekleşen davranış
3. Reproduce adımları
4. Environment (OS, Node version, browser)
5. Ekran görüntüsü/video (varsa)

## 💡 Feature Request

Feature request açarken:

1. Problem tanımı
2. Önerilen çözüm
3. Alternatifler
4. Ek bağlam

## 📞 İletişim

- GitHub Issues - Bug ve feature request'ler için
- GitHub Discussions - Sorular ve tartışmalar için

## 📜 Lisans

Katkıda bulunarak, katkılarınızın proje lisansı altında lisanslanacağını kabul etmiş olursunuz.

---

Katkılarınız için teşekkürler! 🙏
