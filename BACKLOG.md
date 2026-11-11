# BACKLOG.md — Güncel durum, açık işler ve kararlar

Son güncelleme: **2026-11-12**. Tek durum belgesidir: güncel durum, açık kararlar, pilot kapıları,
teknik borç ve ertelenmiş işler. Tamamlanan madde silinir; geçmiş Git'tedir. Çalışma günlüğü
tutulmaz. Faz içindeki adımlar faz planındadır (`docs/fazN-plan.md`); kararların gerekçesi
`docs/decisions.md`'dedir.

## Güncel durum

Faz 0 (iskelet, veritabanı, yerel ortam, tasarım sistemi, ekip araçları), Faz 1 (çekirdek, tamamlayıcılar ve SSS ekranları dahil) ve
Faz 2'nin (fırsatlar, mevcut veriden değer, rehberlik, tanınma; `docs/faz2-plan.md`) adımları main'dedir; iki ekran eksiği tamamlama olarak sürüyor (aşağıda "Yakın hedef"). Canlı ortam
yoktur ve bilinçli ertelenmiştir: geliştirme, test ve ekran doğrulaması yerelde, birleştirme kapıları yerelde; CI az ve öz (≤ 5 dk, K-14
kararı, `docs/engineering.md` "CI"). Faz 2'nin kalan iki kalemi bitince kullanıcının komple test ve deneme turu başlar (`docs/engineering.md` "Faz 2 deneme rehberi"). Ürün özellikleri aşağıdaki gibi çalışır; ayrıntı ve gerekçe `docs/decisions.md`'dedir.

### Faz 1'de main'de olanlar

- **Kimlik, üyelik, yetki (P1-01, P1-02):** kullanıcı, üyelik, yönetici yetkisi (bölüm/fakülte/sistem), işlem kaydı,
  yetki korumaları, rol geçişi, sınıf kuralı; Better Auth ile e-posta bağlantısı girişi, e-posta değiştirme, alan adı
  ile üyelik beyanı, mezun belgesi akışı (karar anında dosya silinir), askıya alma, test girişi (yalnız local/test).
- **KVKK ve kontrollü iletişim (P1-03):** sürümlü rıza, alan görünürlüğü, iletişim talepleri, hesap silme/anonimleştirme,
  kişisel veri dökümü; hukuki metinler taslaktır.
- **İlk giriş ve profil (P1-04, P1-06):** kalıcı başlangıç adımları, profil yüzdesi (tek kaynak `rules/profileCompletion`),
  K-08 mentor eşiği; profil düzenleme, beceri etiketleri, izinli bağlantılar; başkasının profili görünürlük süzgeçli.
- **CV hattı (P1-05):** PDF denetimi, `cv.parse` işi, sözlük eşleme, fark/onay ekranı, staj davetleri, saklama kuralları.
  Sağlayıcıdan bağımsızdır: `LLM_PROVIDER` boşsa özellik kapalı, `fake` yalnız local/test.
- **Deneyim ve arama (P1-07, P1-08):** tür bazlı deneyim, anonim çıktı, kapsamlı moderasyon, şikâyet; Türkçe tam metin +
  yazım hatası toleranslı arama, süzgeçler, K-07 üniversite görünürlüğü.
- **Mentor ve randevu (P1-09, P1-10):** mentor dizini, "benzer yol izleyenler", mentor ayarları (kapasite, müsaitlik),
  slot seçimi, talep → onay/ret/iptal, D11 zaman aşımı, exclusion constraint, `.ics`, hatırlatma, elle link; takvim
  adaptörü yalnız sahte (`CALENDAR_PROVIDER=fake`, boşsa kapalı).
- **Yönetim (P1-11, P1-13, P1-18'in davet kısmı):** panel (kullanıcılar, askı, üyelik düzeltme, yönetici atama, şikâyet,
  belge kuyruğu, deneyim moderasyonu, sözlük/eşleşmeyen değer, işlem kaydı), mezun istihdam raporu ve kullanım
  metrikleri (Excel, küçük hücre bastırma), toplu davet (şifreli niyet).
- **Bildirimler (P1-12):** tercihler, yıllık doğrulama, hatırlatmalar; bildirim niyeti işlemle aynı veritabanı
  işleminde yazılır (outbox), e-posta ayrı worker'da gider; çözülemeyen niyet beş denemeden (1/2/4/8 dk) sonra yükü
  temizlenmiş kalıcı hataya düşer ve diğer niyetleri engellemez.
