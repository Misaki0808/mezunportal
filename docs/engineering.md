# Mühendislik rehberi

Son güncelleme: **2026-11-07**. Ajan çalışma ve belge yönlendirmesi için önce `AGENTS.md` okunur.

## Stack

- Node.js 24 LTS (`.nvmrc`), pnpm 11 (`packageManager`; tek paket, monorepo değil)
- Next.js 16+ (App Router, `src/`) · React · TypeScript `strict` + `noUncheckedIndexedAccess`
- Tailwind CSS · next-intl (tek dil `tr`, önek yok) · yazı tipleri `next/font/google` (Inter + Plus Jakarta Sans, `latin-ext`;
  derleme İLK seferde fonts.googleapis.com'a erişir ve dosyaları kendinden barındırır — çevrimdışı ilk derleme başarısız olur,
  sonraki derlemeler `.next/cache`ten gider; çalışma anında dış istek yok)
- PostgreSQL 16+ (`pg_trgm`, `btree_gist`, `turkish` tam metin araması)
- Prisma 7 · Better Auth · Zod · pg-boss · ExcelJS
- Vitest (birim ve servis), Playwright (çekirdek akış testleri ve PM'in tarayıcı turu)
- Node sürümü `.nvmrc`'de, CI ile aynı; makinenin varsayılanı farklıysa test sonucu değişebilir
- Docker Compose (yerel PostgreSQL + Mailpit) · GitHub Actions (CI)

## Sürüm tuzakları — eski örneklerle kod yazma

Ajanların eğitim verisinde eski sürümlerin örnekleri çoktur; kurulumda saatler kaybolur.

- **Next.js 16+:** `middleware.ts` yerine `proxy.ts` kullanılır.
- **Prisma 7:** generator `provider = "prisma-client"` ve **`output` zorunlu** (istemci
  `node_modules`'a üretilmez; içe aktarma üretilen yoldan). İstemci **driver adapter** ile
  kurulur (`@prisma/adapter-pg`). CLI ayarı ve bağlantı adresi kökteki `prisma.config.ts`'tedir;
  env açıkça yüklenir. `pg` sürücüsünün bağlantı zaman aşımı varsayılanı Prisma 6'dan farklıdır;
  bağlantı havuzu ayarı açıkça verilir.
- **Üretilmiş arama sütunları (`Experience.searchVector`/`searchKeys`) ve 6 GIN indeksi:** artık
  şemada modelli (`@@index(type: Gin)` + `@default(dbgenerated())`), `migrate dev` boş fark üretir;
  `searchKeys` istemcide global `omit` ile varsayılan dönmez (`src/lib/prisma-options.ts`). Yine de
  bir migration bu sütun/indekslere `ALTER`/`DROP` içeriyorsa SQL'den o satırları sil (`--create-only`);
  yedek bekçi: `prisma/migration-guard.test.ts`. Gerekçe: `docs/decisions.md`.
- **Kimlik:** Better Auth kullanılır; **Auth.js/NextAuth kullanılmaz** (bakım modunda).
- **Beta, canary, RC sürüm yok.** Bütün bağımlılıklar kararlı sürümde ve lockfile ile sabittir.
- Yeni bir kütüphanenin kurulum biçiminden emin değilsen, kurulu sürümün belgesine bak;
  hafızadaki örneğe güvenme.

## Uygulama ilkeleri

- Strictliği delmek yerine tipi kaynağında düzelt. `any`, geniş cast, `@ts-ignore` ve gerekçesiz
  `eslint-disable` yok.
- Server Action ince kalır: yetki → Zod doğrulaması → servis. İş kuralı `src/server/rules`'ta,
  saf ve testli.
- Zod doğrulaması yetkilendirme değildir; aktör kimliği oturumdan gelir.
- İstemciye giden veri açık `select` ile seçilir; Prisma nesnesi olduğu gibi döndürülmez.
- Tarih veritabanında UTC, ekranda `Europe/Istanbul`; biçimlendirme merkezi yardımcılardadır.
- Türkçe büyük/küçük harf `tr-TR` ile (`toLocaleLowerCase('tr-TR')`).
- Dış servis arayüz + adaptör arkasındadır; sahte ve gerçek uygulama aynı sözleşmeye uyar
  (`docs/architecture.md` “Dış servisler”).

## Hata kodları

- Kullanıcıya dönen her hata kararlı bir `errorCode` taşır: `src/lib/errors.ts` yardımcıları
  (`codedConflict`, `codedNotFound`, `codedForbidden`, `codedValidation`, `codedRateLimited`).
- Dinamik değer `params`'a girer; kişisel veri ve sır girmez.
- Her kod `messages/tr.json` `errors.codes` altına eklenir. **Bekçi testleri:** kayıt ↔ metin
  eşleşmesi ve kodsuz `throw` sayısının sıfır olması.
- Ekrana ham `err.message` basılmaz; `errorCode` → metin üzerinden gösterilir.

## Yerel paralel çalışma

Dört ajan aynı makinede ayrı worktree'lerde çalışır. Tek veritabanı ve tek port paylaşılırsa
çakışırlar: bir dalın eklediği migration diğer dalda yoktur ve Prisma veritabanını sıfırlamak
ister; iki geliştirme sunucusu aynı portu ister.

- **Her worktree'nin kendi veritabanı ve portu vardır.** `sh scripts/worktree-env.sh` worktree
  adından veritabanı adı (`mezun_<slug>`, test için `mezun_<slug>_test`) ve sabit bir port
  dilimi üretir, `.env.local`'ı yazar, veritabanını oluşturur. Hepsi aynı PostgreSQL
  konteynerindedir; Mailpit ortaktır.
- Yeni worktree'de ilk iş bu script, sonra `pnpm db:deploy && pnpm db:seed`. Ajanlar
  `db:reset` çalıştırmaz.
- **Geliştirme sunucusu yalnız kanıt alırken açılır,** iş bitince kapatılır. Aynı anda tek ağır
  iş (tam build, Playwright koşusu).
- `main`'i dalına birleştirdikten sonra migration'ları yeniden uygula (`pnpm db:migrate`).

## Test stratejisi

| Değişiklik | Asgari kanıt |
|---|---|
| Saf kural / yardımcı | Birim testi + mutasyon (kuralı kır, test düşsün, geri al) |
| Şema / migration | Boş ve seed'li veritabanında koşum + ilgili servis testi (`*.db.test.ts`) |
| Yetki / KVKK / puan | Mutlu yol + yanlış rol, başka bölüm, askıdaki kullanıcı, tekrar ve yarış negatifleri |
| Görünürlük | Sunucu yanıtı JSON'unda gizli alanı arayan sızıntı testi |
| Dış servis | Sahte adaptörle başarı, zaman aşımı ve hata yolu |
| Ekran | İlgili bileşen testi + sonuçta “ekranda nasıl denenir” (390/1440); görsel kontrol PM'in tarayıcı turunda |
| Çekirdek akış | Bir Playwright testi (`tests/e2e/`) |

**Veritabanlı testler** `*.db.test.ts` adını taşır, ayrı Vitest projesinde (`db`) sırayla koşar ve
yalnız `DATABASE_URL_TEST` veritabanını kullanır. Adı `_test` ile bitmeyen veritabanına dokunmaz;
başlamadan önce o veritabanının `public` şeması düşürülür ve bütün migration'lar boş veritabanına
uygulanır. `DATABASE_URL_TEST` yoksa `pnpm test` gürültülü düşer (sessiz atlama yok); veritabanı
gerekmeyen kontrol için `pnpm test:unit`.
DB projesinde ortak makine yükü için test başına süre sınırı 15 saniye, birim testlerinde 5 saniyedir.
Vitest 5 saniyeyi aşan yavaş testleri raporlar; sürekli yavaşlayan testi düzeltmek gerekir.
Standart raporlayıcı açıkça seçilidir; ajan ortamının otomatik minimal raporu yavaş testin
adını ve süresini gizleyemez.

Kapsam yüzdesi için test yazılmaz; yanlış aktör, yanlış durum, tekrar ve hata yolları kanıtlanır.
Ekran kaynağı deseni testle değil lint kuralıyla korunur.

**Ekran kaynağını tarayan test yazılmaz** (bileşen dosyasını metin olarak okuyup desen arayan
test); kural saf işleve çıkarılır, test onu sınar. Vitest eşzamanlılığı `--maxWorkers=4`.

**Çekirdek akış testleri:** her çekirdek adım kendi akışı için bir Playwright testi bırakır
(giriş, ilk giriş akışı, CV onayı, deneyim yazma/moderasyon, arama, randevu, yönetim). CI bunları
koşmaz; PM'in yerel birleştirme kapısı ve reviewer yerelde koşar (bkz. "CI").

### CI

Tek iş akışı (`.github/workflows/ci.yml`), her PR'da ve `main`'e itmede, duvar saatiyle **≤ 5 dakika**
(kullanıcı kararı: "az ve öz"). Üç iş paralel koşar, pnpm önbelleği açıktır, aynı dalda yeni itme eski koşuyu
iptal eder: (1) tür denetimi (`prisma generate`, `typecheck`, `prisma validate`), (2) kalite (`lint`,
`format:check`, `messages:check`), (3) hızlı birim testleri (`test:local` + `test:unit`: veritabanı gerektirmeyen Vitest
projesi). Ortam değişkenleri iş akışında sahte değerdir; gerçek hizmete bağlanılmaz.
**CI'da yok (yerel kapıda):** veritabanı testleri (`*.db.test.ts`), `pnpm build`, Playwright e2e, CodeQL; PM
birleştirmeden önce bunları yerelde, makinede tek ağır iş kuralıyla koşar. Yeni bir iş CI'ya eklenecekse süre
bütçesi (5 dk) ve neden yerelde yetmediği gerekçesiyle `docs/decisions.md`'ye yazılır. GitHub ayarları (kod
değil; PM açar): gizli anahtar taraması + push koruması ve Dependabot **uyarıları** (otomatik PR yok); ikisi de
ücretsiz ve koşu süresi almaz.

### Erişilebilirlik turu (P2-14)

`tests/e2e/a11y-tour.spec.ts` (yardımcılar `tests/e2e/a11y.ts`, kütüphane yok) girişsiz, öğrenci ve yönetici ekranlarını **açık ve koyu temada, 390 ve 1440 px'te** gezer ve şunları denetler: tek `main`
ve görünür `h1`, adsız etkileşimli öğe yok, her metin WCAG AA kontrastında (gerçek renkler ve zemin hesaplanır), yatay taşma yok, açık zemin krem / koyu zemin koyu, klavyeyle Tab'a basınca
her odak hedefi görünür bir odak göstergesi taşır ve odak bir yere sıkışmaz. Tek başına koşar: `pnpm exec playwright test tests/e2e/a11y-tour.spec.ts --workers=1` (tek ağır iş kuralıyla). Koyu zemin
değeri değişirse tur yeniden koşulur. **İlk koşuda bulunup giderilenler:** 27 ekran/bileşen kabuğun `<main>`'inin içine ikinci bir `<main>` koyuyordu (ekran okuyucuda iki ana bölge);
sayfa bileşenleri artık `main` kullanmaz, kabuk sağlar. Etkinlik düğmeleri koyu temada `text-white` ile 2,27:1 kontrastlıydı, `text-on-primary` oldu. Tarih/saat girişlerinin iç parçaları tarayıcının
kendi odak halkasını çizer; tur bunları ana öğe düzeyinde atlar.

## Komutlar

```bash
pnpm install --frozen-lockfile
pnpm db:generate                 # Prisma istemcisini üretir (temiz checkout'ta typecheck'ten önce)
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test                        # birim + veritabanlı testler (DATABASE_URL_TEST ister)
pnpm test:unit                   # yalnız birim testleri (veritabanı gerekmez)
pnpm test:local                  # yerel ortam/port kuralları (veritabanı gerekmez)
pnpm messages:check
pnpm prisma validate
pnpm build
pnpm test:e2e
pnpm evidence <yol> --as <rol>
pnpm db:migrate | db:deploy | db:seed | db:reset   # Prisma; ayrıntı "Yerel geliştirme"
```

### Ekip araçları

`sh scripts/session-start.sh` uzakları günceller; dalın `origin/main` karşısındaki durumunu,
worktree'leri ve açık PR'ları gösterir. BAYAT veya PULL DÜŞTÜ uyarısında sıfırdan farklı çıkar;
çalışma dosyalarına dokunmaz. Kartın tabanını ayrıca güncel `origin/main` ile karşılaştır.

`pnpm test:e2e` Chromium ile worktree `APP_URL` portunda ayrı bir geliştirme sunucusu açar;
portta sunucu varsa onu kullanmak yerine durur. `.env.local` veya süreçte `APP_URL` gerekir. İlk kurulumda
`pnpm exec playwright install chromium` gerekir. `pnpm evidence /`
çalışan sunucudan 390×844 ve 1440×900 tam sayfa görüntüleri ile konsol hata/uyarı raporu üretir.
`--width 360`, `--width 390` veya `--width 1440` yalnız seçilen genişliği çeker; 360 görünümü 360×780'dir.
`--theme dark` veya `--theme light` renk temasını seçer.
`APP_URL` adresi `--url` yerine kullanılabilir; `--out` çıktı kökünü değiştirir. Varsayılan çıktı,
ana repo yanındaki `pm-handoff/kanit/<tarih>/` altında her çalışmaya ayrı bir klasördür. Rapor
konsol içeriği barındırabilir; yalnız sahte veriyle kullanılır. `--as student`, `seniorMentor`,
`alumniMentor`, `academic`, `departmentAdmin` veya `systemAdmin` seed test hesabıyla oturum açar;
yalnız yerel/test ortamında ve yerel sunucuda çalışır. Oturum tarayıcı belleğinde kalır. Öğrenci
girişinin uçtan uca testi için yerel Mailpit (SMTP 1025, HTTP 8025) ve seed verileri gerekir.

### Sahte kırmızı: üretilmiş Prisma istemcisi

Prisma 7 istemcisi `output` yoluna üretilir ve depoda durmaz. Temiz checkout'ta ya da şema
değişikliğinden sonra üretilmemişse typecheck kodla ilgisiz hatalar verir (bilinmeyen model
alanları, bulunamayan modül). **Kural:** kapı beklenmedik bir yerde kırmızıysa kovalamadan önce
`pnpm prisma generate` ve kök `pnpm typecheck`; hata hâlâ duruyorsa gerçektir.

## Bağımlılık ve config

- Önce mevcut kütüphaneyle çözmeyi dene. Yeni bağımlılık bakım, güvenlik, lisans ve boyut
  gerekçesiyle ve onayla eklenir.
- Yeni env: `.env.example` + `src/lib/env.ts` doğrulaması + aşağıdaki “Env grupları”.
- Sır için varsayılan gerçek değer, log veya `NEXT_PUBLIC_*` kullanılmaz.

## Yerel ortam

**Şimdilik canlı ortam yoktur** (kullanıcı kararı, `docs/decisions.md`). Bütün geliştirme,
test, ekran doğrulaması ve hocaya gösterim yerelde, sahte örnek veriyle yapılır. Canlıya alım Faz 1'in
son adımıdır (P1-18).

### Ortamlar

| Ortam | `APP_ENV` | Kaynak | Veri | E-posta |
|---|---|---|---|---|
| Yerel | `local` | çalışma kopyası | seed (sahte) | Mailpit |
| CI | `test` | GitHub Actions | test verisi | sahte adaptör |
| Canlı | `prod` | P1-18, sunucu kararıyla (K-02) | gerçek | gerçek SMTP (K-05) |

### Yerel geliştirme

Makinede aynı anda yalnız bir ağır iş çalıştırılır; `pm-handoff/araclar/agir-is.sh` ile sıraya girer.
Vitest ve Playwright en çok iki işçi kullanır; Playwright yalnız ilgili senaryolarda koşulur.
Watch modu kullanma; iş bitince açtığın geliştirme sunucusunu, worker ve tarayıcı süreçlerini kapat.

```bash
pnpm install --frozen-lockfile
docker compose up -d             # PostgreSQL + Mailpit (yalnız 127.0.0.1)
sh scripts/worktree-env.sh       # bu worktree'ye veritabanı + port + .env.local
pnpm db:generate                 # Prisma istemcisi (temiz checkout)
pnpm db:deploy && pnpm db:seed   # şema + deterministik sahte veri
pnpm dev:all                     # web + worker
```

`worktree-env.sh` yoksa oluşturur, varsa `.env.local` dosyasını ve veritabanlarını korur.
Adı worktree'den üretir; `w1-`, `w2-`, `r1-`, `r2-`, `pm-` öneklerinin port dilimleri
sırasıyla 3100, 3200, 3300, 3400, 3900'den başlar (100 port). Ana kopya 3000 kullanır.
Adın sabit özetinden sapma seçer; dolu/diğer worktree'ye ayrılmış portta sıradakini dener.
Eşzamanlı hazırlamalar yerel kilitle sıralanır; 60 saniyeden eski (ölmüş koşudan kalan) kilit
kendiliğinden kaldırılır. Klasör adı başka worktree'nin veritabanı adına dönüşüyorsa (ör. `r1-a b`
ve `r1-a_b`) betik durur; worktree'yi farklı adla aç. Mevcut dosya yanlış veritabanına/rol portuna
bakıyorsa değiştirmeden durur; ayarı elle incele. Veritabanlarını yalnız paylaşılan
`mezunportal` Compose projesinde oluşturur; konteyner zaten çalışıyor olmalıdır.

