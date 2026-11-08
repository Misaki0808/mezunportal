# BACKLOG.md — Güncel durum, açık işler ve kararlar

Son güncelleme: **2026-11-07**. Tek durum belgesidir: güncel durum, açık kararlar, pilot kapıları,
teknik borç ve ertelenmiş işler. Tamamlanan madde silinir; geçmiş Git'tedir. Çalışma günlüğü
tutulmaz. Faz içindeki adımlar faz planındadır (`docs/fazN-plan.md`); kararların gerekçesi
`docs/decisions.md`'dedir.

## Güncel durum

- Faz 0 iskelet, veritabanı, yerel ortam, tasarım sistemi ve ekip araçları main'dedir. P0-03 CI
  K-14 kararını bekler; ekran turundaki iki düzen bulgusunun düzeltmesi #8 ile main'e alındı.
  Telefon testi bekliyor. Henüz ürün özelliği teslim edilmedi.
- Faz 1 kimlik/üyelik/yetki katmanı kuruldu: kullanıcı, üyelik, yönetici yetkisi, mentor profili,
  işlem kaydı, yetki korumaları, rol geçişi, sınıf kuralı ve rol başına test kullanıcıları.
- P1-02 servisi: Better Auth (e-posta bağlantısı, isteğe bağlı LinkedIn, e-posta değiştirme), oturum
  bağlantısı, alan adı ile üyelik beyanı, bölüm seçimi, mezun belgesi akışı (yükleme, yönetici kuyruğu,
  onay/ret, dosya karar anında silinir), depolama adaptörü ve test girişi tamam. E-posta gönderimi R2'nin
  kuyruğuna bağlı; SMTP teslimi ayrı worker'da.
- P1-03 servisi: sürümlü rıza durumu, alan görünürlüğü, kontrollü iletişim talepleri,
  hesap anonimleştirme/silme ve kişisel JSON veri dökümü hazır; hesap silme gerçek oturum ve
  depolama adaptörüne bağlı. Onay, hukuki taslaklar, gizlilik, iletişim talepleri, hesap silme ve
  veri indirme ekranları hazır; bağımsız inceleme ve ekran kabulü bekliyor.
- P1-04 servisi: kalıcı ilk giriş adımları, açık atlama ve profil yüzdesi; K-08 sunucu reddi,
  profilin hesap silme ve kişisel veri dökümüne bağlantısı hazır. Ekran akışı ayrı karttadır.
- P1-05 CV ayrıştırma hattı (sağlayıcıdan bağımsız): PDF denetimi, `cv.parse` işi, sahte LLM adaptörü, sözlük
  eşleme, fark/onay, tek işlemde uygulama, staj davetleri, saklama kuralları, günlük sınır, hesap silme ve veri
  dökümü bağlantısı tamam. Gerçek LLM sağlayıcısı K-04 ile gelir; o zamana kadar `LLM_PROVIDER` boşsa özellik
  kapalı, `fake` yalnız local/test.

- P1-07 servisi: tür bazlı taslak, anonim çıktı, kapsamlı moderasyon/audit, şikâyet sınırı/kuyruğu,
  K-07 üniversite görünürlüğü hazır (yayınlanmış içerik aynı üniversitedeki tüm doğrulanmış üyelere açık).
  Deneyimler hesap silme ve kişisel döküme bağlı; K-08 gerçek yayınlanmış deneyim sayısını okur. Ekran
  akışı/kabulü ayrı kartta.

- P1-08 arama servisi: Türkçe tam metin + yazım hatası toleransı, tür/şirket/kanal/dönem/ücret süzgeçleri,
  sayfalama, K-07 görünürlüğü ve anonim çıktı hazır (1.000 deneyimde tipik sorgu ~10 ms); ekran W2'de.

- P1-11 yönetim paneli sözleşmesi: panel sorguları, kullanıcı/askı/üyelik düzeltme/yönetici atama, sözlük ve
  eşleşmeyen değer, işlem kaydı görüntüleme ve toplu mezun istihdam raporu imzaları, `requireAnyAdmin` koruması ve
  hata kodları hazır. Askıya alma/kaldırma (oturumlar aynı işlemde düşer), üyelik düzeltme ve yönetici atama/kaldırma
  servisi tamam (kapsam, kendi üzerinde işlem yok, işlem kaydı aynı işlemde); panel sorguları ve kalanı W2'de.