- **Zamanlanmış bakım:** süresi geçmiş oturum/doğrulama kayıtları ve 24 ayı geçen olayların kullanıcı bağı günlük işlerle
  temizlenir; dosya temizliği, görüşme formu hatırlatması ve puan işleri worker'dadır.
- **Tamamlayıcılar (P1-14, P1-15, P1-16):** görüşme sonrası form ve güvenilirlik göstergesi; CV inceleme talebi (14 gün);
  puan motoru (ikili tavan, azalan çarpan, gecikmeli puan, şüphe taraması, geriye dönük hesaplama, kurucu üye etiketi),
  profilde katkı puanı ve `/yonetim/puan`.
- **Canlıya alım altyapısı (P1-18):** çok aşamalı Dockerfile, başlangıçta `migrate deploy`, worker, kalıcı hacim, `/api/health`,
  yedek ve geri yükleme betikleri; canlıda test girişi ve `/ui-ornekleri` kapalıdır.
- **Ana sayfa ve ortak ekran davranışları:** girişli kullanıcıya rol bazlı kişisel pano; beklenen durumlar için ortak durum
  ekranı; ekran klavyesi açıkken alt gezinme/eylem çubuğu davranışı.
- **SSS (P1-17):** talep (hız sınırlı, benzer soru kapısı), mentor cevabı, moderatör yayın/ret/yönlendirme (yayında kimlik yok),
  arama, yayında puan ve bildirim; ekranları da main'dedir (sayfa/arama, talep, mentor cevabı, yönetim moderasyonu); kullanım olayları bağlı.

### Faz 2'de main'de olanlar

- **İlanlar (P2-04, P2-05):** doğrulanmış mezun ve akademisyen ilan yazar (taslak, önizleme, bölüm yöneticisi moderasyonu, en çok 60 gün,
  süre dolunca kendiliğinden kapanır; ilan puanı yayından 7 gün sonra kesinleşir, ayda 3 ilan puan getirir). Öğrenciye profiline uyan
  ilanlar ana sayfada "Sana uyan ilanlar" olarak görünür; e-posta özeti günde en çok bir, haftada en çok 3. İlan sahibi eşleşenleri görmez,
  yalnız "N kişiye ulaştı" sayısını görür.
- **Ters yönlü arama (P2-06):** öğrenci açık rızayla "İş arayanlara görün"ü açar; işe alım beyanlı doğrulanmış mezun "Aday bul" ile maskeli kart
  görür (ad, fotoğraf, iletişim yok); iletişim yalnız onaylı talepten sonra açılır (D7, kaynaktan bağımsız); hız sınırlı.
- **Referans (P2-03):** mezun beyanı → öğrenci onayı → yönetici onayı; "referansla kabul" aşaması; puanlar gecikmeli ve iptalde geri alınır.
- **Mevcut veriden değer (P2-09, P2-10, P2-11):** şirket sayfaları (puansız), mülakat soru bankası (türetilmiş, güvenli sayfalı), başvuru takvimi ve
  takip hatırlatması; hepsi k ≥ 3, anonim deneyimin yazarı hiçbir türev çıktıdan çıkarılamaz.