`pnpm dev`, `dev:all`, `dev:lan` portu `.env.local` içindeki `APP_URL`'den okur ve Next.js'e
`--port` ile verir; Next.js aksi halde `.env.local` içindeki portu seçmez. `dev:all` web ile
ayrı Node worker sürecini başlatır. Worker `email.send` kuyruğunu ve kalıcı başarısızlık kuyruğunu işler; sağlık satırı da üretir. Ctrl+C veya süreçlerden birinin çıkışı ikisini de kapatır.
Normal geliştirme yalnız `127.0.0.1`'e açılır; LAN modu aşağıdadır.

- **PostgreSQL kimliği** (`mezun` / `mezun`) yalnız `127.0.0.1`'e bağlı yerel konteynere aittir;
  sır değildir ve canlıya taşınmaz. Veritabanı adresi biçimi:
  `postgresql://mezun:mezun@127.0.0.1:5432/<veritabanı>`.
- **Migration:** geliştirmede `pnpm db:migrate` (yeni migration üretir/uygular), yeni ya da boş
  veritabanında `pnpm db:deploy`. Şema yalnız bu komutlarla değişir.
- **`pnpm db:reset` Prisma 7 koruması:** komut veritabanını siler; Prisma bunu bir yapay zekâ
  ajanından çalıştırıldığında **kullanıcının açık onayı olmadan reddeder**. Ajanlar yeni worktree'de
  `db:reset` yerine `db:deploy` + `db:seed` kullanır; sıfırlama gerekiyorsa kullanıcıya gider.
  Prisma 7'de `migrate reset` seed'i kendiliğinden çalıştırmaz: sıfırlamadan sonra `pnpm db:seed`.
