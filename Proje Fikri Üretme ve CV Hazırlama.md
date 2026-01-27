# **2026 Yazılım Mimarisi Ufku: Yeni Nesil Bir Bilgisayar Mühendisi İçin Nihai "Full Stack" Portföy Projesi ve Stratejik Kariyer Yol Haritası**

## **Yönetici Özeti**

Bu kapsamlı teknik rapor, 2026 yılında bilgisayar mühendisliği lisans programından mezun olacak bir adayın, rekabetin yoğun olduğu küresel ve yerel iş gücü piyasasında belirgin bir farklılık yaratmasını sağlayacak, teknik derinliği yüksek ve modern yazılım mimarisi paradigmalarını yeniden tanımlayan bir "Full Stack" proje önerisi sunmak üzere hazırlanmıştır. Rapor, geleneksel web geliştirme yaklaşımlarının (standart REST API tabanlı CRUD uygulamaları) ötesine geçerek, endüstrinin yöneldiği "Ajanik Yapay Zeka" (Agentic AI), "Yerel-Öncelikli Mimariler" (Local-First Architectures) ve "Dayanıklı Yürütme" (Durable Execution) kavramlarını merkeze almaktadır.

Sektörel analizler ve 2025-2026 projeksiyonları, işverenlerin artık yalnızca kod yazabilen (coding) adaylardan ziyade, karmaşık sistemleri tasarlayabilen, dağıtık sistem prensiplerine hakim ve yapay zeka ile klasik yazılım mühendisliğini hibrit bir düzlemde birleştirebilen mühendisler aradığını göstermektedir.1 Bu bağlamda önerilen proje, **"Nexus: Yerel-Öncelikli, Otonom Çoklu-Ajan Orkestrasyonu ve İşbirliği Platformu"**, bir web uygulamasından çok daha fazlası; bir dağıtık sistem simülasyonudur.

Bu rapor, projenin kavramsal tasarımından teknoloji yığını seçimine (Next.js 15, Zero Sync, LangGraph, Temporal), mimari karar süreçlerinden (trade-offs) mülakat stratejilerine kadar uzanan 360 derecelik bir rehber niteliğindedir. Amaç, mezun adayın GitHub profilini ve CV'sini, deneyimli bir kıdemli mühendisin (Senior Engineer) dikkatini çekecek ve "Bu aday, sektör standartlarının 3 yıl ilerisinde" dedirtecek bir seviyeye taşımaktır.

## ---

**1\. 2026 Yazılım Ekosistemi ve "Kıdemli" Mühendislik Beklentileri Analizi**

2026 yılına girerken, yazılım geliştirme disiplini tarihinin en radikal dönüşümlerinden birini yaşamaktadır. Yapay zeka destekli kodlama asistanlarının (GitHub Copilot, Cursor, vb.) yaygınlaşmasıyla birlikte, temel düzeyde kod üretimi bir meta (commodity) haline gelmiş, mühendislerden beklenen katma değer "sözdizimi bilgisi"nden "sistem tasarımı" ve "karar alma yetkinliği"ne kaymıştır.3

### **1.1. "Full Stack" Kavramının Evrimi: Frontend ve Backend Sınırlarının Silinmesi**

Geleneksel "Full Stack" tanımı, bir veritabanı, bir sunucu tarafı API ve bir istemci arayüzünden oluşan üç katmanlı mimariyi ifade ederdi. Ancak 2026 projeksiyonlarında bu katmanlar, "Yerel-Öncelikli" (Local-First) yaklaşımlar ve "Edge Computing" (Uç Bilişim) sayesinde iç içe geçmektedir.

* **API'siz Veri Erişimi:** Modern senkronizasyon motorları (Sync Engines), geliştiricilerin manuel API uç noktaları (endpoints) yazma zorunluluğunu ortadan kaldırmakta, veritabanını doğrudan ve güvenli bir şekilde istemciye yansıtmaktadır.5  
* **Sunucu Bileşenleri (RSC):** React Server Components, backend mantığını doğrudan UI bileşenlerinin içine taşıyarak, veri çekme (data fetching) stratejilerini kökten değiştirmiştir. Artık "backend" ve "frontend" ayrı projeler değil, tek bir uygulama grafiğinin farklı düğümleri olarak görülmektedir.7  
* **Tip Güvenliği (End-to-End Type Safety):** TypeScript, bir tercih olmaktan çıkıp, veritabanı şemasından (Drizzle/Prisma) ön yüze kadar uzanan kesintisiz bir güvenlik hattı haline gelmiştir.9

### **1.2. Yapay Zeka: Sohbet Botlarından Otonom Ajanlara Geçiş**

2023 ve 2024 yılları, LLM'lerin (Büyük Dil Modelleri) "Copilot" veya "Chatbot" olarak insanlara yardımcı olduğu dönemlerdi. 2026 ise, yapay zekanın "Ajan" (Agent) sıfatıyla otonom kararlar aldığı, planlama yaptığı ve eyleme geçtiği yıldır.11

