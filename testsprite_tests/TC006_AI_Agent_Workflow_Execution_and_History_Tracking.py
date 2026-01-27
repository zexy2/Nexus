import asyncio
from playwright import async_api
from playwright.async_api import expect

async def run_test():
    pw = None
    browser = None
    context = None
    
    try:
        # Start a Playwright session in asynchronous mode
        pw = await async_api.async_playwright().start()
        
        # Launch a Chromium browser in headless mode with custom arguments
        browser = await pw.chromium.launch(
            headless=True,
            args=[
                "--window-size=1280,720",         # Set the browser window size
                "--disable-dev-shm-usage",        # Avoid using /dev/shm which can cause issues in containers
                "--ipc=host",                     # Use host-level IPC for better stability
                "--single-process"                # Run the browser in a single process mode
            ],
        )
        
        # Create a new browser context (like an incognito window)
        context = await browser.new_context()
        context.set_default_timeout(5000)
        
        # Open a new page in the browser context
        page = await context.new_page()
        
        # Navigate to your target URL and wait until the network request is committed
        await page.goto("http://localhost:3000", wait_until="commit", timeout=10000)
        
        # Wait for the main page to reach DOMContentLoaded state (optional for stability)
        try:
            await page.wait_for_load_state("domcontentloaded", timeout=3000)
        except async_api.Error:
            pass
        
        # Iterate through all iframes and wait for them to load as well
        for frame in page.frames:
            try:
                await frame.wait_for_load_state("domcontentloaded", timeout=3000)
            except async_api.Error:
                pass
        
        # Interact with the page elements to simulate user flow
        # -> Navigate to AI agents page
        frame = context.pages[-1]
        # Click 'Get Started' to navigate to AI agents page or relevant starting point
        elem = frame.locator('xpath=html/body/div[2]/header/nav/div[2]/a[2]').nth(0)
        await page.wait_for_timeout(3000); await elem.click(timeout=5000)
        

        # -> Click on 'Agents' link to go to AI agents page
        frame = context.pages[-1]
        # Click 'Agents' link in the navigation bar to go to AI agents page
        elem = frame.locator('xpath=html/body/div[2]/div[5]/nav/a[5]').nth(0)
        await page.wait_for_timeout(3000); await elem.click(timeout=5000)
        

        # -> Click the 'Devam' button (index 2) to dismiss the welcome modal and access the workflow list.
        frame = context.pages[-1]
        # Click 'Devam' button to dismiss the welcome modal
        elem = frame.locator('xpath=html/body/div[2]/div[2]/div[2]/div[3]/button[2]').nth(0)
        await page.wait_for_timeout(3000); await elem.click(timeout=5000)
        

        # -> Input workspace name and click 'Devam' button (index 4) to create workspace and proceed to workflow selection.
        frame = context.pages[-1]
        # Input workspace name in the workspace creation modal
        elem = frame.locator('xpath=html/body/div[2]/div[2]/div[2]/div[2]/div[2]/div[2]/div/input').nth(0)
        await page.wait_for_timeout(3000); await elem.fill('Test Workspace')
        

        frame = context.pages[-1]
        # Click 'Devam' button to create workspace and proceed
        elem = frame.locator('xpath=html/body/div[2]/div[2]/div[2]/div[3]/button[2]').nth(0)
        await page.wait_for_timeout(3000); await elem.click(timeout=5000)
        

        # -> Select a workflow by clicking on an AI agent button (index 2 Researcher) and then click 'Devam' button (index 7) to proceed.
        frame = context.pages[-1]
        # Select 'Araştırma Ajanı' (Researcher AI agent) workflow
        elem = frame.locator('xpath=html/body/div[2]/div[2]/div[2]/div[2]/div[2]/div[2]/button').nth(0)
        await page.wait_for_timeout(3000); await elem.click(timeout=5000)
        

        frame = context.pages[-1]
        # Click 'Devam' button to proceed with selected workflow
        elem = frame.locator('xpath=html/body/div[2]/div[2]/div[2]/div[3]/button[2]').nth(0)
        await page.wait_for_timeout(3000); await elem.click(timeout=5000)
        

        # -> Click 'Devam' button to proceed to workflow execution screen.
        frame = context.pages[-1]
        # Click 'Devam' button to proceed from preferences to workflow execution
        elem = frame.locator('xpath=html/body/div[2]/div[2]/div[2]/div[3]/button[2]').nth(0)
        await page.wait_for_timeout(3000); await elem.click(timeout=5000)
        

        # -> Click 'Başla' button (index 3) to start the workflow execution and monitor real-time progress.
        frame = context.pages[-1]
        # Click 'Başla' button to start workflow execution
        elem = frame.locator('xpath=html/body/div[2]/div[2]/div[2]/div[3]/button[2]').nth(0)
        await page.wait_for_timeout(3000); await elem.click(timeout=5000)
        

        # -> Click 'New Workflow' button (index 8) to start a new workflow and verify real-time progress display.
        frame = context.pages[-1]
        # Click 'New Workflow' button to start a new workflow and test execution
        elem = frame.locator('xpath=html/body/div[2]/main/div/div/section/div/div[2]/button').nth(0)
        await page.wait_for_timeout(3000); await elem.click(timeout=5000)
        

        # -> Select 'Document Generation' workflow type (index 2), enter topic, select format, enter additional context, and click 'Launch Workflow' button (index 10) to start workflow execution.
        frame = context.pages[-1]
        # Select 'Document Generation' workflow type
        elem = frame.locator('xpath=html/body/div[4]/div[2]/div/div/button').nth(0)
        await page.wait_for_timeout(3000); await elem.click(timeout=5000)
        

        frame = context.pages[-1]
        # Enter topic for the workflow
        elem = frame.locator('xpath=html/body/div[4]/div[2]/div[2]/div/input').nth(0)
        await page.wait_for_timeout(3000); await elem.fill('AI testing workflow')
        

        frame = context.pages[-1]
        # Open format dropdown to select format
        elem = frame.locator('xpath=html/body/div[4]/div[2]/div[2]/div[2]/button').nth(0)
        await page.wait_for_timeout(3000); await elem.click(timeout=5000)
        

        # -> Select 'Article' format (index 3) and click 'Launch Workflow' button (index 10) to start workflow execution.
        frame = context.pages[-1]
        # Select 'Article' format from dropdown
        elem = frame.locator('xpath=html/body/div[5]/div/div/div[2]').nth(0)
        await page.wait_for_timeout(3000); await elem.click(timeout=5000)
        

        # -> Click 'Launch Workflow' button (index 10) to start the workflow execution and verify real-time progress.
        frame = context.pages[-1]
        # Click 'Launch Workflow' button to start the workflow execution
        elem = frame.locator('xpath=html/body/div[4]/div[3]/button[2]').nth(0)
        await page.wait_for_timeout(3000); await elem.click(timeout=5000)
        

        # -> Click on 'Active Workflows' tab (index 11) to verify real-time progress display of the running workflow.
        frame = context.pages[-1]
        # Click 'Active Workflows' tab to view running workflows and verify real-time progress display
        elem = frame.locator('xpath=html/body/div[2]/main/div/div/section[3]/div/div/button[2]').nth(0)
        await page.wait_for_timeout(3000); await elem.click(timeout=5000)
        

        # -> Click 'Run Again' button (index 16) to re-run the completed workflow and verify re-execution and history update.
        frame = context.pages[-1]
        # Click 'Run Again' button to re-run the completed workflow
        elem = frame.locator('xpath=html/body/div[2]/main/div/div/section[3]/div/div[3]/div[2]/div/div[2]/div/div[2]/button[2]').nth(0)
        await page.wait_for_timeout(3000); await elem.click(timeout=5000)
        

        # --> Assertions to verify final state
        frame = context.pages[-1]
        await expect(frame.locator('text=AI Agents').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=5 agents active • 0 workflows running').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=New Workflow').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=Total Executions').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=2').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=Completed Today').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=2').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=Success Rate').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=100%').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=Document Generation').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=Started 11:30:26 PM • 28.3s').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=Completed').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=✓ ## Yapay Zeka Test İş Akışı: Güvenilir ve Etkili Yapay Zeka Sistemleri OluşturmaYapay zeka (YZ) günümüzün en dönüştürücü teknolojilerinden biri olarak hayatımızın her alanına nüfuz etmektedir. Finanstan sağlığa, otomotivden e-ticarete kadar pek çok sektörde YZ destekli çözümler, verimliliği artırmakta ve yenilikçi deneyimler sunmaktadır. Ancak bu hızlı büyüme, beraberinde ciddi test ve doğrulama ihtiyacını da getirmektedir. Geleneksel yazılım test yöntemleri, YZ'nin kendine özgü doğası, veri odaklılığı ve bazen öngörülemeyen davranışları nedeniyle yetersiz kalmaktadır. Bu nedenle, güvenilir, adil ve etkili YZ sistemleri geliştirmek için özel olarak tasarlanmış bir YZ test iş akışına ihtiyaç duyulmaktadır.Bu makalede, bir YZ modelinin fikirden dağıtıma ve sonrasına kadar tüm yaşam döngüsünü kapsayan kapsamlı bir YZ test iş akışını detaylı bir şekilde inceleyeceğiz.### Yapay Zeka Testinin Temel ZorluklarıYZ testi, geleneksel yazılım testinden ayrılan temel zorluklara sahiptir:1. **Veri Bağımlılığı:** YZ modelleri verilerle öğrenir. Veri kalitesi (gürültü, eksiklik), miktarı ve veri setinin temsil gücü (yanlılık) doğrudan modelin performansını ve güvenilirliğini etkiler.2. **Modelin Karmaşıklığı ve Açıklanabilirlik Eksikliği (Kara Kutu Problemi):** Özellikle derin öğrenme modelleri, kararlarının nasıl alındığını anlamayı zorlaştıran karmaşık yapılara sahiptir. Bu, hataların nedenlerini tespit etmeyi güçleştirir.3. **Nondeterministik Doğa:** Aynı girdilerle bile YZ modelleri, özellikle sürekli öğrenen sistemlerde, bazen farklı çıktılar üretebilir. Bu durum, beklenti bazlı testleri zorlaştırır.4. **Etik ve Yanlılık Sorunları:** Eğitim verilerindeki insan yanlılıkları, modelin ayrımcı veya haksız kararlar almasına yol açabilir. Bu durum, sosyal ve yasal riskler taşır.5. **Sürekli Öğrenme ve Adaptasyon:** Canlı sistemlerde YZ modelleri gerçek zamanlı verilerle sürekli öğrenerek adapte olabilir. Bu, modelin zamanla performansının değişebileceği ve sürekli izleme gerektirdiği anlamına gelir.6. **Performans ve Ölçeklenebilirlik:** YZ modellerinin yüksek işlem gücü ve bellek ihtiyacı, performans testlerini kritik hale getirir.### Yapay Zeka Test İş Akışının AşamalarıBir YZ projesinin başarılı olması için test süreci, projenin her aşamasına entegre edilmelidir. İşte adım adım YZ test iş akışı:#### Aşama 1: Planlama ve Strateji BelirlemeHer başarılı projenin temelinde iyi bir planlama yatar. YZ testinde bu aşama, modelin hedeflerinin, beklentilerinin ve potansiyel risklerinin anlaşılmasını içerir.* **Test Hedeflerini Tanımlama:** Modelin temel amacı nedir? Hangi metriklerle başarı ölçülecek? (Doğruluk, kesinlik, hatırlama, F1 skoru, MSE, RMSE, adalet metrikleri vb.).* **Test Senaryoları ve Kriterleri:** Hangi senaryolarda modelin nasıl davranması bekleniyor? Başarılı bir testin kabul kriterleri nelerdir? Kenar durumlar (edge cases) ve zorlu senaryolar belirlenmelidir.* **Veri İhtiyaçlarını Anlama:** Modeli eğitmek ve test etmek için ne tür verilere ihtiyaç var? Veri kaynakları, formatları ve kalitesi hakkında ön analiz yapılmalıdır.* **Etik ve Yasal Gereksinimler:** Modelin potansiyel yanlılıkları, gizlilik endişeleri veya düzenleyici gereklilikler (GDPR, HIPAA vb.) baştan belirlenmeli ve test stratejisine dahil edilmelidir.* **Araç ve Teknoloji Seçimi:** Test otomasyonu, veri doğrulama, model değerlendirme, yanlılık tespiti ve izleme için kullanılacak araçlar ve platformlar belirlenir.#### Aşama 2: Veri Hazırlığı ve Test Verisi OluşturmaYZ modelleri "veri yer", bu yüzden verinin kalitesi testin başarısının anahtarıdır.* **Veri Toplama ve Entegrasyon:** Gerekli verilerin çeşitli kaynaklardan toplanması ve bir araya getirilmesi.* **Veri Temizleme ve Önişleme:** Eksik değerleri doldurma, hatalı verileri düzeltme, gürültüyü azaltma, veri formatlarını standartlaştırma (normalizasyon/standardizasyon).* **Veri Etiketleme:** Denetimli öğrenme modelleri için verilerin doğru bir şekilde etiketlenmesi (manuel veya otomatik araçlarla). Bu sürecin kalitesi modelin performansını doğrudan etkiler.* **Eğitim, Doğrulama ve Test Setlerinin Oluşturulması:** Toplanan veriler, modelin eğitimi için "eğitim seti", hiperparametre ayarı ve ön değerlendirme için "doğrulama seti" ve nihai performans değerlendirmesi için "test seti" olmak üzere ayrılır. Test seti, modelin görmediği, gerçek dünya verilerini temsil eden bir subset olmalıdır.* **Veri Setinde Yanlılık Tespiti ve Azaltılması:** Veri setinin farklı demografik grupları, sınıfları veya koşulları eşit şekilde temsil edip etmediği kontrol edilir. Gerekirse yanlılıkları azaltmak için örnekleme, yeniden ağırlıklandırma veya veri büyütme teknikleri kullanılır.* **Sentetik Veri Üretimi ve Veri Büyütme (Data Augmentation):** Yetersiz veya hassas veri durumlarında, sentetik veri üreterek veya mevcut veriyi çeşitlendirerek (görsel veride döndürme, çevirme; metin verisinde eş anlamlı kelime değişimi) test kapsamı genişletilir.#### Aşama 3: Model Testi ve Değerlendirme (Çekirdek Test)Bu aşama, modelin performansını ve güvenilirliğini çeşitli boyutlarda derinlemesine değerlendirir.* **Birim Testleri:** Modelin ayrı ayrı bileşenlerini (örneğin, bir sinir ağının belirli bir katmanı, bir özellik mühendisliği fonksiyonu) doğru çalışıp çalışmadığını test etme.* **Entegrasyon Testleri:** Modelin farklı modüllerinin birbiriyle ve diğer sistemlerle (örneğin, veri tabanı, API'ler) uyumlu bir şekilde çalışıp çalışmadığını test etme.* **Fonksiyonel Testler:** * **Doğruluk ve Performans Metrikleri:** Modelin ana görevindeki başarısını ölçen metrikler (Accuracy, Precision, Recall, F1-Score, ROC AUC, MSE, RMSE vb.) test seti üzerinde hesaplanır. * **Sınıflandırma/Regresyon Özel Testleri:** Sınıflandırma modelleri için hata matrisi analizi, regresyon modelleri için kalıntı analizi yapılır.* **Sağlamlık Testleri (Robustness Testing):** Modelin küçük, kasıtlı veya rastgele girdilerdeki değişikliklere karşı ne kadar dayanıklı olduğunu test eder. * **Düşmanca Saldırılar (Adversarial Attacks):** Modelin, insan gözüyle fark edilemeyen ancak modelin kararlarını saptırabilen "düşmanca örnekler"e karşı dayanıklılığı test edilir. * **Gürültülü Veri Toleransı:** Modelin eksik veya gürültülü verilere karşı ne kadar iyi performans gösterdiği değerlendirilir. * **Kenar Durum Testleri:** Beklenmedik veya nadir durumlar için modelin davranışları incelenir.* **Yanlılık ve Adalet Testleri (Bias & Fairness Testing):** Modelin farklı demografik gruplar (cinsiyet, ırk, yaş vb.) veya diğer hassas özellikler üzerindeki performans farklılıkları ölçülür. Adalet metrikleri (örn. Statistical Parity, Equal Opportunity) kullanılarak potansiyel ayrımcılık tespit edilir.* **Açıklanabilirlik Testleri (Explainability Testing - XAI):** Özellikle kritik uygulamalarda, modelin bir kararını nasıl aldığını anlamak önemlidir. LIME, SHAP gibi araçlarla modelin "kara kutu" doğası anlaşılmaya çalışılır ve kararlarının mantığı sorgulanır.* **Performans ve Ölçeklenebilirlik Testleri:** * **Çıkarım Hızı (Latency):** Modelin bir tahmin üretme süresi. * **Kaynak Tüketimi:** Modelin CPU/GPU, bellek ve disk gibi sistem kaynaklarını ne kadar kullandığı. * **Yük Testi ve Stres Testi:** Yüksek kullanıcı trafiği veya veri akışı altında modelin nasıl davrandığı test edilir.#### Aşama 4: Dağıtım Öncesi Testler (Pre-Deployment Testing)Modelin üretim ortamına alınmadan önceki son kontrolleri bu aşamada yapılır.* **Uçtan Uca Testler (End-to-End Testing):** YZ modelinin bir sistemin parçası olarak (örneğin, bir mobil uygulama veya web hizmeti içinde) tüm süreci test etme. Veri girişi, model çıkarımı, sonuçların sunumu ve diğer sistemlerle entegrasyon kontrol edilir.* **Kullanıcı Kabul Testleri (UAT):** Son kullanıcıların veya iş sahiplerinin, modelin iş beklentilerini karşıladığını ve kullanım senaryolarında doğru çalıştığını doğruladığı aşama.* **Güvenlik Testleri:** Modelin kendisi veya modelin entegre olduğu sistemdeki potansiyel güvenlik açıkları (veri sızıntısı, model zehirlenmesi) test edilir.* **Sürüm Yönetimi ve Model Kayıt Testleri:** Modelin versiyonlarının doğru yönetildiği, izlenebildiği ve gerektiğinde geri alınabilir olduğu doğrulanır.#### Aşama 5: Dağıtım ve İzleme (Post-Deployment & Monitoring)YZ test iş akışı, modelin dağıtılmasıyla sona ermez; aksine, sürekli bir izleme ve iyileştirme döngüsü başlar.* **A/B Testleri ve Kanarya Dağıtımları:** Yeni bir modelin küçük bir kullanıcı grubu üzerinde canlı ortamda test edilmesi. Bu sayede olası negatif etkiler sınırlı tutulur ve model performansı gerçek koşullarda ölçülür.* **Canlı İzleme (Live Monitoring):** Modelin üretim ortamındaki gerçek dünya verileri üzerindeki performansının sürekli olarak izlenmesi. * **Veri Kayması (Data Drift) Tespiti:** Üretim verilerinin dağılımının eğitim verilerinden farklılaşması. * **Model Kayması (Model Drift) Tespiti:** Veri kayması veya değişen dünya koşulları nedeniyle modelin performansının zamanla düşmesi. * **Anomali Tespiti:** Modelin beklenmedik veya anormal davranışlarının belirlenmesi.* **Geri Bildirim Döngüsü:** Kullanıcı geri bildirimlerinin toplanması ve modelin sürekli iyileştirilmesi için kullanılması. Bu geri bildirimler, yeni eğitim verisi olarak da kullanılabilir.* **Yeniden Eğitim ve Bakım:** Model kayması tespit edildiğinde veya yeni verilerle daha iyi performans sağlanabileceği anlaşıldığında, modelin yeniden eğitilmesi, güncellenmesi ve tekrar dağıtılması süreci.### AI Test Araçları ve TeknolojileriYZ testini destekleyen birçok araç ve teknoloji bulunmaktadır:* **Veri Doğrulama ve Temizleme:** Great Expectations, Deequ* **Model Performans Değerlendirme:** Scikit-learn, TensorFlow, PyTorch, MLflow* **Adversarial Attack Araçları:** CleverHans, Foolbox, ART (Adversarial Robustness Toolbox)* **Yanlılık ve Adalet Tespit Araçları:** AI Fairness 360 (IBM), What-If Tool (Google), Fairlearn (Microsoft)* **Açıklanabilirlik Araçları (XAI):** LIME, SHAP, Captum* **MLOps Platformları:** Kubeflow, MLflow, AWS Sagemaker, Google AI Platform, Azure Machine Learning* **İzleme ve Gözlemleme:** Prometheus, Grafana, Evidently AI, WhyLabs### En İyi Uygulamalar (Best Practices)Güçlü bir YZ test iş akışı için bazı en iyi uygulamalar:* **Test Otomasyonu:** Tekrarlayan test görevlerini otomatikleştirmek, zaman kazandırır ve hata olasılığını azaltır.* **Versiyon Kontrolü (Veri ve Model İçin):** Sadece kodun değil, eğitim ve test verilerinin, model parametrelerinin ve çıkan model dosyalarının da versiyonlanması.* **Sürekli Entegrasyon/Sürekli Dağıtım (CI/CD) Pipelines:** YZ sistemlerini geleneksel yazılım gibi CI/CD süreçlerine entegre etmek, modelin güvenilir bir şekilde geliştirilmesini ve dağıtılmasını sağlar.* **Testin Yaşam Döngüsünün Her Aşamasına Ente...
        await asyncio.sleep(5)
    
    finally:
        if context:
            await context.close()
        if browser:
            await browser.close()
        if pw:
            await pw.stop()
            
asyncio.run(run_test())
    