- Paylaşılan konteynerleri başka roller çalışırken durdurma; yalnız kendi geliştirme
  sunucunu kapat. Kullanıcı bütün işleri bitirdiğinde `docker compose stop` kullanabilir;
  veritabanı hacmi (`postgres-data`) silinmez.

- **Worktree başına veritabanı ve port:** her worktree kendi `mezun_<slug>` (ve test için
  `mezun_<slug>_test`) veritabanını ve sabit bir port dilimini kullanır; hepsi aynı PostgreSQL
  konteynerinde. Ayrıntı yukarıda “Yerel paralel çalışma”.
- **Mailpit:** `http://localhost:8025`; giriş bağlantıları ve bütün bildirimler buraya düşer.
- **Dosyalar:** Git dışı `.data/files/`.
- **Seed:** kurumlar ve rol başına altı test kullanıcısı hazırdır (öğrenci, üst sınıf mentor, mezun mentor,
  akademisyen, bölüm yöneticisi, sistem yöneticisi: doğrulanmış üyelik, mentor profili, yönetici yetkisi).
  Modül sırası ve deterministik kimlik/zaman üreticisi `prisma/seed-framework.ts`'tedir. E-postalar
  `@test.mezunportal.local` (gerçek alan adı değil) ve giriş bilgisi yoktur; test girişi ve Better Auth
  oturumları P1-02'de gelir, bilgileri Git dışı `korunan/test-hesaplari.md`'de tutulur. Sonraki özellikler
  kendi örnek verisini modül sırasına ekler.