- Canlı ortam yok ve bilinçli olarak ertelendi; bütün geliştirme, test ve ekran doğrulaması yerelde.
  Canlıya alım Faz 1'in son adımıdır (P1-18).
- Telefon testi her faz sonunda, aynı Wi-Fi üzerinden kullanıcı tarafından yapılır.
- Ekip: PM + iki worker + iki reviewer (Orca); rol protokolü Git dışı `prompts/`'ta.

### Yakın hedef

Faz 0 telefon testini yapmak ve K-14 kararını almak; Faz 1 çekirdek
adımlarını sürdürmek.

### Bilinen kısıtlar

- Para harcanmaz; yalnız kaçınılmaz küçük maliyet LLM API'sidir (CV ayrıştırma, sağlayıcıda
  harcama sınırıyla).
- Öğrenci e-posta alanı ölçüldü; personel alanı, YBS fakültesi ve program dili teyit bekliyor (K-06).

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
| K-08 | Öğrencinin mentor olma eşiği | PM | 3. sınıf ve üstü + en az bir yayınlanmış deneyim | P1-04 |
| K-10 | Kurucu üye etiketi kuralı | PM | Pilot süresince ilk deneyimi yayınlanan herkes | P1-16 |
| K-11 | Puan ağırlıkları ve şüphe eşikleri | PM | `docs/architecture.md` puan tablosu | P1-16 |
| K-12 | Pilot: kimler, ne zaman, başarı ölçütleri | Hoca | Hocayla | P1-18 |
| K-14 | GitHub Actions CI kullanılsın mı | Kullanıcı | Public repoda standart çalıştırıcılarla hazırlanan PR #6 hakkında karar | P0-03 |
| K-15 | Gelecekteki commit e-posta gizliliği | Kullanıcı | GitHub gizli adresi veya mevcut ayar | Yeni commit yapılandırması |

## Pilot öncesi kapılar

- [ ] **PILOT-LEGAL** Hukuki metinlerin (`docs/legal-drafts.md`) hoca/üniversite onayı ve yayın
  sürümünün köke taşınması. Önkoşul K-03.
- [ ] **PILOT-TEST** Manuel uçtan uca test planı Faz 1 tamamlayıcıları bitince
  `docs/faz1-plan.md` sonuna “Manuel test planı” bölümü olarak yazılır ve pilot öncesi bir kez
  koşulur.
- [ ] **PILOT-DEPLOY** Canlıya alım (P1-18). Önkoşul K-02, K-05.

## Teknik borç

Öncelik: **P0** pilot engeli · **P1** canlıya alım öncesi · **P2** ihtiyaç doğunca.

### Biçim

```text
- [ ] **TD-001** · P1 · <kısa başlık>
  Ne: <somut durum, dosya/satır>
  Neden borç: <risk ya da maliyet>
  Kapanış ölçütü: <ne olunca silinir>
```

### Açık borçlar
- [ ] **TD-001** · P1 · Güvenlik başlıkları build anında yazılıyor
  Ne: başlıklar `next build` sırasında `.next/routes-manifest.json`'a yazılıyor; HSTS yalnız
  `APP_ENV=prod` ile alınan build'de çıkar (`next.config.ts`).
  Neden borç: canlı build yanlış env'le alınırsa HSTS sessizce düşer.
  Kapanış ölçütü: P1-18 dağıtım betiği build'i `APP_ENV=prod` ile alır ve başlık kanıtlanır.
- [ ] **TD-006** · P1 · Süresi geçmiş oturum ve doğrulama kayıtları temizlenmiyor
  Ne: `Session` ve `Verification` tablolarında süresi geçen satırlar birikir (indeksler hazır: `expiresAt`).
  Neden borç: veri en azlığı (KVKK) ve tablo büyümesi.
  Kapanış ölçütü: zamanlanmış pg-boss işi süresi geçmiş satırları siler (idempotent, testli).

- [ ] **TD-008** · P1 · `files.purge` zamanlanmamış
  Ne: `purgeCvFiles` (bağlı olmayan eski CV dosyaları, 24 saatten uzun takılı `cv.parse` işleri, 7 günden uzun onay
  bekleyen ayrıştırma çıktısı) hazır ve testli
  ama pg-boss zamanlayıcısı kapalı (`schedule: false`); hiçbir yerden çağrılmıyor.
  Neden borç: hata anında silinemeyen dosya ve takılı iş yalnız bu süpürmeyle temizlenir (KVKK saklama).
  Kapanış ölçütü: günlük `files.purge` işi kayıtlı, mezun belgesi artıklarını da kapsar, testli.
