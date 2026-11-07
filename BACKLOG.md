# BACKLOG.md — Güncel durum, açık işler ve kararlar

Son güncelleme: **2026-11-07**. Tek durum belgesidir: güncel durum, açık kararlar, pilot kapıları,
teknik borç ve ertelenmiş işler. Tamamlanan madde silinir; geçmiş Git'tedir. Çalışma günlüğü
tutulmaz. Faz içindeki adımlar faz planındadır (`docs/fazN-plan.md`); kararların gerekçesi
`docs/decisions.md`'dedir.

## Güncel durum

- Repo iskeleti (Next.js 16, TypeScript, Tailwind, next-intl, Vitest), veritabanı katmanı (PostgreSQL + Mailpit compose, Prisma 7, kurum tabloları, seed, `/api/health` `db` kontrolü), yerel tam ortam (worktree yalıtımı, web/worker ve LAN başlatıcısı, seed çerçevesi) tasarım sistemi (`src/components/ui`, uygulama düzeni, `/ui-ornekleri` galeri, manifest) ve kimlik/üyelik/yetki katmanı (kullanıcı, üyelik, yönetici yetkisi, mentor profili, işlem kaydı, yetki korumaları, rol geçişi, sınıf kuralı, rol başına test kullanıcıları; oturum bağlantısı P1-02'de) kuruldu; CI ve ekip araçları Faz 0'ın kalan adımlarıdır (`docs/faz0-plan.md`). Ürün özelliği yok.
- Canlı ortam yok ve bilinçli olarak ertelendi; bütün geliştirme, test ve ekran doğrulaması yerelde.
  Canlıya alım Faz 1'in son adımıdır (P1-18).
- Telefon testi her faz sonunda, aynı Wi-Fi üzerinden kullanıcı tarafından yapılır.
- Ekip: PM + iki worker + iki reviewer (Orca); rol protokolü Git dışı `prompts/`'ta.

### Yakın hedef

Faz 0'ın altı adımı: repo iskeleti, veritabanı, CI, yerel tam ortam ve örnek veri, tasarım
sistemi, ekip araçları. Faz 0 bitince Faz 1 çekirdeği başlar.

### Bilinen kısıtlar

- Para harcanmaz; yalnız kaçınılmaz küçük maliyet LLM API'sidir (CV ayrıştırma, sağlayıcıda
  harcama sınırıyla).
- İÜ e-posta alan adları ve YBS'nin fakültesi doğrulanmadı (K-06).

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
| K-06 | İÜ öğrenci/personel e-posta alan adları, YBS'nin fakültesi | PM ölçer, kullanıcı teyit eder | Geçici değerler `prisma/seed-data.ts`'te (`ogr.iu.edu.tr`, `istanbul.edu.tr`, İktisat Fakültesi); teyitte yalnız o dosya değişir | P1-02 |
| K-07 | Yayınlanmış içeriğin görünürlük kapsamı | PM | Üniversitedeki tüm doğrulanmış üyeler | P1-07 |
| K-08 | Öğrencinin mentor olma eşiği | PM | 3. sınıf ve üstü + en az bir yayınlanmış deneyim | P1-04 |
| K-09 | Hesap silmede yayınlanmış deneyimler | PM | Kullanıcıya sor; varsayılan sil | P1-03 |
| K-10 | Kurucu üye etiketi kuralı | PM | Pilot süresince ilk deneyimi yayınlanan herkes | P1-16 |
| K-11 | Puan ağırlıkları ve şüphe eşikleri | PM | `docs/architecture.md` puan tablosu | P1-16 |
| K-12 | Pilot: kimler, ne zaman, başarı ölçütleri | Hoca | Hocayla | P1-18 |

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