- **Giriş ve e-posta:** e-posta bağlantıları `getAuthEmailPort()` üzerinden işlemli giden kutusuna
  (`enqueueEmail`) yazılır; teslim için `pnpm dev:all` çalışmalıdır. Telefon ve
  yerel denemede **test girişi** (`signInAsTestPersona`, yalnız `local`/`test`) seed kullanıcısı olarak
  e-posta olmadan oturum açar. Giriş akışı Mailpit'ten (`http://localhost:8025`) denenir.
- Dış servisler yerelde de gerçek çalışabilir (LLM, Google Takvim, LinkedIn); anahtar yoksa sahte
  adaptör seçilir.

### Env grupları

Kanonik liste `.env.example` ve `src/lib/env.ts`'tir; burada çoğaltılmaz. Gruplar: uygulama
(`APP_ENV`, `APP_URL`, `GIT_SHA`; geliştirme portu `APP_URL` üzerinden dev betiğince seçilir), veritabanı
(`DATABASE_URL`; yalnız testler için `DATABASE_URL_TEST`, adı `_test` ile biter),
kimlik (Better Auth sırrı, LinkedIn), e-posta, LLM, Google Takvim, depolama, iş kuyruğu. Sırlar yalnız
`.env.local` ve `korunan/`'dadır. Eksik ya da geçersiz değişken `EnvValidationError` fırlatır; mesaj
yalnız değişken adını taşır.

