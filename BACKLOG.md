# BACKLOG.md — Güncel durum, açık işler ve kararlar

Son güncelleme: **2026-11-12**. Tek durum belgesidir: güncel durum, açık kararlar, pilot kapıları,
teknik borç ve ertelenmiş işler. Tamamlanan madde silinir; geçmiş Git'tedir. Çalışma günlüğü
tutulmaz. Faz içindeki adımlar faz planındadır (`docs/fazN-plan.md`); kararların gerekçesi
`docs/decisions.md`'dedir.

## Güncel durum

Faz 0 (iskelet, veritabanı, yerel ortam, tasarım sistemi, ekip araçları), Faz 1 (çekirdek, tamamlayıcılar ve SSS ekranları dahil) ve
Faz 2'nin (fırsatlar, mevcut veriden değer, rehberlik, tanınma; `docs/faz2-plan.md`) onaylanmış kod kapsamı main'dedir; bilinçli sapmalar planın §12 kapanış notundadır. Canlı ortam
yoktur ve bilinçli ertelenmiştir: geliştirme, test ve ekran doğrulaması yerelde, birleştirme kapıları yerelde; CI az ve öz (≤ 5 dk, K-14
kararı, `docs/engineering.md` "CI"). Kullanıcı denemesinin rehberi `docs/engineering.md` “Faz 2 deneme rehberi”dir; tamamlanan işler ve bilinçli sapmalar faz planlarında, gerekçeler `docs/decisions.md`'dedir.

### Dış bağımlılık bekleyenler

Hiçbiri kodla çözülemez; her biri aşağıdaki işi engeller. Kullanıcı/hoca kararı ilgili adıma gelince sorulur.

| Bekleyen | Neyi engelliyor |
|---|---|
| E3 — LinkedIn uygulaması + doğrulanmış şirket sayfası | P1-02 kabulü: LinkedIn ile giriş (kod yolu var, sınanmadı) |
| K-04 — Seçilen Gemini ücretsiz katmanının API anahtarı; gerçek sağlayıcıya gönderim için yurt dışına aktarım rızası | Gerçek CV/LinkedIn ayrıştırma ve TD-009 doğruluk ölçümü. Metin yerelde maskelenir; gerçek adaptör henüz bağlı değildir (`docs/security.md`, CV hattı). |
| E4 — Google Cloud projesi + OAuth anahtarları (`korunan/google.env`) | P1-10 kabulü: gerçek takvim daveti ve Meet linki (adaptör ve panelden bağlama hazır; anahtarlar gelince `CALENDAR_PROVIDER=google` + `/yonetim/google`) |
| K-02 — sunucu ve dağıtım aracı; K-05 — canlı SMTP | Canlı ortam (PILOT-DEPLOY), gerçek e-posta teslimi |
| K-03 — veri sorumlusu ve yöneticiler; hoca onayı | PILOT-LEGAL, gerçek yönetici atamaları, canlı açılış |
| K-12 — pilot kimler, ne zaman, başarı ölçütleri | Pilot kararı, P1-18 başarı ölçütleri kutusu |
| Kurumsal kimlik ve platform hesabı (kullanıcı görevi, acelesiz) | LinkedIn kurum sayfası ve ödül paylaşımının kurum adı/kimliği (P2-01), canlı alan adı |
| Hukuki metinlerin üniversite KVKK birimi ya da bir hukukçu tarafından okunması | PILOT-LEGAL; belgeler resmî "siz" dilinde kalır, taslak hâli pilot ve deneme için yeterlidir |

### Yakın hedef

Kullanıcının Faz 2 deneme turu: `docs/engineering.md` "Faz 2 deneme rehberi" ve kapanış paketindeki telefon test listesi;
bulgular PM'de karta bölünür ya da bu belgeye borç olarak yazılır. Kullanıcının hesap isteyen işleri (Gemini anahtarı, Google Cloud anahtarları ve panelden bağlama, platform hesabı) ve
canlıya alım ile pilot kararları (K-02, K-05, K-03, K-12, hukuki okuma) kullanıcı gündeme getirince ele alınır. Faz 3 pilottan sonra konuşulur.

### Bilinen kısıtlar

- Ücretli servis açılmaz; CV için seçilen Gemini ücretsiz katmanının gerçek adaptörü ve anahtarı beklenir.
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
- [ ] **TD-023** · P2 · `test:gate` "Worker exited unexpectedly / ERR_WORKER_OUT_OF_MEMORY"u altyapı sayıyor
  Ne: gerçek bir bellek sızıntısı tek yeniden denemeyle geçebilir (ikinci koşuda düşerse kırmızı).
  Neden borç: gerçek hatayı tek denemelik tolerans gizleyebilir.
  Kapanış ölçütü: OOM kalıbı için karar yazılır (yeniden denenir mi, kırmızı mı kalır; `main()` çıkış kodu mantığı sahte `pnpm`'li uçtan uca testle korunuyor).
- [ ] **TD-024** · P2 · `profile-content.db.test` yük altında bir kez 15 sn zaman aşımına düştü
  Ne: dosya normalde 3–5 sn, bir kapıda 50 sn; yeniden koşuda 3,1 sn yeşil (yük ya da veritabanı beklemesi).
  Neden borç: izleniyor, kök neden bilinmiyor.
  Kapanış ölçütü: bir daha düşerse kök neden kartı açılır; düşmeden bir faz geçerse silinir.
- [ ] **TD-027** · P2 · pg "Calling client.query() when the client is already executing a query" uyarısı (pg@9'da hataya döner)
  Ne: Prisma 7'nin sorgu yorumlayıcısı (`@prisma/adapter-pg` 7.10.1 + `pg` 8.23.1) işlem içinde eşzamanlı sorgu atıyor; Node uyarıyı süreç başına bir kez yazar
  (`--trace-deprecation` yığını `PgTransaction.performIO` ← `interpretNode`). Bizim kodumuzdan değil; dev'de Next "Issue" rozetini çıkarır.
  Neden borç: pg@9 bu çağrıyı kaldırıyor; yükseltmede yaygın okuma yolları (işlem içinde ilişki yükleyen sorgular) hata verir.
  Kapanış ölçütü: adapter/pg düzeltmesinden sonra kayıtlı yeniden üretim akışı uyarısız geçer; yalnız e2e sunucusundaki `--no-deprecation` kaldırılarak da doğrulanır.

### Bilinçli kabul edilen sınırlar

- Canlı ortam yok; dağıtım ve yedek P1-18'e kadar sınanmaz.
- e-Devlet mezun belgesi elle doğrulanır (otomatik doğrulama için açık API yok).
- Bölüm bilgisi beyandır; e-posta alan adı yalnız üniversiteyi doğrular.

### Faz 2 sonrası ürün ve arayüz P3'leri

- **İlan formu:** zorunlu alanlar yalnız son adımda denetleniyor ("Devam et" boş alanla da geçer); adım değişimi ekran okuyucuya duyurulmuyor.
- **Küçük görünüm borcu:** klasik (kaplamasız) kaydırma çubuğunda modal açıkken sabit öğeler kayabilir (macOS/iOS'ta gözlenemez; Windows/Linux deneme turunda bakılır).

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