- **Rehber (P2-07, P2-08):** beceri açığı (hedef unvan sözlükten seçilir, k ≥ 5, bantlı sayılar); seçmeli ders rehberi (YBS'nin 89 dersi, mezun işaretleri).
- **Tanınma (P2-01, P2-02):** Yılın Mezunu (akademik yıl, törenden 30 gün önce dondurulan aday listesi, bölüm yöneticisi kararı, rızalı herkese açık
  doğrulama sayfası, LinkedIn "Add to Profile" bağlantısı); ayın mezunu kariyer hikâyeleri.
- **Topluluk (P2-12, P2-13):** yönetici onaylı etkinlik, kayıt, QR ya da 6 haneli kısa ömürlü kodla katılım doğrulama (gecikmeli puan); kişiselleştirilmiş
  aylık özet e-postası (yönetim önizlemesi, imzalı tek tıkla çıkış).
- **Faz 2 sırasında eklenenler:** marka paleti (İris + Mercan) ve koyu tema, tanıtım sayfası, LinkedIn PDF içe aktarma, Google Takvim/Meet adaptörü
  (anahtarlar gelince açılır; yerelde sahte takvim), CI (≤ 5 dk), SSS ekranları, Safari (WebKit) turu ve kaydırma kilidi, erişilebilirlik turu ve
  giderilen bulgular, mobil ve metin turları, e-posta markalaması.
- **Sertleştirme (P2-14):** deneme verisi (seed), performans bütçesi (10× veride tüm p95 ≤ 35 ms), etkinlik puanı geriye dönük hesabı, migration geri alma
  tablosu (`docs/data.md`), test dayanıklılığı (`test:gate`), Faz 2 deneme rehberi (`docs/engineering.md`).

### Dış bağımlılık bekleyenler

Hiçbiri kodla çözülemez; her biri aşağıdaki işi engeller. Kullanıcı/hoca kararı ilgili adıma gelince sorulur.

| Bekleyen | Neyi engelliyor |
|---|---|
| E3 — LinkedIn uygulaması + doğrulanmış şirket sayfası | P1-02 kabulü: LinkedIn ile giriş (kod yolu var, sınanmadı) |
| K-04 — CV yapay zekâsı: kullanıcı kararı Gemini ücretsiz katman; API anahtarı kullanıcıdan gelecek, CV metni gönderilmeden önce kimlik bilgileri maskelenecek; gerçek adaptör yazılmadı (`LLM_PROVIDER` yalnız `fake`) | Gerçek CV ayrıştırma; TD-009 doğruluk tablosu |
| E4 — Google Cloud projesi + OAuth anahtarları (`korunan/google.env`) | P1-10 kabulü: gerçek takvim daveti ve Meet linki (adaptör ve panelden bağlama hazır; anahtarlar gelince `CALENDAR_PROVIDER=google` + `/yonetim/google`) |
| K-02 — sunucu ve dağıtım aracı; K-05 — canlı SMTP | Canlı ortam (PILOT-DEPLOY), gerçek e-posta teslimi |
| K-03 — veri sorumlusu ve yöneticiler; hoca onayı | PILOT-LEGAL, gerçek yönetici atamaları, canlı açılış |
| K-12 — pilot kimler, ne zaman, başarı ölçütleri | Pilot kararı, P1-18 başarı ölçütleri kutusu |
| Kurumsal kimlik ve platform hesabı (kullanıcı görevi, acelesiz) | LinkedIn kurum sayfası ve ödül paylaşımının kurum adı/kimliği (P2-01), canlı alan adı |
| Hukuki metinlerin üniversite KVKK birimi ya da bir hukukçu tarafından okunması | PILOT-LEGAL; belgeler resmî "siz" dilinde kalır, taslak hâli pilot ve deneme için yeterlidir |

### Yakın hedef

Faz 2'yi tamamlamak: ilan şikâyeti ekranları (plan P2-04: ilan sayfasında kullanıcı "Şikâyet et" düğmesi ve yönetimde şikâyet kuyruğu; servis ve testler hazır) ve
gruplu uygulama içi bildirim listesi (plan P2-05). Sonra kullanıcının Faz 2 deneme turu: `docs/engineering.md` "Faz 2 deneme rehberi" ve kapanış paketindeki telefon test listesi;
bulgular PM'de karta bölünür ya da bu belgeye borç olarak yazılır. Kullanıcının hesap isteyen işleri (Gemini anahtarı, Google Cloud anahtarları ve panelden bağlama, platform hesabı) ve
canlıya alım ile pilot kararları (K-02, K-05, K-03, K-12, hukuki okuma) kullanıcı gündeme getirince ele alınır. Faz 3 pilottan sonra konuşulur.

### Bilinen kısıtlar

- Para harcanmaz; yalnız kaçınılmaz küçük maliyet LLM API'sidir (CV ayrıştırma, sağlayıcıda harcama sınırıyla).
- Öğrenci e-posta alanı ölçüldü; personel alanı, YBS fakültesi ve program dili teyit bekliyor (K-06).
- CI az ve öz (K-14 kararı, ≤ 5 dk: tür, kalite, hızlı birim); veritabanı testleri, build ve e2e yerel PM birleştirme kapısındadır.

## Açık ürün kararları

“Kim” sütunu kararı kimin vereceğini söyler: **PM** ürün/UX kararını kendisi verir ve panoda
“📝 PM kararları”na yazar (kullanıcı değiştirebilir); **Kullanıcı** (hesap, para, repo) ve
**Hoca** (kullanıcı üzerinden) kararları ilgili adıma gelmeden sorulur, hepsi birden değil.
Karar verilince madde silinir ve gerekçe `docs/decisions.md`'ye yazılır.

| No | Karar | Kim | Öneri | Bekleyen |
|---|---|---|---|---|
| K-02 | Canlı sunucu ve dağıtım aracı | Kullanıcı | Üniversite sunucusu (hocaya sor) ya da ücretsiz bir seçenek | P1-18 |
| K-03 | Veri sorumlusu ve yöneticiler kim | Hoca | Hocaya sorulacak | P1-03, P1-18 |
| K-04 | LLM sağlayıcısı | Kullanıcı | PDF girdisi + yapılandırılmış çıktı + API verisini eğitimde kullanmama politikası olan ücretli API | P1-05 |
| K-05 | E-posta sağlayıcısı (canlı) | Kullanıcı | Üniversite SMTP'si; olmazsa ücretsiz katmanlı bir servis | P1-18 |
| K-06 | İÜ personel e-posta alanı, YBS'nin fakültesi ve program dili | PM ölçer, kullanıcı teyit eder | Geçici değerler `prisma/seed-data.ts`'te (`ogr.iu.edu.tr`, `istanbul.edu.tr`, İktisat Fakültesi); öğrenci alanı ölçüldü; kalanlar teyit bekler | P1-02 |
| K-11 | Şüphe eşiklerinin sayısal değerleri (ağırlıklar kararlı) | PM | `SUSPICION_THRESHOLDS` (40 puan/24 saat; 90 günde ≥ 15 puanın ≥ %60'ı ve ≥ 3 kaydı tek karşı taraftan; ≤ 60 sn eşzamanlı yanıt ≥ 3) | Pilot öncesi |
| K-12 | Pilot: kimler, ne zaman, başarı ölçütleri | Hoca | Hocayla | P1-18 |
| K-15 | Gelecekteki commit e-posta gizliliği | Kullanıcı | GitHub gizli adresi veya mevcut ayar | Yeni commit yapılandırması |

## Pilot öncesi kapılar

- [ ] **PILOT-LEGAL** Hukuki metinlerin (`docs/legal-drafts.md`) hoca/üniversite onayı, **canlıya almadan önce üniversite KVKK birimi ya da bir
  hukukçu okuması** ve yayın sürümünün köke taşınması. Önkoşul K-03.
- [ ] **PILOT-TEST** Manuel uçtan uca test planı Faz 1 tamamlayıcıları bitince
  `docs/faz1-plan.md` sonuna “Manuel test planı” bölümü olarak yazılır ve pilot öncesi bir kez
  koşulur.
- [ ] **PILOT-DEPLOY** Canlıya alım (P1-18). Önkoşul K-02, K-05.
- [ ] **PILOT-ROZET** Pilot bitince `FOUNDING_MEMBER_UNTIL` doldurulur (K-10; boşsa kurucu üye etiketi sürer).

## Teknik borç

Öncelik: **P0** pilot engeli · **P1** canlıya alım öncesi · **P2** ihtiyaç doğunca.

### Biçim

```text
- [ ] **TD-XXX** · P1 · <kısa başlık>
  Ne: <somut durum, dosya/satır>
  Neden borç: <risk ya da maliyet>
  Kapanış ölçütü: <ne olunca silinir>
```

### Açık borçlar

- [ ] **TD-009** · P1 · CV doğruluk tablosu sahte adaptörle, gerçek LLM ile değil
  Ne: 5 sentetik örnek CV + ölçüm düzeneği (`src/test/cv-accuracy.ts`) hazır; sahte adaptörde sonuç hat
  bütünlüğünü gösterir, LLM doğruluğunu değil. Gerçek adaptör yok (K-04, E: API anahtarı + harcama sınırı).
  Neden borç: P1-05 kabulündeki alan doğruluğu tablosu gerçek çıktıyla üretilmedi.
  Kapanış ölçütü: gerçek adaptör eklenir, aynı 5 örnekle tablo sonuç belgesine yazılır, veri politikası kaynakla doğrulanır.
- [ ] **TD-013** · P2 · `UserSkill` tablosu artık kullanılmıyor
  Ne: beceriler `Tag(SKILL)` + `ProfileTag`'e taşındı (P1-06); eski `UserSkill` tablosu ekleyici politikası gereği
  yerinde duruyor (hesap silme hâlâ eski satırları siler).
  Neden borç: ölü tablo ve yanıltıcı model.
  Kapanış ölçütü: daraltma migration'ı tabloyu kaldırır (geri alma adımıyla), `Skill` sözlüğü yalnız eşleme için kalır.
- [ ] **TD-018** · P2 · Outbox `FAILED` niyet kayıtlarının saklama süresi yok
  Ne: Beş denemeden sonra `FAILED` olan `NotificationIntent` satırı (yük temizlenmiş, yalnız sabit hata kodu ve zamanlar)
  hesap silinene kadar kalır; temizleyen iş yok.
  Neden borç: tablo büyümesi ve veri en azlığı; operatörün incelemesi için sınırsız tutmanın gerekçesi yok.
  Kapanış ölçütü: günlük iş `failedAt` üzerinden belirlenen süreyi (karar gerekir) aşan `FAILED` satırlarını siler (idempotent, testli).


- [ ] **TD-021** · P1 · Canlıya alımda (K-02) güvenilir proxy ayarı
  Ne: `getRequestContext` şu anda istemcinin değiştirebildiği X-Forwarded-For değerini kullanır; IP kotası
  yalnız tamamlayıcı korumadır. Bu durum bütün kamuya açık hız sınırlarını etkiler.
  Neden borç: istemci XFF değiştirerek kotayı aşabilir; canlıda kaynak IP platform tarafından doğrulanmalıdır.
  Kapanış ölçütü: güvenilir proxy istemci başlıklarını ezer; `getRequestContext` yalnız platformun eklediği
  son hop'u kullanır, istemcinin XFF'sine güvenmez. Node doğrudan dışarı açılmaz; bütün kamuya açık
  kotalarda sahte başlık, eşzamanlı sınır ve pencere yenilenmesi testleri geçer.

- [ ] **TD-022** · P2 · Stres hacminde metin araması ve soru bankası hesabı büyüyor
  Ne: pilot yılının çok üstündeki stres verisinde ilan arama 295 ms, deneyim arama 197 ms, soru bankası 385 ms (10× deneme verisinde hepsi ≤ 35 ms; stres
  bütçesi 1 000 ms). Soru bankası k-anonim hesabı bütün aday şirketlerde yapılıp sonra sayfalanır (O(n); güvenlik gereği).
  Neden borç: veri büyüdükçe doğrusal artar; pilotta sorun değil, çok büyük kullanımda olur.
  Kapanış ölçütü: `ts_rank_cd` + `word_similarity` planı gözden geçirilir, soru bankası aday şirket sayısı sınırlanır ya da önbelleklenir; stres p95 < 300 ms.
- [ ] **TD-023** · P2 · `test:gate` "Worker exited unexpectedly / ERR_WORKER_OUT_OF_MEMORY"u altyapı sayıyor; `main()` birim testsiz
  Ne: gerçek bir bellek sızıntısı tek yeniden denemeyle geçebilir (ikinci koşuda düşerse kırmızı); `main()`'in yeniden koşu sonucunu yok sayan bir mutantını
  yalnız dış betik yakalıyor (kapı betiği kendi testini koştuğu için `main()` testi özyineleme yaratır).
  Neden borç: gerçek hatayı tek denemelik tolerans gizleyebilir; çıkış kodu mantığı repoda korunmuyor.
  Kapanış ölçütü: `TEST_GATE_NESTED` bayrağı ile betik testlerini atlayan sahte `pnpm`'li 3 uçtan uca senaryo (yeniden koşu geçer / kırmızı / gerçek yakalanmamış hata) repoya girer; OOM kalıbı için karar yazılır.
- [ ] **TD-024** · P2 · `profile-content.db.test` yük altında bir kez 15 sn zaman aşımına düştü
  Ne: dosya normalde 3–5 sn, bir kapıda 50 sn; yeniden koşuda 3,1 sn yeşil (yük ya da veritabanı beklemesi).
  Neden borç: izleniyor, kök neden bilinmiyor.
  Kapanış ölçütü: bir daha düşerse kök neden kartı açılır; düşmeden bir faz geçerse silinir.
- [ ] **TD-025** · P2 · e2e düzeneği: `webkit-iphone` projesi dosyasız koşulursa bütün spec'leri koşar
  Ne: `E2E_WEBKIT=1 … --project=webkit-iphone` dosya verilmeden 106 test koşar (yalnız Safari turu 14); WebKit turunda `tour()` liste boşsa ayrıntı ekranlarını
  sessizce atlıyor (`if (!href) continue`); ortak seed hesabını paylaşan spec grupları `--workers=2`'de yarışıyor (`--workers=1` güvenli).
  Neden borç: yanlış kullanımda uzun ve anlamsız koşu; boş veride sahte yeşil.
  Kapanış ölçütü: projeye `testMatch: /webkit-.*\.spec\.ts/`; `tour()` boş listede başarısız olur; yarış için ortak hesap yardımcısı (kart 209) ya da belgelenmiş `--workers=1`.
- [ ] **TD-026** · P2 · `src/components/ui/button-classes.test.ts` bileşen kaynağını metin olarak okuyor
  Ne: `'use client'` yönergesini ve barrel dışa aktarımını dosya metninden arıyor ("ekran kaynağını tarayan test yazılmaz" kuralına yakın); gerçek koruma e2e'de
  (etkinlik detayı, deneyim sayfası sunucuda `buttonClasses` çağırır).
  Neden borç: kuralla çelişen kaynak taraması.
  Kapanış ölçütü: test saf işleve indirilir ya da kaldırılır, e2e koruması yeter.

### Bilinçli kabul edilen sınırlar

- Canlı ortam yok; dağıtım ve yedek P1-18'e kadar sınanmaz.
- e-Devlet mezun belgesi elle doğrulanır (otomatik doğrulama için açık API yok).
- Bölüm bilgisi beyandır; e-posta alan adı yalnız üniversiteyi doğrular.

### Faz 2 sonrası ürün ve arayüz P3'leri

- **İlan formu:** zorunlu alanlar yalnız son adımda denetleniyor ("Devam et" boş alanla da geçer); adım değişimi ekran okuyucuya duyurulmuyor.
- **Ödül onay penceresinde bayat durum metni:** "Bu mezunu seç" penceresinde "Karar gerekçesi" alanının altında, tören tarihi kaydından kalan "Tercihin kaydedildi."
  kırmızı hata gibi görünüyor (203 provası; `year-alumni/admin.tsx` sayfa mesajını alan hatası olarak veriyor). "Yayımla" onay penceresi gövdesiz;
  tören tarihi 30 günden yakınsa genel "Formda eksik ya da uymayan bir alan var" hatası çıkıyor ("en az 30 gün sonrası" demeli).
- **Küçük görünüm borçları:** hikâyeler boş durumu düz cümle (diğerleri `EmptyState`); `giris/epostani-kontrol-et` `rounded-2xl` (kit dili `rounded-card`);
  klasik (kaplamasız) kaydırma çubuğunda modal açıkken sabit öğeler kayabilir (macOS/iOS'ta gözlenemez).

### Bakım kuralı

Reviewer'ın kapsam dışı bulduğu ama engel olmayan borç PM'ye gider; PM onaylarsa bir sonraki
PR'da bu bölüme yazılır. Faz kapanışında kayıtsız kalmış borçlar bu bölüme işlenir.

## Faz 3 fikirleri (aktif iş değil)

Kariyer yolu haritası · doğal dille arama · diğer fakültelere ve üniversitelere açılma.

- Soru bankasında pozisyon süzgeci ve "kaydet/çalış" listesi (P2-10'dan ertelendi): deneyimde pozisyon alanı gerekir; anonim deneyimde yarı tanımlayıcı olma riski
  (`docs/decisions.md`) ve P1 form kapsamı yüzünden Faz 2'de yapılmadı.

- Yerel profil fotoğrafı yükleme ve güvenli sunma altyapısı; gösterim için ayrı açık rıza.

## Sürekli kapılar

- Her faz sonunda `faz-kapanis` skill'i: kapılar yeniden, plan↔yapılan, telefon testi, hocaya
  rapor.
- Çekirdek akış testleri (`pnpm test:e2e`) main'de yeşil kalır.