**Kimlik doğrulama ve e-posta grubu** (`getAuthEnv()`, ayrı şema: yalnız giriş/e-posta kodu okur, `/api/health`
ve diğer sayfalar bağlı değildir): `BETTER_AUTH_SECRET` (≥ 32 karakter; `.env.example`'daki genel `dev-only…` değeri
yalnız `local`/`test`'te kabul edilir, `prod`'da env doğrulamasını düşürür), `SMTP_HOST`/`SMTP_PORT`/`SMTP_SECURE`
(yerelde Mailpit 127.0.0.1:1025), `SMTP_USER`+`SMTP_PASSWORD` (ikisi birlikte; Mailpit için boş), `EMAIL_FROM`,
ve İSTEĞE BAĞLI `LINKEDIN_CLIENT_ID`+`LINKEDIN_CLIENT_SECRET` (ikisi de yoksa LinkedIn kapalıdır).
**Dosya depolama grubu** (`getStorageEnv()`, varsayılanlı; `.env.local`'a eklenmesi gerekmez): `STORAGE_DRIVER`
(`local`) ve `STORAGE_LOCAL_PATH` (varsayılan `.data/files`, Git dışı, çalışma dizinine göre yani worktree
başına). Sürücüler `src/server/external/storage/` (yerel, bellek/sahte); arayüz `put/get/delete`. Mevcut
`.env.local` dosyalarına eklenmesi gerekmez; yeni worktree'ler `.env.example`'dan alır.
**CV ayrıştırma / LLM grubu** (`getLlmEnv()`, varsayılanlı): `LLM_PROVIDER` boşsa CV ayrıştırma KAPALIDIR
(yükleme `CV_PROVIDER_NOT_CONFIGURED` ile reddedilir, ekran sebebi gösterir, elle giriş açık); `fake` deterministik
sahte adaptördür ve yalnız `local`/`test`'te kabul edilir (`prod`'da env doğrulamasını düşürür). Gerçek sağlayıcı
(K-04) ayrı kartla gelir; `LLM_API_KEY` ve `LLM_MODEL` o zamana kadar okunmaz. `CV_PARSE_DAILY_LIMIT`
(1–50, varsayılan 5) kullanıcı başına günlük ayrıştırma sınırıdır. Adaptörler `src/server/external/llm/`. Worker (`pnpm dev:all`) `cv.parse` kuyruğunu yalnız `LLM_PROVIDER` doluyken dinler.

**Takvim / Meet grubu** (`getCalendarEnv()`, varsayılanlı): `CALENDAR_PROVIDER` boşsa takvim KAPALIDIR (online randevu
yine onaylanır; mentor görüşme linkini elle ekler); `fake` deterministik sahte adaptördür ve yalnız `local`/`test`'te
kabul edilir (`prod`'da env doğrulamasını düşürür). `google` gerçek Google Takvim/Meet adaptörüdür ve `GOOGLE_CLIENT_ID` ile
`GOOGLE_CLIENT_SECRET` zorunludur (eksikse yalnız eksik anahtarın adıyla env düşer); anahtarlar `fake`/boşken gerekmez. Yenileme
jetonu env'de DEĞİL, veritabanında AES-256-GCM ile şifreli durur (anahtar `BETTER_AUTH_SECRET`'tan türer: sır değişirse bağlantı
yeniden kurulur). Adaptörler `src/server/external/calendar/`.

### Google Takvim / Meet'i bağlama (tek seferlik, kullanıcı + sistem yöneticisi)

1. **Hesap:** platform için ayrılmış bir Gmail (randevu davetleri bu hesabın takviminden gider). Faturalandırma gerekmez (Calendar API ücretsiz).
2. **Google Cloud:** yeni proje → *APIs & Services* → **Google Calendar API**'yi etkinleştir.
3. **OAuth izin ekranı:** *External*; uygulama adı, destek e-postası; kapsam olarak yalnız `.../auth/calendar.events`. **Publish app** ile "Yayında"
   yap: "Test" modunda yenileme jetonu 7 günde düşer. (Doğrulama istenmeyebilir; hassas kapsamda "doğrulanmamış uygulama" uyarısı görünürse
   *Gelişmiş → devam* ile ilerlenir, kullanıcı sayısı küçüktür.)
4. **Kimlik bilgileri:** *OAuth client ID* → *Web application*; **Authorized redirect URI** = `<APP_URL>/api/google/callback` (adres
   `/yonetim/google` sayfasında da yazar; yerelde `http://localhost:<port>/api/google/callback`).
5. **Sunucu ayarı:** `GOOGLE_CLIENT_ID` ve `GOOGLE_CLIENT_SECRET` değerlerini `korunan/google.env`'e (Git dışı) yaz ve ortam değişkeni olarak ver;
   `CALENDAR_PROVIDER=google`; uygulamayı yeniden başlat.
