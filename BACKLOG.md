# BACKLOG.md — Güncel durum, açık işler ve kararlar

Son güncelleme: **2026-11-08**. Tek durum belgesidir: güncel durum, açık kararlar, pilot kapıları,
teknik borç ve ertelenmiş işler. Tamamlanan madde silinir; geçmiş Git'tedir. Çalışma günlüğü
tutulmaz. Faz içindeki adımlar faz planındadır (`docs/fazN-plan.md`); kararların gerekçesi
`docs/decisions.md`'dedir.

## Güncel durum

Faz 0 (iskelet, veritabanı, yerel ortam, tasarım sistemi, ekip araçları) ve Faz 1'in çekirdek ile
tamamlayıcı adımları main'dedir; **P1-17 (SSS) yalnız servis olarak** (ekranı yok), diğer her adımın servisi ve ekranı vardır. Canlı ortam yoktur
ve bilinçli ertelenmiştir: geliştirme, test ve ekran doğrulaması yerelde, birleştirme kapıları yerelde
(CI yok, K-14). Ürün özellikleri aşağıdaki gibi çalışır; ayrıntı ve gerekçe `docs/decisions.md`'dedir.

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
- **SSS servisi (P1-17):** talep (hız sınırlı, benzer soru kapısı), mentor cevabı, moderatör yayın/ret/yönlendirme (yayında kimlik yok),
  arama, yayında puan ve bildirim; kullanım olayları bağlı. **SSS ekranları (sayfa/arama, talep, mentor cevabı, moderasyon) main'de yoktur.**

### Dış bağımlılık bekleyenler

Hiçbiri kodla çözülemez; her biri aşağıdaki işi engeller. Kullanıcı/hoca kararı ilgili adıma gelince sorulur.

| Bekleyen | Neyi engelliyor |
|---|---|
| E3 — LinkedIn uygulaması + doğrulanmış şirket sayfası | P1-02 kabulü: LinkedIn ile giriş (kod yolu var, sınanmadı) |
| K-04 — LLM sağlayıcısı + API anahtarı + harcama sınırı | Gerçek CV ayrıştırma; TD-009 doğruluk tablosu |
| E4 — Google Cloud projesi + OAuth + yenileme jetonu | P1-10 kabulü: gerçek takvim daveti ve Meet linki |
| K-02 — sunucu ve dağıtım aracı; K-05 — canlı SMTP | Canlı ortam (PILOT-DEPLOY), gerçek e-posta teslimi |
| K-03 — veri sorumlusu ve yöneticiler; hoca onayı | PILOT-LEGAL, gerçek yönetici atamaları, canlı açılış |
| K-12 — pilot kimler, ne zaman, başarı ölçütleri | Pilot kararı, P1-18 başarı ölçütleri kutusu |

### Yakın hedef

Faz 1'i kapatmak: SSS ekranlarını (P1-17) main'e almak; kullanıcının faz sonu telefon denemesi (aynı Wi-Fi, `docs/engineering.md`
"Telefon testi") ve bulguların kapatılması ya da bu belgeye borç olarak yazılması; PILOT-TEST planının
`docs/faz1-plan.md` sonuna yazılması; canlıya alım kararlarının (K-02, K-05, K-03, K-12) kullanıcı ve hocadan
alınması; sonra `faz-kapanis` kapanış paketi.

### Bilinen kısıtlar

- Para harcanmaz; yalnız kaçınılmaz küçük maliyet LLM API'sidir (CV ayrıştırma, sağlayıcıda harcama sınırıyla).
- Öğrenci e-posta alanı ölçüldü; personel alanı, YBS fakültesi ve program dili teyit bekliyor (K-06).
- CI yok (K-14): kalite kapıları yerelde ve PM birleştirme kapısında koşar.

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
| K-14 | GitHub Actions CI kullanılsın mı | Kullanıcı | Public repoda standart çalıştırıcılarla hazırlanan taslak CI değişikliği hakkında karar | P0-03 |
| K-15 | Gelecekteki commit e-posta gizliliği | Kullanıcı | GitHub gizli adresi veya mevcut ayar | Yeni commit yapılandırması |

## Pilot öncesi kapılar

- [ ] **PILOT-LEGAL** Hukuki metinlerin (`docs/legal-drafts.md`) hoca/üniversite onayı ve yayın
  sürümünün köke taşınması. Önkoşul K-03.
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

### Bilinçli kabul edilen sınırlar

- Canlı ortam yok; dağıtım ve yedek P1-18'e kadar sınanmaz.
- e-Devlet mezun belgesi elle doğrulanır (otomatik doğrulama için açık API yok).
- Bölüm bilgisi beyandır; e-posta alan adı yalnız üniversiteyi doğrular.

### Bakım kuralı

Reviewer'ın kapsam dışı bulduğu ama engel olmayan borç PM'ye gider; PM onaylarsa bir sonraki
PR'da bu bölüme yazılır. Faz kapanışında kayıtsız kalmış borçlar bu bölüme işlenir.

## Ertelenmiş — Faz 2 (aktif iş değil)

Taslak plan: `docs/faz2-plan.md` (adım ayrıntıları, dalga sırası, onay noktaları). Bu liste adımların kısa kaydıdır; plan ile çeliştiğinde plan kazanır.

- **P2-01 · Yılın Mezunu ve LinkedIn rozeti** — puan aday listesi, kararı bölüm verir; LinkedIn
  “Add to Profile” bağlantısı (sertifika adı, kurum, tarih, doğrulama adresi), hazır metinli
  paylaş düğmesi, herkese açık doğrulama sayfası; mezuniyet töreninde açıklama.
- **P2-02 · Ayın mezunu** — ana sayfada kısa kariyer hikâyesi; rozet yok.
- **P2-03 · Referans akışı** — kanıtlı (öğrenci + yönetici onayı); referans ve referansla kabul
  puanları (gecikmeli).
- **P2-04 · Mezun staj ilanları** — moderasyonlu, son başvuru tarihli; ilan puanı.
- **P2-05 · İlan eşleştirme bildirimi** — profili uyan öğrencilere.
- **P2-07 · Beceri açığı analizi** — hedef pozisyondaki mezunların becerileriyle küme farkı;
  yapay zekâ gerekmez.
- **P2-08 · Seçmeli ders rehberi** — mezunların “işimde işe yarayan dersler” işaretleri.
- **P2-09 · Şirket sayfaları** — deneyimler, mülakat soruları, başvuru dönemi, mentorlar;
  **puanlama yok**.
- **P2-10 · Mülakat soru bankası** — şirket ve pozisyona göre.
- **P2-11 · Staj başvuru takvimi** — deneyimlerden çıkan dönemler ve hatırlatma.
- **P2-12 · Etkinlik modülü** — yönetici onaylı; QR/geçici kodla katılım; puan (gecikmeli).
- **P2-13 · Aylık özet e-postası** — kişiselleştirilmiş.

## Faz 3 fikirleri (aktif iş değil)

Kariyer yolu haritası · doğal dille arama · diğer fakültelere ve üniversitelere açılma.

- Yerel profil fotoğrafı yükleme ve güvenli sunma altyapısı; gösterim için ayrı açık rıza.

## Sürekli kapılar

- Her faz sonunda `faz-kapanis` skill'i: kapılar yeniden, plan↔yapılan, telefon testi, hocaya
  rapor.
- Çekirdek akış testleri (`pnpm test:e2e`) main'de yeşil kalır.
