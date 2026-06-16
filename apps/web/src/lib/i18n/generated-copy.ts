import type { AppLocale } from "./messages";

const turkishExact: Record<string, string> = {
  "Generated Document": "Oluşturulan Plan",
  "Initial requirements and delivery work were extracted from the plan.":
    "İlk gereksinimler ve teslimat işleri plandan çıkarıldı.",
  "Plan changes were compared with the accepted baseline.":
    "Plan değişiklikleri kabul edilmiş referans sürümle karşılaştırıldı.",
  "This new requirement was created to satisfy the current plan.":
    "Bu yeni gereksinimi karşılamak için bir görev önerildi.",
  "Keep delivery work aligned with the current plan.":
    "Teslimat işini güncel planla hizalı tut.",
  "MVP Goal: Market Validation & Feedback":
    "MVP amacı: Pazar doğrulama ve geri bildirim",
  "Customer User Registration & Login":
    "Müşteri uygulaması: Kullanıcı kayıt ve giriş",
  "Customer Restaurant Listing & Viewing":
    "Müşteri uygulaması: Restoran listeleme ve görüntüleme",
  "Customer Order Placement":
    "Müşteri uygulaması: Sipariş oluşturma",
  "Customer Order Status Tracking":
    "Müşteri uygulaması: Sipariş durumu takibi",
  "Customer Order History":
    "Müşteri uygulaması: Sipariş geçmişi",
  "Restaurant Detail & Menu Display":
    "Restoran detay ve menü gösterimi",
  "Admin Panel Order Tracking":
    "Yönetici paneli: Sipariş takibi",
  "Admin Panel Restaurant Management":
    "Yönetici paneli: Restoran yönetimi",
  "Restaurant Status Management":
    "Restoran durum yönetimi",
  "Order Management":
    "Sipariş yönetimi",
  "Select Mobile App Technology Stack":
    "Mobil uygulama teknoloji seçimi",
  "Select Backend Technology Stack":
    "Backend teknoloji seçimi",
  "Select and Onboard Payment Gateway":
    "Ödeme altyapısını seç ve entegre et",
  "Implement Test-Driven Development (TDD)":
    "Test odaklı geliştirme yaklaşımını uygula",
};

const turkishReplacements: Array<[RegExp, string]> = [
  [
    /Initial MVP plan for a mobile food ordering application, detailing core features for customer, restaurant, and admin interfaces\./gi,
    "Mobil yemek siparişi uygulaması için müşteri, restoran ve yönetici arayüzlerindeki temel özellikleri kapsayan ilk MVP planı.",
  ],
  [
    /All requirements are newly defined as no previous baseline was provided\./gi,
    "Önceden kabul edilmiş bir referans plan olmadığı için tüm gereksinimler yeni olarak tanımlandı.",
  ],
  [
    /This new requirement was created to satisfy the current plan\./gi,
    "Bu yeni gereksinimi karşılamak için bir görev önerildi.",
  ],
  [
    /This new requirement was created to satisfy (REQ-\d+)\./gi,
    "$1 gereksinimini karşılamak için bir görev önerildi.",
  ],
  [
    /No previous baseline was provided/gi,
    "Önceden kabul edilmiş bir referans plan bulunmadı",
  ],
  [
    /customer, restaurant, and admin interfaces/gi,
    "müşteri, restoran ve yönetici arayüzleri",
  ],
  [
    /mobile food ordering application/gi,
    "mobil yemek siparişi uygulaması",
  ],
];

export function localizeGeneratedCopy(value: string | null | undefined, locale: AppLocale) {
  if (!value || locale !== "tr") return value || "";
  const exact = turkishExact[value.trim()];
  if (exact) return exact;

  return turkishReplacements.reduce(
    (text, [pattern, replacement]) => text.replace(pattern, replacement),
    value
  );
}