6. **Bağla:** sistem yöneticisi olarak `/yonetim/google` → **Google Takvim'i bağla** → platform Gmail'iyle izin ver. Başarıda sayfa "Bağlı"
   gösterir; işlem kaydına `INTEGRATION_CONNECT` düşer. Kesmek için aynı sayfada **Bağlantıyı kes** (jeton Google'da da iptal edilir).
7. **Sınır:** bağlantı kurulmadan ya da yetki geri alınınca randevu yine onaylanır, mentor Meet bağlantısını elle ekler; bağlanmadan önce onaylanmış
   randevulara sonradan otomatik bağlantı eklenmez.

**Puan motoru grubu** (`getPointsEnv()`, isteğe bağlı): `FOUNDING_MEMBER_UNTIL` (`YYYY-MM-DD`, İstanbul günü, o gün dahil)
kurucu üye etiketinin (K-10) pilot bitişidir; BOŞSA pilot açıktır ve etiket verilmeye devam eder. Bitişten sonra yayınlanan
deneyim etiket doğurmaz; verilmiş etiket değer değişince geri alınmaz.

### Telefon testi (faz sonu)

Her faz bitince kullanıcı telefondan test eder; faz içinde telefon testi yoktur.

1. Bilgisayar ve telefon aynı Wi-Fi'da.
2. `pnpm dev:lan` sunucuyu `0.0.0.0`'a açar ve telefonda açılacak IPv4 adreslerini yazar.
   Yalnız güvenilen ev/okul Wi-Fi'ında kullan; deneme bitince Ctrl+C ile kapat.
   Birden çok ağ adresi varsa Wi-Fi arayüzünün adresini seç. Terminaldeki adresi telefonda aç;
   güvenlik duvarı sorarsa yalnız bu yerel deneme için erişime izin ver. LAN modunda bağlantı
   kökü süreçte ilk ağ adresine ayarlanır; `.env.local` değiştirilmez.
3. P0-04'te hesap gerekmeden ana sayfa açılır (390/1440); test girişi P1-02'de gelir.
   O aşamadan sonra telefonda test girişiyle rol hesaplarına girilir (giriş bağlantısı ve LinkedIn yerel adrese
   bağlı olduğu için telefonda test girişi kullanılır).
4. “Ana ekrana ekle” ile uygulama gibi açılabilir.
5. Gerçek cihazda ayrıca doğrulanır (tarayıcı turunda ekran klavyesi denenemez): form ekranlarında (deneyim yaz,
   bildirim tercihleri, CV onayı) bir alana dokununca klavye açılırken alt gezinme gizlenmeli, eylem çubuğu formun
   sonunda kalmalı ve klavye kapanınca eski düzene dönmelidir (`KeyboardState`, `docs/decisions.md` tur 2).
6. Kontrol listesi faz kapanış paketindedir (`faz-kapanis` skill'i).

Hocaya gösterim de aynı yolla, bilgisayardan ya da telefondan, sahte veriyle yapılır.

#### Faz 2 deneme rehberi (kullanıcının test turu)

Hazırlık: `pnpm db:deploy && pnpm db:seed` (Faz 2 örnek verisi gelir: "Örnek …" şirketler, altı yayınlanmış deneyim, üç yayında + biri incelemede + bir taslak ilan, bir yayında + bir incelemede etkinlik;
tarihler seed'i koştuğun ana göredir, yeniden koşmak tazeler). `pnpm dev:lan` ile telefonda aç; her hesap için `/giris/test?persona=<hesap>`
(rol seçici: `/giris/test`). Hesaplar: `student` Deniz (öğrenci), `seniorMentor` Elif, `alumniMentor` Mert (mezun), `academic` Selin,
`departmentAdmin` Kerem (bölüm yöneticisi), `systemAdmin`. E-postalar Mailpit'te (`http://localhost:8025`). Bulgularını pm-handoff'taki bulgu listesi şablonuna yaz.

| Akış | Hesap → adım |
|---|---|
| Ana sayfa ve tanıtım | Çıkış yapmış tarayıcıda `/` (krem/koyu, dönen satır); giriş yapınca ana sayfa |
| İlan | `student`: `/ilanlar` (üç örnek ilan, süzgeç, ilan detayı, "Şikâyet et"); `alumniMentor`: `/ilanlarim` → "Yeni ilan" → gönder; `departmentAdmin`: `/yonetim/ilanlar` → onayla/reddet |
| İlan eşleşme bildirimi | `student` ilgi alanlarından "Veri analitiği"/"Yazılım geliştirme"yi işaretle; ilan yayınlanınca `/hesap/bildirimler` ve Mailpit (günde en çok bir özet) |
| İletişim talebi (ilandan) | `student`: "İletişim talebi" olan ilanda gönder → `alumniMentor`: `/hesap/iletisim` → onayla; öğrencinin giden listesinde onaydan önce yazar adı yok |
| Ters arama | `student`: `/hesap/staj-ariyorum` → rıza + "staj arıyorum" aç, önizlemeyi gör; `alumniMentor`: beyan aç, `/adaylar` → kartta ad yok → talep gönder; rızayı geri alınca kart aranmada yok |
| Referans | `alumniMentor`: `/referans/yeni` (öğrenciyle önceden onaylı talep gerekir) → `departmentAdmin`: `/yonetim/referanslar`; mentorun puanı `/profil` sayfasındaki "Katkı puanın" bölümünde (`/hesap/guvenilirlik` yalnız öğrenci hesabında açılır) |
| Şirket sayfaları | `student`: `/sirketler` → "Örnek Yazılım A.Ş." (üç kişi altı gizli, takip et) |
| Soru bankası | `student`: `/mulakat-sorulari` (en az üç farklı yazardan gelen gruplar) |
| Başvuru takvimi | `student`: `/basvuru-takvimi` (aylar, takip, anonim deneyim varken kesit gizlenir) |
| Beceri açığı | `student`: `/profil` → "Hedefime ne kadar yakınım?" (hedef pozisyon seç) |
| Yılın / Ayın mezunu | `departmentAdmin`: `/yonetim/yilin-mezunu`, `/yonetim/ayin-mezunu`; yayın rızası `/odullerim`, `/hesap/hikayem`; kamuya açık doğrulama `/dogrula/<kod>` |
| Etkinlik | `student`: `/etkinlikler` → kayıt; etkinlik başlayınca yöneticinin etkinlik ekranındaki QR'ı telefonla aç (adres `/etkinlik-katilim#…` biçimindedir; sayfayı kodsuz açarsan "Bu bağlantı geçerli değil" görünür, bu beklenen); `departmentAdmin`: `/yonetim/etkinlikler` (incelemedeki etkinliği onayla) |
| Aylık özet | `systemAdmin`/`departmentAdmin`: `/yonetim/aylik-ozet` (önizleme); `student`: `/hesap/aylik-ozet` (abonelik) |
| Google Meet | `systemAdmin`: `/yonetim/google` (Google Takvim/Meet PR'ı birleşince açılır; o zamana dek 404; anahtarlar gelince bağla); online randevuda Meet bağlantısı otomatik, bağlı değilse mentor elle ekler |
| Koyu tema ve klavye | Tarayıcı/telefon koyu temada her ekran; Tab ile gezinti, her düğmenin adı okunuyor mu |

Seçmeli ders rehberi: `student`: `/ders-rehberi`; mezun işaretlemesi `/profil/dersler`; yönetim `/yonetim/dersler`. Ödül ve ayın mezunu içeriğini seed uydurmaz: seçim ve rıza akışı ekrandan denenir.

### Canlıya alım

Sağlayıcıya bağlı değildir; sunucu ve alan adı (K-02), gerçek SMTP (K-05), kurum verisi (K-03)
ve işletim kararı kullanıcıya aittir. Bu depo hesap açmaz veya dış servise yayın yapmaz.

- `.nvmrc` ile eşleşen Node içeren çok aşamalı `Dockerfile` uygulamayı ve ayrı worker'ı aynı
  imajdan çalıştırır. Kaynak commit'i `--build-arg GIT_SHA=<commit>` ile derleyin; çalışma zamanı
  ortamını `.env.example` ve `src/lib/env.ts` üzerinden, sırları imaja veya Git'e koymadan verin.
- `web` başlangıcı `prisma migrate deploy` uygular ve seed çalıştırmaz. Birden çok web kopyası
  açmadan önce migration'ın tamamlanmasını bekleyin; `worker` komutunu ayrı süreçte çalıştırın.
  İkisinin aynı veritabanına ve `STORAGE_LOCAL_PATH` için kalıcı, yazılabilir ortak hacme erişmesi
  gerekir. Worker için en az 90 saniyelik kapanış süresi ayırın. İmaj root olmayan kullanıcıyla çalışır. HTTPS, ters vekil, güvenli sırlar ve zamanlanmış
  yedekleri seçilen işletim ortamında sağlayın. `/api/health` durum, ortam, commit ve DB erişimini
  döndürür; test girişi ve arayüz örnekleri üretimde kapalıdır.
- Yerel imaj provası `docker-compose.image.yml` profilindedir; yalnız yerel PostgreSQL ve Mailpit
  ağına bağlanır. Ayrı `mezun_w2_p1_18_image` veritabanını önceden oluşturun, `GIT_SHA` ve geçici
  `BETTER_AUTH_SECRET` sağlayın; `docker compose -f docker-compose.image.yml --profile image up --build`
  ile web ve worker başlar. Bu profil canlı dağıtım reçetesi veya gerçek SMTP değildir.
- Yedek için PostgreSQL sunucusuyla uyumlu `pg_dump`, `pg_restore`, `psql`, `tar` ve SHA-256 aracı
  ve Node.js gerekir. Bağlantı URI’si komut argümanlarına konmaz; Prisma `schema` seçeneği yoksayılır (tüm DB yedeklenir),
  desteklenmeyen diğer URI seçenekleri reddedilir.
  Web ve worker'ı durdurarak DB ile dosyaların tutarlı anını alın; `DATABASE_URL` ve
  `STORAGE_LOCAL_PATH` tanımlıyken `sh scripts/backup.sh YENI_DIZIN` kullanın. Geri yükleme yalnız
  güvenilir yedekten, boş ayrı veritabanına ve henüz olmayan dosya yoluna yapılır:
  `RESTORE_DATABASE_URL=... RESTORE_STORAGE_PATH=... sh scripts/restore.sh YEDEK_DIZINI`.
  Kaynağın `DATABASE_URL` değerini de verin; eşit hedef reddedilir. Betik checksum doğrular, mevcut
  veriyi silmez; başarısız işlem kısmi hedef bırakabilir. Yedekler kişisel veri içerir, erişimi
  sınırlandırın, şifreli saklayın ve geri yüklemeyi düzenli olarak ayrı ortamda sınayın.
- Toplu davet yalnız rızalı sistem yöneticisine açıktır; 100 adres/işlem ve yönetici başına günde
  5 işlem sınırı vardır. Kayıtlı adresler atlanır; işlem kaydında adres tutulmaz. Davet adresi
  bekleyen bildirim niyetinde şifreli tutulur, kuyruk kabulünde silinir; worker kesintiden sonra
  yeniden dener. Uygulama sırrını değiştirmeden önce bekleyen davetleri boşaltın; aksi halde eski
  adresler çözülemez. Aktarım beş başarısız denemeyle sınırlıdır; aralarda 1, 2, 4, 8 dakika
  bekler. Son deneme niyeti `FAILED` yapar ve yükü temizler; bu durum tekrar sahnelenince de
  yeniden denenmez. Operatör `notification.intent: RETRY_EXHAUSTED` uyarısını izler; kalıcı
  hata kaydında yalnız sabit hata kodu, deneme sayısı ve hata zamanı bulunur, sağlayıcı hata
  metni veya şifreli yük yoktur. Yönetici nedeni giderdikten sonra gerekirse yeni davet gönderir;
  önceki kayıt otomatik canlandırılmaz. Hesap silme kalıcı hatalı niyetleri de kaldırır.
  SMTP teslimi ayrıca worker ve sağlayıcıya bağlıdır.

## Git ve PR

Rol protokolü Git dışı `prompts/README.md`'dedir.

### Akış

- `main` daima çalışır durumdadır: temiz checkout'ta kurulum, migration ve seed sorunsuz geçer.
- Kısa ömürlü, tek amaçlı dal ve küçük PR. Ad: `feat/<konu>`, `fix/<konu>`, `docs/<konu>`,
  `refactor/<konu>`, `test/<konu>`, `chore/<konu>`.
- PR her zaman **taslak** açılır; birleştirmeyi PM sırayla, betikle yapar (betik hazıra çevirir).
- **Her PR tek push:** repo herkese açık olduğundan CI ücretsizdir, yine de gereksiz itme yapma
  (yeni itme eski CI koşusunu iptal eder); ek push (reviewer düzeltmesi dahil) PM onayıyla, tek seferde.
- Sözleşme önce: servis + ekran diye bölünen işte önce şema ve `src/contracts` sözleşme PR'ı
  birleşir.

### Commit

Conventional Commits; faz planı kimliği gövdededir:

```text
<tip>(<kapsam>): <ne değişti>

P1-07 · <gerekiyorsa neden, risk, migration/env etkisi>
```

Tipler: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `perf`, `build`, `ci`. Commit atomik
ve çalışır olmalıdır.

### Risk sınıfı (H)

PR açıklamasına ve GitHub etiketine yazılır; reviewer'ın inceleme derinliğini belirler.

- **H1** — davranış değişmez: tip, isim, test, yorum, belge.
- **H2** — yeni ekran/eylem/alan; ekleyici migration; mevcut davranış ve veri değişmez.
- **H3** — veri değiştiren/silen migration; kimlik/oturum; yetki; görünürlük/KVKK; puan/hile
  kuralı; hesap silme; dış servis, env, CI; yeni bağımlılık.

**Onay:** canlıya alıma kadar H3 için bağımsız reviewer etki incelemesi ve PM onayı yeterlidir.
Ücret ya da hesap gerektiren her şey (yeni ücretli servis, API anahtarı, dış hesap) kullanıcıya
gider. Canlıya alımdan sonra (P1-18) veri değiştiren H3 migration'ı ve dağıtım işlemleri PR başına
kullanıcı onayı ve yedek doğrulaması ister.

### PR kontrol listesi

- [ ] Plan kimliği ve kartın payı (sözleşme / servis / ekran)
- [ ] Ne ve neden değişti; H sınıfı ve gerekçesi
- [ ] Yetki, kişisel veri ve görünürlük etkisi
- [ ] Migration (geri alma adımıyla), env, yeni bağımlılık var mı?
- [ ] Koşulan kapılar; koşmayanlar açıkça
- [ ] Ekran değiştiyse “ekranda nasıl denenir” satırları (390/1440)
- [ ] Çekirdek akış değiştiyse Playwright testi
- [ ] Sır, jeton, kişisel veri diff'te ya da logda yok
- [ ] `BACKLOG.md` / `docs/decisions.md` güncellemesi gerekiyor mu?
- [ ] Yapılmayanlar

### İnceleme odağı

- iş kuralının yanlış aktör, yanlış durum, tekrar ve yarış davranışı,
- yetki ve yatay erişim (başka bölümün verisi),
- sunucu yanıtında kişisel veri sızıntısı,
- transaction, idempotency ve eşzamanlılık,
- şema/env sapması, dış servis hata yolları,
- testlerin iddiayı gerçekten kapsaması.

Reviewer kusur bulmak zorunda değildir; bulgusuz geçiş normaldir.

### Merge sonrası

- `main`'de kapılar yeşil (CI'daki hızlı üç kapı + PM'in yerel tam kapısı); çekirdek akış testleri yerel kapıda yeşil.
- Tamamlanan `BACKLOG.md` maddesi silinir; oturum günlüğü eklenmez.
- Geçici dal ve test verisi temizlenir.

### Doküman

Uygulama değişince yalnız dayanıklı belge güncellenir; şema, rota ve env listesi belgeye
kopyalanmaz (`AGENTS.md` §6).

### E-posta giden kutusu ve worker (P1-02)

SMTP ayarlarının kanonik kaynağı `.env.example` ve `src/lib/env.ts`'tir. Önceden açılmış
worktree'lerde yeni SMTP satırlarını `.env.local` dosyasına ekle; `worktree-env` mevcut dosyayı
üzerine yazmaz. Worker `parseSmtpEnv` ile yalnız e-posta ayarlarını doğrular; Better Auth sırrı
ve LinkedIn anahtarları gerekmez. Kimlik ve worker aynı SMTP alan tanımlarını kullanır.
Yerelde yalnız `127.0.0.1`/`localhost:1025` Mailpit kabul edilir; `test` runtime sahte adaptör seçer.

Çağıran, metni katalogdan hazırlayıp `src/server/jobs/email.ts` içindeki `enqueueEmail` yardımcısına
`to`, `subject`, `text`, isteğe bağlı `html`, `template`, `idempotencyKey`, isteğe bağlı
`recipientUserId` verir; sonuç `{ emailLogId }` olur. Yardımcı yalnız sunucu içindir ve SMTP
çağırmaz. Yetki/kimlik akışının kontrolü çağırandadır; bu adım kullanıcı rotası açmaz.
İstek katmanı kuyruk hatasını kendi kararlı yanıtına dönüştürür (girişte adresin kayıt durumunu
belli etmez); sağlayıcı yanıtı/hata nesnesi istemciye veya günlüğe aktarılmaz.

`pnpm dev:all` web + worker'ı başlatır. Worker kendi girişinden Node `react-server` koşuluyla
çalışır; `server-only` sınırı korunur. Kuyruk aynı worktree veritabanında `pgboss` şemasındadır;
Prisma `public` şemasına ek tablo oluşturulmaz, sözleşmedeki `EmailLog` kullanılır. Durdururken
Ctrl+C; paylaşılan konteynerleri durdurma. Test kuyruğu yalnız kendi `_test` veritabanındadır.

Yerel teslim kanıtı Mailpit `http://localhost:8025` ve `/api/v1/messages` API'sinden alınır.
Mesaj gövdesi/alıcı yalnız kısa ömürlü kuyruk yükündedir; EmailLog gövde/adres taşımaz. Başarılı
ve başarısız işler 60 saniye sonrası bakımda temizlenir; bekleyen işin saklama sınırı bir saattir.
Yalnız maskeli alıcı ve sabit olay kodu loglanır. Kalıcı durum EmailLog üzerinde kalır.
