# Mühendislik rehberi

Son güncelleme: **2026-11-07**. Ajan çalışma ve belge yönlendirmesi için önce `AGENTS.md` okunur.

## Stack

- Node.js 22+, pnpm (tek paket, monorepo değil)
- Next.js 16+ (App Router, `src/`) · React · TypeScript `strict` + `noUncheckedIndexedAccess`
- Tailwind CSS · next-intl (tek dil `tr`, önek yok)
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
- Yeni worktree'de ilk iş bu script, sonra `pnpm db:reset && pnpm db:seed`.
- **Geliştirme sunucusu yalnız kanıt alırken açılır,** iş bitince kapatılır. Aynı anda tek ağır
  iş (tam build, Playwright koşusu).
- `main`'i dalına birleştirdikten sonra migration'ları yeniden uygula (`pnpm db:migrate`).

## Test stratejisi

| Değişiklik | Asgari kanıt |
|---|---|
| Saf kural / yardımcı | Birim testi + mutasyon (kuralı kır, test düşsün, geri al) |
| Şema / migration | Boş ve seed'li veritabanında koşum + ilgili servis testi |
| Yetki / KVKK / puan | Mutlu yol + yanlış rol, başka bölüm, askıdaki kullanıcı, tekrar ve yarış negatifleri |
| Görünürlük | Sunucu yanıtı JSON'unda gizli alanı arayan sızıntı testi |
| Dış servis | Sahte adaptörle başarı, zaman aşımı ve hata yolu |
| Ekran | İlgili bileşen testi + sonuçta “ekranda nasıl denenir” (390/1440); görsel kontrol PM'in tarayıcı turunda |
| Çekirdek akış | Bir Playwright testi (`tests/e2e/`) |

Kapsam yüzdesi için test yazılmaz; yanlış aktör, yanlış durum, tekrar ve hata yolları kanıtlanır.
**Ekran kaynağını tarayan test yazılmaz** (bileşen dosyasını metin olarak okuyup desen arayan
test); kural saf işleve çıkarılır, test onu sınar. Vitest eşzamanlılığı `--maxWorkers=4`.

**Çekirdek akış testleri:** her çekirdek adım kendi akışı için bir Playwright testi bırakır
(giriş, ilk giriş akışı, CV onayı, deneyim yazma/moderasyon, arama, randevu, yönetim). CI'da her
PR'da değil, yalnız `main`'e birleşmede çalışır (özel repoda ücretsiz CI dakikası sınırlıdır);
reviewer gerekirse yerelde koşar.

## Komutlar

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm messages:check
pnpm prisma validate
pnpm build
pnpm test:e2e
pnpm evidence <yol> --as <rol>
```

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

```bash
pnpm install --frozen-lockfile
docker compose up -d             # PostgreSQL + Mailpit (yalnız 127.0.0.1)
sh scripts/worktree-env.sh       # bu worktree'ye veritabanı + port + .env.local
pnpm db:reset && pnpm db:seed    # şema + deterministik sahte veri
pnpm dev:all                     # web + worker
```

- **Worktree başına veritabanı ve port:** her worktree kendi `mezun_<slug>` (ve test için
  `mezun_<slug>_test`) veritabanını ve sabit bir port dilimini kullanır; hepsi aynı PostgreSQL
  konteynerinde. Ayrıntı yukarıda “Yerel paralel çalışma”.
- **Mailpit:** `http://localhost:8025`; giriş bağlantıları ve bütün bildirimler buraya düşer.
- **Dosyalar:** Git dışı `.data/files/`.
- **Seed:** rol başına test kullanıcıları (öğrenci, üst sınıf mentor, mezun mentor, akademisyen,
  bölüm yöneticisi, sistem yöneticisi), mentorlar, deneyimler, randevular, SSS. Her çalıştırmada
  aynı sonucu verir. Test hesapları yalnız test girişiyle açılır; bilgileri Git dışı
  `korunan/test-hesaplari.md`'de.
- Dış servisler yerelde de gerçek çalışabilir (LLM, Google Takvim, LinkedIn); anahtar yoksa sahte
  adaptör seçilir.

### Env grupları

Kanonik liste `.env.example` ve `src/lib/env.ts`'tir; burada çoğaltılmaz. Gruplar: uygulama
(`APP_ENV`, `APP_URL`, port), veritabanı, kimlik (Better Auth sırrı, LinkedIn), e-posta, LLM,
Google Takvim, depolama, iş kuyruğu. Sırlar yalnız `.env.local` ve `korunan/`'dadır.

### Telefon testi (faz sonu)

Her faz bitince kullanıcı telefondan test eder; faz içinde telefon testi yoktur.

1. Bilgisayar ve telefon aynı Wi-Fi'da.
2. `pnpm dev:lan` sunucuyu ağa açar ve telefonda açılacak adresi yazar.
3. Telefonda test girişiyle rol hesaplarına girilir (giriş bağlantısı ve LinkedIn yerel adrese
   bağlı olduğu için telefonda test girişi kullanılır).
4. “Ana ekrana ekle” ile uygulama gibi açılabilir.
5. Kontrol listesi faz kapanış paketindedir (`faz-kapanis` skill'i).

Hocaya gösterim de aynı yolla, bilgisayardan ya da telefondan, sahte veriyle yapılır.

### Canlıya alım (ileride — P1-18)

Bu bölüm P1-18'de doldurulur. Çerçeve:

- **Sunucu (K-02):** üniversite sunucusu (ücretsiz, veri Türkiye'de, veri sorumlusu ve
  sürdürülebilirlik sorusunu da çözer) ya da ücretsiz/ucuz bir seçenek. Dağıtım aracı (ör.
  Coolify, lisansı ücretsiz) o zaman seçilir.
- **İmaj:** çok aşamalı Dockerfile, Next.js `standalone`; başlangıçta `prisma migrate deploy`;
  aynı imajdan worker süreci; kalıcı dosya hacmi; sağlık kontrolü.
- **Dağıtım kanıtı:** `GET /api/health` derleme anındaki commit'i döndürür.
- **Yedek:** zamanlanmış veritabanı yedeği ve ayda bir geri yükleme denemesi.
- **Canlıda kapalı olanlar:** test girişi, `/ui-ornekleri` galeri sayfası, seed.
- **Migration güvenliği:** canlıda veri değiştiren migration öncesi yedek doğrulanır ve kullanıcı
  onayı alınır.

## Git ve PR

Rol protokolü Git dışı `prompts/README.md`'dedir.

### Akış

- `main` daima çalışır durumdadır: temiz checkout'ta kurulum, migration ve seed sorunsuz geçer.
- Kısa ömürlü, tek amaçlı dal ve küçük PR. Ad: `feat/<konu>`, `fix/<konu>`, `docs/<konu>`,
  `refactor/<konu>`, `test/<konu>`, `chore/<konu>`.
- PR her zaman **taslak** açılır; birleştirmeyi PM sırayla, betikle yapar (betik hazıra çevirir).
- **Her PR tek push:** her push CI koşturur ve özel repoda Actions dakikası sınırlıdır; ek push
  (reviewer düzeltmesi dahil) PM onayıyla, tek seferde.
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

- `main`'de kapılar yeşil; çekirdek akış testleri (CI) yeşil.
- Tamamlanan `BACKLOG.md` maddesi silinir; oturum günlüğü eklenmez.
- Geçici dal ve test verisi temizlenir.

### Doküman

Uygulama değişince yalnız dayanıklı belge güncellenir; şema, rota ve env listesi belgeye
kopyalanmaz (`AGENTS.md` §6).