- [ ] **TD-009** · P1 · CV doğruluk tablosu sahte adaptörle, gerçek LLM ile değil
  Ne: 5 sentetik örnek CV + ölçüm düzeneği (`src/test/cv-accuracy.ts`) hazır; sahte adaptörde sonuç hat
  bütünlüğünü gösterir, LLM doğruluğunu değil. Gerçek adaptör yok (K-04, E: API anahtarı + harcama sınırı).
  Neden borç: P1-05 kabulündeki alan doğruluğu tablosu gerçek çıktıyla üretilmedi.
  Kapanış ölçütü: gerçek adaptör eklenir, aynı 5 örnekle tablo sonuç belgesine yazılır, veri politikası kaynakla doğrulanır.
- [ ] **TD-010** · P1 · CV profil üst alanları ve beceri modeli P1-04 ile hizalanmadı
  Ne: `ParsedCv` yalnız listeleri (eğitim, pozisyon, beceri, dil, sertifika) taşır; başlık/özet/şehir/bağlantılar
  `Profile` (P1-04) gelince eklenir. Beceri `Skill` sözlüğü + `UserSkill`'dir; `docs/data.md` taslağındaki
  `Tag(kind=SKILL)` ile birleştirilecek mi karar bekler.
  Neden borç: iki beceri modeli kalırsa arama ve profil ekranı çift kaynakla çalışır.
  Kapanış ölçütü: P1-04 birleşince PM kararı; `ParsedCv.schemaVersion` ile genişletme ya da `Tag` birleştirmesi.
- [ ] **TD-011** · P2 · Sözlük içeriği ve yönetici çözümü yok
  Ne: `Company`/`Title`/`Skill`/`Sector` boş; `UnmatchedValue` kuyruğu yazılıyor ama yönetici ekranı ve çözüm
  (`resolvedToId`, takma ad ekleme) yok.
  Neden borç: eşleme olmadan her değer ham kalır; kuyruk büyür.
  Kapanış ölçütü: pilot sözlük seed'i + yönetici çözümleme ekranı.


### Bilinçli kabul edilen sınırlar

- Canlı ortam yok; dağıtım ve yedek P1-18'e kadar sınanmaz.
- e-Devlet mezun belgesi elle doğrulanır (otomatik doğrulama için açık API yok).
- Bölüm bilgisi beyandır; e-posta alan adı yalnız üniversiteyi doğrular.

### Bakım kuralı

Reviewer'ın kapsam dışı bulduğu ama engel olmayan borç PM'ye gider; PM onaylarsa bir sonraki
PR'da bu bölüme yazılır. Faz kapanışında kayıtsız kalmış borçlar bu bölüme işlenir.

## Ertelenmiş — Faz 2 (aktif iş değil)

Faz 1 kapanınca `docs/faz2-plan.md` bu listeden yazılır.

- **P2-01 · Yılın Mezunu ve LinkedIn rozeti** — puan aday listesi, kararı bölüm verir; LinkedIn
  “Add to Profile” bağlantısı (sertifika adı, kurum, tarih, doğrulama adresi), hazır metinli
  paylaş düğmesi, herkese açık doğrulama sayfası; mezuniyet töreninde açıklama.
- **P2-02 · Ayın mezunu** — ana sayfada kısa kariyer hikâyesi; rozet yok.
- **P2-03 · Referans akışı** — kanıtlı (öğrenci + yönetici onayı); referans ve referansla kabul
  puanları (gecikmeli).
- **P2-04 · Mezun staj ilanları** — moderasyonlu, son başvuru tarihli; ilan puanı.
- **P2-05 · İlan eşleştirme bildirimi** — profili uyan öğrencilere.
- **P2-06 · Ters yönlü arama** — “staj arıyorum” etiketli öğrencileri işe alım yapan mezunlar
  bulur (öğrencinin açık rızasıyla).
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

## Sürekli kapılar

- Her faz sonunda `faz-kapanis` skill'i: kapılar yeniden, plan↔yapılan, telefon testi, hocaya
  rapor.
- Çekirdek akış testleri (`pnpm test:e2e`) main'de yeşil kalır.
