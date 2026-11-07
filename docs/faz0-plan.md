# Faz 0 planı — Altyapı

Durum: **Kapanış paketi hazır · P0-03 kullanıcı kararı bekliyor** · 2026-11-07

Kapanış notu: P0-01, P0-02, P0-04, P0-05 ve P0-06 main'e alındı; P0-03 K-14 kararına bağlıdır. Son kapılar d339e3e üzerinde geçti; ekran turundaki iki düzen bulgusu ve telefon testi açıktır. Paket: `faz0-hoca-raporu.pdf`, `faz0-teknik-rapor.pdf`, `faz0-telefon-testi.html`, `faz0-ozet.txt` (repo dışı).

Bu belge Faz 0'ın **tek hedefini** ve ona giden **altı adımı** tanımlar. Rol önce bunu, sonra
`AGENTS.md`'yi ve kartındaki kaynakları okur. Her adım kendi PR'ı (gerekirse sözleşme/servis/
ekran payları ayrı PR); PR taslak açılır, her PR tek push; birleştirmeyi PM sırayla yapar. Adım kimlikleri (P0-xx)
kartlarda ve commit gövdesinde kullanılır.

## 1. Hedef

Boş bir repodan, dört ajanın aynı makinede birbirini beklemeden çalışabildiği, kalite kapıları
ve PM'in ekran doğrulama aracı hazır, temiz checkout'ta tek komut dizisiyle ayağa kalkan bir iskelet.
Faz 0 sonunda hiçbir ürün özelliği yoktur; ama Faz 1'in her adımı doğrudan başlayabilir.

## 2. Verilmiş kararlar (tekrar sorma)