* **Deterministik Olmayan Sistemler:** Yazılım mühendisliği geleneksel olarak deterministik (girdi A ise çıktı B'dir) sistemler üzerine kuruluydu. Ajanik sistemler ise olasılıksaldır. Mühendislerin görevi, bu olasılıksal doğayı yönetilebilir, izlenebilir ve güvenilir (reliable) sistemlere dönüştürmektir.13  
* **Çoklu Ajan Orkestrasyonu:** Tek bir genel amaçlı model yerine, özelleşmiş ajanların (örn: Araştırmacı, Kodlayıcı, Testçi) bir ekip gibi çalıştığı "Multi-Agent Systems" mimarisi, kurumsal ölçekte standartlaşmaktadır.14

### **1.3. Dayanıklılık ve Dağıtık Sistem Karmaşıklığı**

Mikroservislerin ve serverless mimarilerin yaygınlaşması, "Dual Write" (Çifte Yazma) ve "Distributed Transaction" (Dağıtık İşlem) sorunlarını derinleştirmiştir. Bir işlemin ortasında (örneğin ödeme alındıktan sonra stok düşülürken) sistemin çökmesi durumunda veri tutarlılığını sağlamak, artık kıdemli mühendislik mülakatlarının vazgeçilmez sorusudur.16

* **Code-as-Infrastructure:** Temporal gibi araçlar, iş akışı durumunu (workflow state) kodun kendisiyle yönetmeyi mümkün kılarak, hata durumunda sistemin kaldığı yerden devam etmesini sağlar. Bu, "Dayanıklı Yürütme" (Durable Execution) olarak adlandırılır.18

### **1.4. Neden Standart Bir E-Ticaret Sitesi Yeterli Değil?**

Birçok yeni mezun, portföyüne hala basit bir E-Ticaret sitesi veya "To-Do List" uygulaması koymaktadır. Ancak 2026 standartlarında bu projeler:

1. **Teknik Zorluk İçermez:** Çoğu framework (Next.js, Remix) bu özellikleri kutudan çıktığı gibi sunar veya AI araçları 10 dakikada kodlayabilir.  
2. **Mimari Karar Gerektirmez:** Standart bir CRUD yapısı bellidir. Mühendislik yeteneği, zor kararlar (trade-offs) verilirken ortaya çıkar.  
3. **Sektör Gerçeklerinden Uzaktır:** Modern uygulamalar gerçek zamanlıdır, çevrimdışı çalışır ve yapay zeka ile entegredir.

Bu nedenle, önerilen **Nexus** projesi, bir mezunun sadece "kod yazabildiğini" değil, "sistem tasarlayabildiğini" kanıtlamak için kurgulanmıştır.

## ---

**2\. Proje Önerisi: "Nexus" – Otonom İşbirliği Ekosistemi**

**Nexus**, özünde proje yönetimi, dokümantasyon ve gerçek zamanlı iletişimi birleştiren bir platformdur; ancak onu farklı kılan, bu fonksiyonların **Yapay Zeka Ajanları** tarafından aktif olarak yönetilmesi ve tüm sistemin **Yerel-Öncelikli (Local-First)** bir mimari üzerine inşa edilmesidir.

### **2.1. Temel Kullanım Senaryosu (User Journey)**

Kullanıcı, internet bağlantısı olmayan bir uçakta seyahat ederken Nexus uygulamasını açar (Local-First).

1. **Doğal Dil ile Talimat:** Kullanıcı, "Gelecek ayki ürün lansmanı için bir pazarlama planı oluştur ve gerekli görevleri takıma ata" yazar.  
2. **Çevrimdışı İşlem:** Uygulama, bu isteği yerel veritabanına kaydeder ve kullanıcı arayüzünde "İşleniyor (Senkronizasyon Bekleniyor)" durumunu gösterir (Optimistic UI).  
3. **Senkronizasyon ve Ajan Tetiklenmesi:** Uçak indiğinde ve cihaz internete bağlandığında, yerel veriler sunucuyla senkronize olur. Bu yeni veri, sunucudaki "Supervisor Ajanı"nı (Gözetmen) tetikler.  
4. **Çoklu Ajan Orkestrasyonu:**  
   * *Supervisor Ajan*, görevi analiz eder ve alt görevlere böler.  
   * *Araştırmacı Ajan (Researcher)*, interneti tarayarak (RAG) benzer ürün lansmanlarını analiz eder.  
   * *Yazar Ajan (Writer)*, bu analizlere dayanarak bir pazarlama stratejisi dökümanı oluşturur.  
   * *Proje Yöneticisi Ajan*, dökümandaki aksiyon maddelerini "Görevler" (Tasks) tablosuna ekler ve ilgili insan kullanıcılara atar.  
5. **İnsan-Yapay Zeka İşbirliği:** Kullanıcı sisteme girdiğinde, taslak planı ve atanmış görevleri görür. Döküman üzerinde düzeltme yaparken, ajan da aynı anda dökümanı güncelleyebilir (Real-time Collaboration).

### **2.2. Projenin Çözdüğü Kritik Mühendislik Problemleri**

Bu proje, işe alım yöneticilerine şu mesajları verir:

* **"Dağıtık sistemleri anlıyorum."** (Senkronizasyon, çakışma çözümü).  
* **"Yapay zeka sistemlerini entegre edebiliyorum."** (RAG, Function Calling, Ajan Orkestrasyonu).  
* **"Kullanıcı deneyimine (UX) önem veriyorum."** (Offline-first, 0ms gecikme).  
* **"Sistem güvenilirliğini tasarlayabiliyorum."** (Workflow motorları, hata toleransı).

## ---

**3\. Mimari Derinlik ve Teknoloji Yığını Seçimi**

Projenin başarısı, sadece son ürünün çalışmasıyla değil, arkasındaki teknoloji seçimlerinin ne kadar bilinçli yapıldığıyla ölçülür. Aşağıdaki teknoloji yığını, 2026'nın en güncel ve geçerli standartlarına göre özenle seçilmiştir.

### **3.1. Frontend ve Application Framework: Next.js 15**

Next.js, React ekosisteminin tartışmasız lideri olmaya devam etse de, bu projede kullanılma şekli "standart"ın ötesindedir.

* **Neden Next.js 15?** React Server Components (RSC) ve Server Actions, uygulamanın veri yükleme performansını maksimize eder. Ayrıca Vercel'in AI SDK'sı ile entegrasyonu en pürüzsüz olan framework'tür.7  
* **Alternatif:** **TanStack Start**. Eğer tam tip güvenliği (End-to-End Type Safety) konusunda daha radikal bir duruş sergilenmek istenirse TanStack Start tercih edilebilir. Ancak Next.js'in ekosistem gücü (örneğin hazır kimlik doğrulama çözümleri, dağıtım kolaylığı) onu bir "mezuniyet projesi" için daha güvenli ve tanınır bir liman yapar.19  
* **Kullanım Stratejisi:**  
  * Uygulama kabuğu (App Shell) ve statik sayfalar için RSC.  
  * Zengin etkileşimli alanlar (Döküman editörü, Kanban tahtası) için "use client" direktifi ile İstemci Bileşenleri.

### **3.2. Veri Katmanı: "API'siz" Mimari ve Zero Sync**

Bu projenin en "wow" dedirtecek kısmı burasıdır. REST API veya GraphQL kullanmak yerine, veritabanını doğrudan istemciye senkronize eden bir motor kullanılacaktır.

* **Teknoloji Seçimi:** **Zero (Rocicorp)** veya **ElectricSQL**.  
* **Teorik Zemin (Local-First):**  
  * Geleneksel web uygulamaları, sunucuyu "gerçeğin tek kaynağı" (Source of Truth) olarak görür. Local-First yaklaşımında ise her istemci kendi veritabanına sahiptir ve bu kopyalar "nihai tutarlılık" (Eventual Consistency) prensibiyle eşleşir.  
  * **CRDTs (Conflict-Free Replicated Data Types):** Aynı döküman üzerinde iki kişi aynı anda değişiklik yaptığında (örneğin biri başlığı, diğeri içeriği değiştirdiğinde), bu değişikliklerin veri kaybı olmadan birleştirilmesini sağlayan matematiksel yapıdır.20 Zero, bu karmaşıklığı geliştiriciden soyutlar.  
* **Avantajı:** Ağ kodu (fetching, error handling, retry logic) yazmanıza gerek kalmaz. Veriyi yerel bir değişkenden okur gibi okursunuz, gerisini senkronizasyon motoru halleder.6

### **3.3. Yapay Zeka Orkestrasyonu: LangGraph**

Basit bir OpenAI.chat.completions.create çağrısı yapmak yerine, ajanların durumunu ve akışını yöneten bir mimari kurulacaktır.

* **Teknoloji Seçimi:** **LangGraph**.  
* **Neden LangGraph?**  
  * **Döngüsel Akışlar (Cyclic Flows):** Çoğu ajan framework'ü (LangChain Chains) doğrusal (DAG) çalışır. Oysa gerçek bir ajan, bir hata yaptığında geriye dönüp hatasını düzeltebilmeli (Self-Correction/Reflection) veya bir döngü içinde çalışmalıdır. LangGraph, bu döngüleri bir "Durum Makinesi" (State Machine) olarak modellemenize olanak tanır.15  
  * **İnsan-Döngüde (Human-in-the-loop):** Ajan kritik bir işlem yapmadan önce (örneğin veritabanından veri silmeden önce) durup insandan onay bekleyebilmelidir. LangGraph bu "kesme noktalarını" (interrupts) doğal olarak destekler.13

### **3.4. Dayanıklı Yürütme ve Arka Uç Güvenilirliği: Temporal.io**

Ajanların işlemleri uzun sürebilir (dakikalar, saatler). Bu süre zarfında sunucu yeniden başlatılırsa ne olur?

* **Teknoloji Seçimi:** **Temporal.io**.  
* **Saga Deseni (Saga Pattern):** Dağıtık bir işlemde (örn: Ajan araştırma yaptı \-\> Rapor yazdı \-\> E-posta attı), adımlardan biri başarısız olursa, önceki adımların etkilerini geri almak (compensation) gerekir. Temporal, bu karmaşık hata yönetimi ve geri alma mantığını kod seviyesinde basitleştirir.16  
* **Uygulama:** Ajanların "Araştırma", "Yazma", "Raporlama" gibi uzun süren görevleri Temporal Workflow'ları olarak tanımlanacaktır.

### **Tablo 1: Teknoloji Yığını Karşılaştırması ve Seçim Matrisi**

| Katman | Standart Seçim (Junior) | Nexus Seçimi (Senior/2026) | Gerekçe ve Avantaj |
| :---- | :---- | :---- | :---- |
| **Frontend** | React (SPA) | **Next.js 15 (App Router)** | SEO, Performans, Server Actions, Vercel AI SDK uyumu. |
| **API/Data** | REST API \+ Axios | **Zero / ElectricSQL** | 0ms gecikme, offline-first, karmaşık ağ kodunun eliminasyonu. |
| **Veritabanı** | MongoDB | **PostgreSQL \+ pgvector** | İlişkisel veri bütünlüğü \+ Vektör arama yeteneği (Hibrit çözüm). |
| **AI** | Tekil LLM Çağrısı | **LangGraph Multi-Agent** | Otonom karar verme, hata düzeltme, karmaşık görev yönetimi. |
| **Job Queue** | Cron / BullMQ | **Temporal.io** | Hata toleransı, dayanıklı yürütme, uzun süreli işlem garantisi. |
| **Styling** | CSS / Bootstrap | **Tailwind v4 \+ Shadcn/ui** | Modern tasarım sistemi, tam özelleştirilebilirlik, hafiflik. |

## ---

**4\. Detaylı Sistem Mimarisi ve Uygulama Rehberi**

Bu bölüm, Nexus projesini hayata geçirirken izlenmesi gereken teknik adımları ve mimari detayları içerir. Bu yapı, projenin GitHub reposunda sergilenecek kod kalitesinin temelini oluşturur.

### **4.1. Veri Modelleme ve Şema Tasarımı**

Projenin kalbi, hem ilişkisel bütünlüğü koruyan hem de senkronizasyona uygun bir veritabanı şemasıdır. PostgreSQL kullanılacak ve şema tasarımı Drizzle ORM ile yapılacaktır.

#### **Varlık İlişki Diyagramı (ERD) Taslağı:**

* **Workspaces (Çalışma Alanları):** Projelerin üst kümesi.  
* **Docs (Dökümanlar):** Zengin metin içeriği. content alanı JSON tipinde (BlockNote/ProseMirror formatı) tutulur.  
* **Tasks (Görevler):** status (Todo, In Progress, Done), assignee\_id (User veya AI Agent ID), priority.  
* **Vectors (Embeddings):** pgvector eklentisi kullanılarak, Docs ve Tasks tablolarındaki metinlerin vektör temsilleri burada tutulur. Bu, ajanların "semantik arama" yapmasını sağlar.

**Kritik Detay:** Zero gibi senkronizasyon motorları için her tablonun "Immutable" (değişmez) bir birincil anahtara (genellikle UUID) ve "Last Modified" zaman damgasına ihtiyacı vardır.

### **4.2. Yapay Zeka Ajan Mimarisi (LangGraph Supervisor Deseni)**

Bu mimari, tek bir "Gözetmen" (Supervisor) ajanın, alt uzman ajanları yönetmesi prensibine dayanır.

1. **Girdi:** Kullanıcıdan gelen karmaşık istek (örn: "Pazar araştırması yap ve özetle").  
2. **Supervisor Node:** İsteği analiz eder. Hangi ajana ihtiyaç olduğunu belirler.  
   * Eğer "araştırma" gerekiyorsa \-\> **Researcher Agent**.  
   * Eğer "kod yazma" gerekiyorsa \-\> **Coder Agent**.  
   * Eğer "özetleme" gerekiyorsa \-\> **Writer Agent**.  
3. **Researcher Agent:**  
   * **Araçlar (Tools):** Tavily Search API (internet araması), VectorStore Retriever (iç döküman araması).  
   * **Süreç:** Önce iç dökümanlara bakar (RAG), bulamazsa internete gider. Bilgiyi toplar ve Supervisor'a döner.  
4. **Writer Agent:**  
   * Researcher'dan gelen ham veriyi alır.  
   * Kullanıcının istediği formatta (Markdown rapor) düzenler.  
5. **Durum Yönetimi (State):** LangGraph, tüm bu konuşma geçmişini ve ara sonuçları bir State nesnesinde tutar. Her ajan bu state'e ekleme yapar.

### **4.3. Dayanıklı Yürütme Entegrasyonu (Temporal \+ Next.js)**

Next.js API rotaları (Serverless Functions) kısa süreli işlemler için uygundur (maksimum 10-60 saniye). Ancak bir ajanın araştırması 5 dakika sürebilir. Bu durumda bağlantı koparsa işlem yarım kalır.

**Entegrasyon Akışı:**

1. **Başlatma:** Kullanıcı UI'dan bir görev tetikler.  
2. **API Route:** Next.js API'si, Temporal Sunucusu'na "StartWorkflow" sinyali gönderir ve hemen kullanıcıya "Görev Başlatıldı" cevabı döner (UI bloklanmaz).  
3. **Temporal Worker:** Arka planda çalışan Node.js/Go worker'ı, iş akışını devralır.  
   * *Activity 1:* LangGraph ajanını çalıştır.  
   * *Activity 2:* Sonucu bekle (Gerekirse saatlerce).  
   * *Activity 3:* Sonucu veritabanına yaz (Zero Sync sayesinde kullanıcı bunu anında görür).  
   * *Activity 4:* Kullanıcıya bildirim gönder.

Bu yapı, mülakatlarda "Serverless limitlerini nasıl aştın?" sorusuna verilecek mükemmel bir cevaptır.

## ---

**5\. Uygulama Yol Haritası (Haftalık Plan)**

Bu projeyi 8 haftalık bir sprint planı ile geliştirmek, hem disiplinli ilerlemeyi sağlar hem de GitHub'daki aktivite grafiğinizi (contribution graph) tutarlı kılar.

### **Hafta 1-2: Temel ve Altyapı**

* Monorepo kurulumu (Turborepo).  
* PostgreSQL ve Supabase kurulumu.  
* Next.js 15 projesinin oluşturulması ve kimlik doğrulama (Clerk veya Better-Auth) entegrasyonu.25  
* Zero/ElectricSQL yerel senkronizasyonunun "Hello World" seviyesinde çalıştırılması.

### **Hafta 3-4: UI ve Temel Özellikler**

* Shadcn/ui ile tasarım sisteminin kurulması.  
* Zengin metin editörü entegrasyonu (BlockNote veya TipTap).  
* Dökümanların ve görevlerin CRUD işlemlerinin Zero üzerinden yapılması (Offline mod testi).

### **Hafta 5-6: Yapay Zeka Entegrasyonu**

* LangGraph ile basit bir sohbet botu yapılması.  
* RAG altyapısının kurulması (Döküman yazıldığında otomatik embedding oluşturma).  
* Çoklu ajan yapısının (Supervisor) kodlanması.

### **Hafta 7-8: Dayanıklılık ve Cilalama**

* Temporal.io entegrasyonu ve uzun süreli görevlerin workflow'a taşınması.  
* OpenTelemetry ile izlenebilirlik (Observability) eklenmesi.26  
* README dosyasının yazılması ve demo videolarının hazırlanması.

## ---

**6\. "Wow" Faktörünü Artıracak İleri Teknikler**

Projenizi "iyi"den "mükemmel"e taşıyacak detaylar şunlardır:

### **6.1. Optimistic UI ve Çakışma Çözümü**

Zero Sync motoru, kullanıcı bir butona bastığında sunucudan cevap beklemeden UI'ı günceller (Optimistic Update). Ancak, aynı anda başka bir kullanıcı da aynı veriyi değiştirirse ne olur?

* **Strateji:** "Last Write Wins" (Son Yazan Kazanır) en basitidir. Ancak metin editörü için Yjs veya Automerge gibi CRDT kütüphanelerini entegre ederek, Google Docs benzeri karakter bazlı birleştirme sağlamak, teknik yetkinliğinizi zirveye taşır.20

### **6.2. Düzeltici RAG (Corrective RAG \- CRAG)**

Standart RAG sistemleri, bazen alakasız dökümanları getirir ve ajan yanlış cevap verir.

* **Strateji:** Ajanın bulduğu dökümanları değerlendirdiği bir ara adım ekleyin. Ajan kendi kendine "Bu döküman kullanıcının sorusuyla alakalı mı?" diye sorar. Alakasızsa, aramayı tekrar parametrelerini değiştirerek yapar. Bu "öz-düzeltme" mekanizması, yapay zeka mühendisliğinde ileri seviye bir konudur.27

### **6.3. İzlenebilirlik (Observability)**

Ajanların ne düşündüğünü, nerede takıldığını veya Temporal workflow'unun hangi adımda olduğunu görmek için **OpenTelemetry** kullanın.

* **Uygulama:** LangSmith veya Jaeger entegrasyonu ile ajanların düşünce zincirini (Chain of Thought) görselleştirin. Bu görselleri README dosyanıza koymak, sistemin "kara kutu" olmadığını kanıtlar.26

## ---

**7\. Kariyer Stratejisi: Projeyi Pazarlama**

Projeniz bittiğinde, onu işverenlere satabilmeniz gerekir.

### **7.1. GitHub README Sanatı**

README dosyanız, projenin vitrinidir. Şunları mutlaka içermelidir:

* **Etkileyici Bir Başlık ve Tagline:** "Nexus: Dağıtık Yapay Zeka İşbirliği Platformu".  
* **Mimari Diyagramlar:** Mermaid.js veya C4 Model kullanarak çizilmiş, veri akışını gösteren diyagramlar.31  
* **Teknik Kararlar Günlüğü (Architecture Decision Records \- ADR):** "Neden Redux yerine Zero kullandım?", "Neden Python yerine TypeScript ile AI yazdım?" gibi soruların cevaplandığı bir bölüm. Bu, sizin sadece "kopyala-yapıştır" yapmadığınızı, mühendislik kararları verdiğinizi gösterir.

### **7.2. CV ve Mülakat Anahtar Kelimeleri**

CV'nizde şu yetkinlikleri vurgulayın 33:

* **Mimari:** Local-First, Event-Driven, Microservices, Durable Execution.  
* **Yapay Zeka:** Multi-Agent Systems, RAG, Vector Databases, Prompt Engineering, LangGraph.  
* **Veri:** PostgreSQL, CRDTs, Sync Engines (Zero), Optimistic UI.  
* **DevOps:** Turborepo, Docker, CI/CD, OpenTelemetry.

### **7.3. Örnek Mülakat Sorusu ve Cevabı**

Soru: "Neden ajanların işlemleri için Temporal kullandın, basit bir kuyruk (queue) yetmez miydi?"  
Cevap: "Basit bir kuyruk, işlem başarısız olduğunda tekrar deneyebilir (retry). Ancak karmaşık bir iş akışında (Saga), 5\. adımda hata olursa, önceki 4 adımın etkilerini geri almak (compensation) gerekir. Temporal, bu durum yönetimini ve geri alma mantığını yerleşik olarak sunuyor. Ayrıca, işlemin durumu veritabanında saklandığı için, sunucu çökse bile işlem kaybolmuyor, bu da sistemin dayanıklılığını (resilience) artırıyor."

## ---

**8\. Sonuç**

Önerilen **Nexus** projesi, 2026 yılı mezunu bir mühendis adayını, sektördeki "Junior" beklentisinin çok ötesine taşıyacak bir vizyon sunmaktadır. Bu proje, sadece modern teknolojileri (AI, Local-First, Durable Execution) kullanmakla kalmaz, aynı zamanda bu teknolojilerin çözdüğü temel bilgisayar bilimi problemlerine (Dağıtık Sistemler, Tutarlılık, Olasılıksal Programlama) hakimiyetinizi gösterir.

Bu yol haritasını disiplinli bir şekilde uygulamak, sadece etkileyici bir GitHub profili oluşturmanızı sağlamayacak, aynı zamanda sizi geleceğin yazılım mimarisi sorunlarını çözmeye hazır, vizyoner bir mühendis olarak konumlandıracaktır.

### ---

**Ek 1: Detaylı Teknoloji Entegrasyon Şeması**

Aşağıdaki tablo, projenin katmanları arasındaki veri akışını ve sorumluluk paylaşımını özetlemektedir.

| Katman | Sorumluluk | Teknoloji | Veri Akışı |
| :---- | :---- | :---- | :---- |
| **Kullanıcı Arayüzü** | Etkileşim, Gösterim, Optimistic Updates | Next.js, Shadcn, Tailwind | Zero Cache \<-\> UI Bileşenleri |
| **İstemci Veri Motoru** | Önbellekleme, Çakışma Algılama, Sorgulama | Zero Sync Client (WASM) | UI \<-\> IndexedDB \<-\> WebSocket |
| **Sunucu Senkronizasyonu** | Veri Doğrulama, İzinler, Upstream Sync | Zero Sync Server | WebSocket \<-\> PostgreSQL (WAL) |
| **İş Mantığı & AI** | Karar Verme, Harici API Çağrıları, Orkestrasyon | LangGraph (Node.js) | Temporal Worker \<-\> LLM API |
| **Orkestrasyon** | Durum Yönetimi, Retry, Saga, Zamanlama | Temporal Server | Next.js API \<-\> Temporal Server \<-\> Worker |
| **Depolama** | Kalıcı Veri, Vektörler, Kullanıcı Bilgileri | PostgreSQL (Supabase) | Zero Server \<-\> DB \<-\> Temporal Worker |

*Raporun sonu.*

#### **Alıntılanan çalışmalar**

1. 8 Hot Trends in Software Development Careers (2026 \- Updated) \- Crossover, erişim tarihi Ocak 16, 2026, [https://www.crossover.com/resources/8-hot-trends-in-software-development-careers-2025](https://www.crossover.com/resources/8-hot-trends-in-software-development-careers-2025)  
2. 2026 Will Be BRUTAL for Average Developers., erişim tarihi Ocak 16, 2026, [https://www.youtube.com/watch?v=3jJsRrvINSE](https://www.youtube.com/watch?v=3jJsRrvINSE)  
3. 2026 dev job market is straight-up cooked : r/cursor \- Reddit, erişim tarihi Ocak 16, 2026, [https://www.reddit.com/r/cursor/comments/1q3tab3/2026\_dev\_job\_market\_is\_straightup\_cooked/](https://www.reddit.com/r/cursor/comments/1q3tab3/2026_dev_job_market_is_straightup_cooked/)  
4. How to Land a Software Engineering Job in 2026 — Skills You MUST Learn Now, erişim tarihi Ocak 16, 2026, [https://www.youtube.com/watch?v=n5AXCBKrlvg](https://www.youtube.com/watch?v=n5AXCBKrlvg)  
5. Local-First App with Zero sync or ElectricSQL & TanStackDB · payloadcms payload · Discussion \#12506 \- GitHub, erişim tarihi Ocak 16, 2026, [https://github.com/payloadcms/payload/discussions/12506](https://github.com/payloadcms/payload/discussions/12506)  
6. Zero Docs, erişim tarihi Ocak 16, 2026, [https://zero.rocicorp.dev/](https://zero.rocicorp.dev/)  
7. TanStack Start vs Next.js, erişim tarihi Ocak 16, 2026, [https://tanstack.com/start/latest/docs/framework/react/start-vs-nextjs](https://tanstack.com/start/latest/docs/framework/react/start-vs-nextjs)  
8. Next.js 16 vs. TanStack Start for E-commerce \- Crystallize.com, erişim tarihi Ocak 16, 2026, [https://crystallize.com/blog/next-vs-tanstack-start](https://crystallize.com/blog/next-vs-tanstack-start)  
9. The Complete Full-Stack Developer Roadmap for 2026 \- DEV Community, erişim tarihi Ocak 16, 2026, [https://dev.to/thebitforge/the-complete-full-stack-developer-roadmap-for-2026-2i0j](https://dev.to/thebitforge/the-complete-full-stack-developer-roadmap-for-2026-2i0j)  
10. arnobt78/Ecommerce-Platform--NextJS-Serverless-FullStack: A beautifully designed, high-performance e-commerce platform built with Next.js 14, TypeScript, Prisma, NeonDB, Vercel Blob Storage, Clerk authentication, Stripe payments, and shadcn/ui. Next Store offers a seamless online shopping experience with fast \- GitHub, erişim tarihi Ocak 16, 2026, [https://github.com/arnobt78/Ecommerce-Platform--NextJS-Serverless-FullStack](https://github.com/arnobt78/Ecommerce-Platform--NextJS-Serverless-FullStack)  
11. Onix 2026 AI trends: Multi-agent systems redefine enterprise workflows, erişim tarihi Ocak 16, 2026, [https://timesofindia.indiatimes.com/technology/tech-news/onix-2026-ai-trends-multi-agent-systems-redefine-enterprise-workflows/articleshow/126487254.cms](https://timesofindia.indiatimes.com/technology/tech-news/onix-2026-ai-trends-multi-agent-systems-redefine-enterprise-workflows/articleshow/126487254.cms)  
12. Agentic AI \#3 — Top AI Agent Frameworks in 2025: LangChain, AutoGen, CrewAI & Beyond | by Aman Raghuvanshi | Medium, erişim tarihi Ocak 16, 2026, [https://medium.com/@iamanraghuvanshi/agentic-ai-3-top-ai-agent-frameworks-in-2025-langchain-autogen-crewai-beyond-2fc3388e7dec](https://medium.com/@iamanraghuvanshi/agentic-ai-3-top-ai-agent-frameworks-in-2025-langchain-autogen-crewai-beyond-2fc3388e7dec)  
13. AutoGen vs. CrewAI vs. LangGraph vs. OpenAI Multi-Agents Framework \- Galileo AI, erişim tarihi Ocak 16, 2026, [https://galileo.ai/blog/autogen-vs-crewai-vs-langgraph-vs-openai-agents-framework](https://galileo.ai/blog/autogen-vs-crewai-vs-langgraph-vs-openai-agents-framework)  
14. Gartner Top 10 Strategic Technology Trends for 2026, erişim tarihi Ocak 16, 2026, [https://www.gartner.com/en/articles/top-technology-trends-2026](https://www.gartner.com/en/articles/top-technology-trends-2026)  
15. LangGraph vs AutoGen vs CrewAI: Complete AI Agent Framework Comparison \+ Architecture Analysis 2025 \- Latenode, erişim tarihi Ocak 16, 2026, [https://latenode.com/blog/platform-comparisons-alternatives/automation-platform-comparisons/langgraph-vs-autogen-vs-crewai-complete-ai-agent-framework-comparison-architecture-analysis-2025](https://latenode.com/blog/platform-comparisons-alternatives/automation-platform-comparisons/langgraph-vs-autogen-vs-crewai-complete-ai-agent-framework-comparison-architecture-analysis-2025)  
16. Mastering Saga patterns for distributed transactions in microservices \- Temporal, erişim tarihi Ocak 16, 2026, [https://temporal.io/blog/mastering-saga-patterns-for-distributed-transactions-in-microservices](https://temporal.io/blog/mastering-saga-patterns-for-distributed-transactions-in-microservices)  
17. Transactions in Microservices: Part 3 \- SAGA Pattern with Orchestration and Temporal.io., erişim tarihi Ocak 16, 2026, [https://dev.to/federico\_bevione/transactions-in-microservices-part-3-saga-pattern-with-orchestration-and-temporalio-3e17](https://dev.to/federico_bevione/transactions-in-microservices-part-3-saga-pattern-with-orchestration-and-temporalio-3e17)  
18. Build a one-click order application with TypeScript and Next.js \- Learn Temporal, erişim tarihi Ocak 16, 2026, [https://learn.temporal.io/tutorials/typescript/build-one-click-order-app-nextjs/](https://learn.temporal.io/tutorials/typescript/build-one-click-order-app-nextjs/)  
19. Why developers are leaving Next.js for TanStack Start, and loving it \- Appwrite, erişim tarihi Ocak 16, 2026, [https://appwrite.io/blog/post/why-developers-leaving-nextjs-tanstack-start](https://appwrite.io/blog/post/why-developers-leaving-nextjs-tanstack-start)  
20. Building a local-first web application with Bun, React, Tailwind CSS, PouchDB and CouchDB, erişim tarihi Ocak 16, 2026, [https://laidrivm.com/how-i-built-mellon-part-1](https://laidrivm.com/how-i-built-mellon-part-1)  
21. Lab notes \#021 CRDTs in depth and AI explaining code \- Interjected Future, erişim tarihi Ocak 16, 2026, [https://interjectedfuture.com/lab-notes/lab-notes-021-crdt-in-depth/](https://interjectedfuture.com/lab-notes/lab-notes-021-crdt-in-depth/)  
22. Comparing Open-Source AI Agent Frameworks \- Langfuse Blog, erişim tarihi Ocak 16, 2026, [https://langfuse.com/blog/2025-03-19-ai-agent-comparison](https://langfuse.com/blog/2025-03-19-ai-agent-comparison)  
23. A Detailed Comparison of Top 6 AI Agent Frameworks in 2025 \- Turing, erişim tarihi Ocak 16, 2026, [https://www.turing.com/resources/ai-agent-frameworks](https://www.turing.com/resources/ai-agent-frameworks)  
24. Saga Design Pattern Explained for Distributed Systems \- Temporal, erişim tarihi Ocak 16, 2026, [https://temporal.io/blog/saga-pattern-made-easy](https://temporal.io/blog/saga-pattern-made-easy)  
25. Goodbye Next.js? My New React Stack for 2026 | by Aldi Alfarnando | Dec, 2025 \- Medium, erişim tarihi Ocak 16, 2026, [https://medium.com/@aldiiii/goodbye-next-js-my-new-react-stack-for-2026-860658b7db90](https://medium.com/@aldiiii/goodbye-next-js-my-new-react-stack-for-2026-860658b7db90)  
26. Guides: OpenTelemetry | Next.js, erişim tarihi Ocak 16, 2026, [https://nextjs.org/docs/app/guides/open-telemetry](https://nextjs.org/docs/app/guides/open-telemetry)  
27. 8 RAG Architecture Diagrams You Need to Master in 2025 \- Software Development Hub, erişim tarihi Ocak 16, 2026, [https://sdh.global/blog/development/8-rag-architecture-diagrams-you-need-to-master-in-2025/](https://sdh.global/blog/development/8-rag-architecture-diagrams-you-need-to-master-in-2025/)  
28. Advanced RAG Techniques for High-Performance LLM Applications \- Graph Database & Analytics \- Neo4j, erişim tarihi Ocak 16, 2026, [https://neo4j.com/blog/genai/advanced-rag-techniques/](https://neo4j.com/blog/genai/advanced-rag-techniques/)  
29. Implementing A Flavor of Corrective RAG using Langchain, Chromadb , Zephyr-7B-Beta and OpenAI | by Plaban Nayak | The AI Forum | Medium, erişim tarihi Ocak 16, 2026, [https://medium.com/the-ai-forum/implementing-a-flavor-of-corrective-rag-using-langchain-chromadb-zephyr-7b-beta-and-openai-30d63e222563](https://medium.com/the-ai-forum/implementing-a-flavor-of-corrective-rag-using-langchain-chromadb-zephyr-7b-beta-and-openai-30d63e222563)  
30. An in-depth guide to monitoring Next.js apps with OpenTelemetry \- Checkly, erişim tarihi Ocak 16, 2026, [https://www.checklyhq.com/blog/in-depth-guide-to-monitoring-next-js-apps-with-opentelemetry/](https://www.checklyhq.com/blog/in-depth-guide-to-monitoring-next-js-apps-with-opentelemetry/)  
31. matiassingers/awesome-readme \- GitHub, erişim tarihi Ocak 16, 2026, [https://github.com/matiassingers/awesome-readme](https://github.com/matiassingers/awesome-readme)  
32. C4 model: Home, erişim tarihi Ocak 16, 2026, [https://c4model.com/](https://c4model.com/)  
33. erişim tarihi Ocak 16, 2026, [https://www.resumeadapter.com/blog/ai-engineer-resume-keywords](https://www.resumeadapter.com/blog/ai-engineer-resume-keywords)