| # | Karar | Değer |
|---|---|---|
| D1 | Yığın | Next.js 16+ App Router, TypeScript strict + `noUncheckedIndexedAccess`, Tailwind, pnpm |
| D2 | Veritabanı | PostgreSQL 16+, Prisma 7 (`prisma-client` generator + `output`, `@prisma/adapter-pg`, `prisma.config.ts`) |
| D3 | Kimlik | Better Auth (Faz 1'de kurulur); Auth.js yok |
| D4 | İşler | pg-boss; worker aynı koddan ayrı süreç |
| D5 | Metin | next-intl, tek dil `tr`, önek yok; `messages/tr.json` |
| D6 | Test | Vitest; Playwright (çekirdek akış testleri ve PM'in tarayıcı turu) |
| D7 | Ortam | Yalnız yerel; Docker Compose ile PostgreSQL + Mailpit; canlı yok |
| D8 | Paralel çalışma | Worktree başına ayrı veritabanı ve port (`scripts/worktree-env.sh`) |
| D9 | Dil | Kod tanımlayıcıları İngilizce; arayüz, belge, commit Türkçe |
| D10 | Commit | Conventional Commits, plan kimliği gövdede |
| D11 | Sürümler | Beta/canary/RC yok; lockfile zorunlu |
| D12 | Repo | `mezunportal`, public (kullanıcı kararı 2026-11-07) |

## 3. Adımlar

Her adımın gizli kabul satırları: kalite kapıları yeşil; ekranlı adımda “ekranda nasıl denenir”
satırları (görsel kontrol PM'in tarayıcı turunda); koşmayan kapı açıkça yazılır.

### P0-01 · Repo iskeleti · W1 · H3 (bağımlılıklar)
**İş:** pnpm; Next.js (`src/`, App Router); TypeScript ayarı; Tailwind; ESLint + Prettier; Vitest;
next-intl ve `messages/tr.json`; `AGENTS.md`'deki klasör yapısı; `src/lib/env.ts` (Zod ile env
doğrulaması); `src/lib/errors.ts` (kodlu hata yardımcıları) ve `errors.codes` bekçi testi;
`pnpm messages:check`; `GET /api/health` (`status`, `sha`, `env`); `proxy.ts` iskeleti; güvenlik
başlıkları (`docs/security.md`); `.env.example`; `.gitignore` (`prompts/`, `.env*`, `.data/`); `.nvmrc` (CI ile aynı Node sürümü).
**Testler:** env doğrulaması eksik değişkende düşer; hata kodu bekçisi kayıtsız kodda düşer
(mutasyon); health birim testi.
**Kabul:** `pnpm dev` ile Türkçe yer tutucu ana sayfa; bütün kapılar yeşil; `/api/health`
`sha: "local"`; yanıt başlıklarında güvenlik başlıkları var.
**Bağımlılık:** K-01, K-13.

### P0-02 · Veritabanı ve Prisma · W1 · H2
**İş:** `docker-compose.yml` (PostgreSQL + Mailpit, yalnız 127.0.0.1; bu adım için dosya sahibi
W1); Prisma 7 kurulumu (D2); `src/server/db.ts` (server-only, adapter ile); ilk migration:
`University`, `Faculty`, `Department` + `pg_trgm`, `btree_gist` uzantıları; seed iskeleti
(İÜ → fakülte → YBS, K-06); `db:migrate`, `db:seed`, `db:reset`; health'e `db` kontrolü;
`docs/engineering.md` yerel bölümü doğrulanır.
**Testler:** seed iki kez çalışınca çift kayıt yok; migration boş veritabanında koşar.
**Kabul:** temiz checkout'ta `docs/engineering.md` adımlarıyla ayağa kalkar; health `db: "ok"`.
**Bağımlılık:** P0-01.

### P0-03 · CI · W2 · H3
**İş:** GitHub Actions: kurulum (önbellekli), `prisma generate`, typecheck, lint, format:check,
test (PostgreSQL servisiyle), `prisma validate`, messages:check, build — PR ve `main` için.
Ayrı iş: `test:e2e` yalnız `main`'e birleşmede (P0-06 altyapısı gelince). Dal koruması önerisi
kullanıcıya (E maddesi).
**Testler:** bir adım kasten kırılınca PR kırmızı (mutasyon).
**Kabul:** örnek PR'da bütün adımlar görünür ve yeşil; e2e işi PR'da çalışmaz, main'de çalışır.
**Bağımlılık:** P0-01 (test adımı P0-02 birleşince veritabanını kullanır).

### P0-04 · Yerel tam ortam ve örnek veri · W2 · H2
**İş:** `scripts/worktree-env.sh` (worktree adından `mezun_<slug>` ve `mezun_<slug>_test`
veritabanları, sabit port dilimi, `.env.local` yazımı, veritabanı oluşturma; ana kopyada port
3000); `pnpm dev:all` (web + worker iskeleti; worker şimdilik yalnız sağlık döngüsü);
`pnpm dev:lan` (ağa açar, telefon adresini yazar); Git dışı `.data/files/`; deterministik sahte
veri kümesi çerçevesi (rol başına test kullanıcıları ve örnek kayıtlar; modeller geldikçe ilgili
adımda büyür); `docs/engineering.md` “Telefon testi” bölümünün çalıştığı doğrulanır.
**Testler:** iki worktree aynı anda ayağa kalkar, veritabanları ve portları çakışmaz (kanıt: iki
`/api/health` yanıtı, iki ayrı veritabanı adı); script ikinci kez çalışınca mevcut ayarı bozmaz.
**Kabul:** temiz makinede `docker compose up -d` → `worktree-env` → `db:reset` → `db:seed` →
`dev:all` dizisi çalışır; Mailpit açılır; `dev:lan` telefondan açılabilen adres yazar.
**Bağımlılık:** P0-02.

### P0-05 · Tasarım sistemi ve uygulama düzeni · W1 · H2
**İş:** `src/components/ui`: Button, IconButton, Input, Textarea, Select, Checkbox, RadioGroup,
Switch, Field (etiket + hata + “i” yardım), Card, Badge, Tag, Avatar, Modal (masaüstü) / Sheet
(mobil), Tabs, Toast, Skeleton, EmptyState, ErrorState, Pagination, Stepper; `globals.css`
token'ları; düzen: mobilde üst başlık + alt gezinme, ≥ 1024 px yan menü; web app manifest + ikon;
`/ui-ornekleri` galeri sayfası (yalnız `local`/`test`). `docs/design.md`'ye uygun (basınca görünüm dahil).
**Testler:** bileşen testleri (etiket ilişkisi, odak, devre dışı sebebi); galeri `prod`'da 404.
**Kabul:** galeri PM turunda 390 ve 1440'ta görülür; klavyeyle bütün bileşenlerde gezinme; kontrast AA
(araçla ölçüm); yatay kaydırma yok.
**Bağımlılık:** P0-01.

### P0-06 · Ekip araçları · W2 · H3
**İş:** `scripts/session-start.sh` (fetch, `main` bayatlığı, worktree listesi, açık PR'lar,
BAYAT/PULL DÜŞTÜ uyarıları); Playwright kurulumu ve `tests/e2e/` iskeleti
(ilk test: ana sayfa açılır); `pnpm evidence <yol> [--as <rol>]` (390×844 ve 1440×900 tam sayfa
görüntü + konsol hatası sayımı → `pm-handoff/kanit/…`; PM'in tarayıcı turu kullanır; `--as`
test girişi gelince çalışır);
GitHub etiketleri `H1`/`H2`/`H3`.
**Testler:** `pnpm evidence /` iki görüntü ve konsol raporu üretir; session-start kuru koşuda
doğru rapor verir.
**Kabul:** iki aracın kuru koşu çıktısı sonuç dosyasında; e2e iskelet testi yerelde yeşil. PM'in
birleştirme ve iletim betikleri bu adımın değil PM'in işidir (`pm-handoff/araclar/`).
**Bağımlılık:** P0-01.

## 4. Faz düzeyinde kabul

- Temiz checkout'ta bir saatten kısa sürede bütün ortam ayağa kalkar (`README.md` adımları).
- İki worktree aynı anda çalışır, çakışmaz.
- CI yeşil; e2e işi main'de yeşil.
- Kanıt aracı (PM turu) çalışır; PM'in birleştirme betikleri kurulu.
- Faz kapanış paketi (`faz-kapanis` skill'i) üretilmiş; telefon testi: galeri sayfası telefonda
  açılır.

## 5. Kapsam dışı

Ürün özelliği, kimlik doğrulama, canlı ortam, Dockerfile ve dağıtım (P1-18).
