# Kararlar

Append-only. Bir kararı getiren PR'da, kodla birlikte yazılır; böylece kodu onaylamak kaydı da
onaylar. Her kayıt **nedenini** yazar, neyin değiştiğini değil (diff onu zaten gösterir).
Bitirme raporunda ve savunmada “bunu neden böyle yaptın” sorusunun kaynağıdır.

Biçim: `## YYYY-AA-GG · başlık` + 2–5 cümle gerekçe + varsa reddedilen seçenekler.

---

## 2026-11-07 · Staj odaklı konumlandırma
Danışman hocanın mezun portalı tezinden gelen gözlem: mezun portalları öğrenci ilgisi görmediği
için söner. Platform bu yüzden staj odaklı kuruldu; öğrencinin gelmek için gerçek sebebi
yapılandırılmış staj bilgisi ve ulaşılabilir mentorlardır. LinkedIn grubundan farkı
bulunabilirlik, kontrollü iletişim ve veri sahipliğidir (`README.md` §1).

## 2026-11-07 · Next.js + TypeScript + PostgreSQL
Kodun büyük kısmını yapay zekâ ajanları yazacağı için en güvenilir yazdıkları yığın seçildi;
ön yüz ve arka uç tek projede, tek dilde. PostgreSQL Türkçe tam metin araması, `pg_trgm`,
exclusion constraint ve iş kuyruğunu tek yerde verir. Reddedilen: ayrı backend (NestJS) —
bu ölçekte gereksiz karmaşıklık.

## 2026-11-07 · Better Auth (Auth.js değil)
Auth.js ekibi Eylül 2025'te Better Auth'a katıldı; Auth.js bakım modunda ve yeni projeler için
Better Auth öneriliyor. Auth.js v5 beta'da Temmuz 2026'da kritik kimlik doğrulama açıkları
yayımlandı. Better Auth Prisma adaptörü, e-posta bağlantısıyla giriş, LinkedIn sağlayıcısı ve
oturum iptalli ban özelliği sunuyor.

## 2026-11-07 · Redis yerine pg-boss
Kuyruk ve zamanlanmış işler PostgreSQL'de durur; ek altyapı ve maliyet yok. Bu ölçekte yeterli.

## 2026-11-07 · Şimdilik yalnız yerel; canlı ortam P1-18'de
Kullanıcı kararı: proje sonuna kadar (~8 ay) sunucuya para verilmeyecek. Coolify'ın kendisi
ücretsizdir ama sunucu gerekir. Telefon testi faz sonunda aynı Wi-Fi üzerinden yapılır.
Canlıya alım pilot öncesi, sunucu kararıyla (K-02).

## 2026-11-07 · Google Meet linki platformun kendi hesabıyla
Her mentorun Google hesabını bağlatmak hem zahmetli hem Google'ın uygulama onay sürecine takılır.
Toplantıyı platform hesabı oluşturur, davet iki tarafa gider; yalnız e-posta paylaşılır, telefon
paylaşılmaz. Gmail herkeste olduğu için Teams yerine Meet.

## 2026-11-07 · LinkedIn'den yalnız giriş; iş geçmişi PDF ile
LinkedIn'in ücretsiz katmanı yalnız ad, e-posta ve fotoğraf verir; iş geçmişi partner onayı
gerektirir. Kazıma kullanım şartlarını ihlal eder. Kullanıcı CV'sini ya da LinkedIn PDF'ini
yükler, yapay zekâ ayrıştırır, kullanıcı onaylar.

## 2026-11-07 · CV, PDF olarak doğrudan LLM'e
PDF girdisini kabul eden bir model taranmış CV'leri de ayrı OCR olmadan okur. Bu “görüntü
işleme” değil belge ayrıştırmadır. Maliyet CV başına bir sentin altında; emniyet sağlayıcıdaki
harcama sınırı ve kullanıcı başına günlük sınırdır. Uygulama içi aylık bütçe sayacından
vazgeçildi (gereksiz karmaşıklık).

## 2026-11-07 · Puan sistemi ve hile önleme
Puan yalnız doğrulanmış olaydan doğar (iki taraf onayı, moderasyon). Aynı ikiliye ayda bir puanlı
görüşme, tekrarlarda azalan çarpan. Gecikmeli puan yalnız yüksek puanlı olaylarda (kullanıcı
kararı). LinkedIn rozeti yalnız Yılın Mezunu'na; ödüller puanla otomatik değil, bölüm kararıyla.

## 2026-11-07 · Kapsamdan çıkarılanlar
Canlı sohbet (sunucu yükü, websocket), chatbot (maliyet), ayrı mobil uygulama (mobil uyumlu web
yeterli), konaklama (güvenlik/sorumluluk), dönemlik mentorluk (mezunu yorar; aynı mentorla tekrar
görüşmek zaten mümkün), şirket puanlama (itibar/hukuk riski).

## 2026-11-07 · H3'te PR başına kullanıcı onayı yok (canlıya kadar)
Sarraf'ta ortak canlı sistem ve gerçek kullanıcılar olduğu için gerekliydi. Burada her şey yerelde
ve sahte veriyle; kullanıcıyı her PR'da durdurmak işi yavaşlatır. Canlıya alıma kadar reviewer
etki incelemesi ve PM onayı yeterli; ücret/hesap gerektiren şeyler yine kullanıcıya gider.

## 2026-11-07 · Kod tanımlayıcıları İngilizce
Ajanların en güvenilir yazdığı biçim, Türkçe karakter sorunları yok. Arayüz ve belgeler Türkçe.

## 2026-11-07 · Çalışma süreci: Sarraf'ın 7 Kasım dersleri
Birleştirmeyi otomat değil PM yapar, sırayla ve betikle; iki birleştirme aynı anda koşunca biri
eski main'e göre çalışıp çakışmıştı. Her PR tek push: her push CI koşturur ve özel repoda Actions
dakikası sınırlıdır. Roller ekran görüntüsü almaz (makine yükü, çakışma); görsel kontrolü PM'in
ara sıra yaptığı tarayıcı turu ve kullanıcının faz sonu telefon denemesi yapar. Ürün/UX
kararlarını PM verir ve panoda gösterir; kullanıcıya yalnız onun verebileceği kararlar sorulur.

## 2026-11-07 · Repo adı `mezunportal` (K-01)
Kullanıcı kararı: "Repo adı mezunportal; K-01 cevaplandı." Çalışma adı MezunPortal ürün adı olarak
da kaldı; GitHub deposu `Misaki0808/mezunportal`.

## 2026-11-07 · Repo görünürlüğü public (K-13)
Kullanıcı kararı: "public yap repoyu." Önceki öneri private'tı; gerekçe: ücretsiz planda private
repoda dal koruması çalışmıyor (HTTP 403), public repoda `main` korunabiliyor. Sonuç olarak repoya
sır, kişisel veri ve gerçek test hesabı bilgisi asla girmez (`.env*`, `korunan/` Git dışı); roller ve
PM belgeleri repo dışındadır.

## 2026-11-07 · TypeScript 6.0.3 ve ESLint 9 (güncel major değil)
`typescript` son sürümü 7.x, fakat `typescript-eslint` (eslint-config-next'in kullandığı)
`typescript <6.1` ister; ESLint 10 ise eslint-config-next'in eklentilerinde (react, import, jsx-a11y)
henüz desteklenmiyor (eşlenik uyarısı). Kararlı ve uyumlu en yeni kombinasyon seçildi: TypeScript
6.0.3 + ESLint 9.39. Araç zinciri 7.x/10'u desteklediğinde yükseltilir. Reddedilen: uyarıyla
bırakmak (lint çalışma anında kırılabilir).

## 2026-11-07 · İçerik güvenlik politikası `unsafe-inline`
Next.js App Router satır içi betik üretir; nonce'lu CSP her sayfayı dinamik yapar ve önbelleği
bozar. Başlangıçta `script-src 'self' 'unsafe-inline'` kullanılır (geliştirmede ek olarak
`unsafe-eval`, HMR için `ws:`); `object-src 'none'`, `frame-ancestors 'none'`, `base-uri` ve
`form-action` `'self'`. Nonce'a geçiş, Faz 1 sonunda dinamik render maliyetiyle birlikte
değerlendirilir. HSTS yalnız `APP_ENV=prod` iken eklenir.

## 2026-11-07 · Yapılandırma tercihleri (iskelet)
Vitest `@/` takma adı `vite-tsconfig-paths` yerine `resolve.alias` ile verilir (ek bağımlılık yok).
`package.json` `"type": "module"` (Node 24 TypeScript dosyalarını doğrudan çalıştırır; `messages:check`
hata kodu kaydını `src/lib/errors.ts`'ten okur). Prettier `*.md`, `.agents/` ve `tsconfig.json`'ı kapsamaz: belgeler elle
yazılır, kapı kod ve yapılandırmaya bakar; `next build` tsconfig'i kendi biçiminde yeniden yazar. pnpm `allowBuilds`: `@parcel/watcher` ve `@swc/core`
derleme betikleri kapalı (yalnız next-intl'in kullanılmayan çıkarım araçları); yeni betik isteyen
paket kurulumu kırar ve onay gerektirir. Hata kodları `UPPER_SNAKE` yazılır: next-intl anahtardaki
noktayı yol ayırıcı sayar. `next.config.ts` `agentRules: false`: `next dev` aksi halde `AGENTS.md`'ye kendi
bloğunu yazar; o dosya yalnız kullanıcı onaylı kartla değişir.

## 2026-11-07 · Prisma 7.10.1 (npm "latest" bir RC)
`prisma` npm `latest` etiketi 8.0.0-rc.33 gösteriyor (D11: RC yok); kararlı hat 7.10.1'dir ve plan da
Prisma 7'yi söyler. `prisma`, `@prisma/client` ve `@prisma/adapter-pg` 7.10.1'e sabit. `.env`
dosyalarını Prisma 7 kendiliğinden yüklemediği için `prisma.config.ts` Node'un yerleşik
`process.loadEnvFile`'ı ile `.env.local`'ı okur (`dotenv` eklenmedi). Üretilen istemci Git dışı
`src/generated/prisma`'dadır.

## 2026-11-07 · Seed çalıştırıcısı `tsx`; Prisma betikleri
Üretilen Prisma istemcisi uzantısız içe aktarır (`./enums`), Node'un yerleşik TypeScript desteği
bunları çözemez; seed `tsx` ile çalışır (`tsx` onaylı bağımlılık, `esbuild` derleme betiği kapalı).
`prisma` ve `@prisma/engines` derleme betikleri açık onaylı (şema motoru ikilisi).

## 2026-11-07 · Veritabanlı testler ayrı proje; sessiz atlama yok
`*.db.test.ts` dosyaları Vitest `db` projesindedir ve her koşuda `DATABASE_URL_TEST` veritabanını
sıfırlayıp migration'ları boş veritabanına uygular (adı `_test` ile bitmeyen veritabanı reddedilir).
`DATABASE_URL_TEST` yoksa `pnpm test` düşer: sessizce atlayan test "yeşil" görünüp migration'ı
denetlemez. Veritabanı gerekmeyen hızlı koşu için `pnpm test:unit`. Reddedilen: `skipIf` ile
koşullu atlama.

## 2026-11-07 · `/api/health` veritabanı kapalıyken 503
Sağlık yanıtı `db: ok|down` taşır; veritabanı ulaşılamazsa HTTP 503 ve kararlı `errorCode`
(`DB_UNAVAILABLE`) döner. Bağlantı adresi, kimlik bilgisi ve sürücü hata metni yanıta ve loga girmez
(günlüğe yalnız hata türü yazılır). Dağıtım sağlık kontrolleri (P1-18) 503'ü "hazır değil" sayar.

## 2026-11-07 · `pnpm db:reset` ajan koruması
Prisma 7 `migrate reset`, bir yapay zekâ ajanından çalıştırıldığında kullanıcının açık onayı olmadan
reddediyor (`PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION`). Bu onayı ajanlar kendi başlarına vermez.
Ajanlar boş veritabanında `pnpm db:deploy` + `pnpm db:seed` kullanır; sıfırlama kullanıcıya gider.
Test veritabanı sıfırlaması ayrıdır: `_test` ad kontrolüyle global kurulumda yapılır.

## 2026-11-07 · Yerel süreçler ve worktree yalıtımı (P0-04)
Yeni süreç yöneticisi bağımlılığı yerine Node'un yerleşik süreç/ağ araçları kullanılır;
web ve worker aynı başlatıcıdan kapanır. Port `APP_URL`'den türetilir: ek env değişkenine
ve port ile adresin ayrı tutulmasına gerek kalmaz. Worktree hazırlama mevcut ayarı korur,
veritabanını sıfırlamaz; eşzamanlı port seçimi kilit ve kayıtlı worktree ayarlarıyla korunur.
Kullanıcı modeli henüz olmadığı için seed hesap üretmez; rol yer tutucuları P1-02'de büyütülür.

## 2026-11-07 · Tasarım sistemi: yerel öğeler, satır içi ikon, sistem yazı tipi
Bileşenler mümkün olduğunca yerel HTML öğelerine yaslanır: `<dialog>` (Modal/Sheet; odak tuzağı,
Esc ve arka planı etkisizleştirme tarayıcıdan gelir), `<select>`, `<input type=checkbox|radio>`
(Switch `role="switch"` ile). Gerekçe: erişilebilirliği ve mobil davranışı yeniden yazmak yerine
tarayıcıya bırakmak daha az kod ve daha az hata. İkon kütüphanesi ve ağdan yazı tipi yok: birkaç
satır içi SVG (`ui/icons`), sistem yazı tipi yığını. Modal mobilde alt sayfa, ≥ 768 px'te ortada
pencere; Sheet mobilde alt sayfa, ≥ 768 px'te sağ yan panel. Reddedilen: Radix/Headless UI (yeni
bağımlılık, bu ölçekte gereksiz).

## 2026-11-07 · Devre dışı sebebi tip düzeyinde zorunlu
`Button` için `disabled` verildiğinde `disabledReason` zorunludur (TypeScript ayırt edilmiş
birleşim); sebep düğmenin altında görünür ve `aria-describedby` ile bağlanır. Kural belgede kalmaz,
derleyici denetler. Yükleniyor durumu ayrıdır: `loading` düğmeyi kilitler (çift gönderim yok) ve
duyurur.

## 2026-11-07 · `/ui-ornekleri` kapısı güvenli tarafa düşer
Galeri yalnız `APP_ENV` `local` ya da `test` iken açılır; tanımsız, hatalı ya da `prod` değer 404
verir (`src/lib/app-env.ts`). Sayfa `force-dynamic`tir: aksi halde derleme anındaki `APP_ENV`
sayfaya gömülür ve `prod`'da açık kalabilirdi.

## 2026-11-07 · Gezinme sekmeleri yer tutucu
Ürün sayfaları Faz 1'de gelecek; alt çubuk/yan menü şimdilik genel adlarla (Ana sayfa, Deneyimler,
Mentorlar, Randevular, Profil) kurulu ve yalnız Ana sayfa bağlantıdır, diğerleri “yakında” olarak
etkisizdir. Sekme listesi ürün kararı değildir; Faz 1'de PM netleştirir (`AppShell` içindeki
`NAV_ITEMS`).

## 2026-11-07 · Bileşen testleri: jsdom, dosya başına ortam
Bileşen testleri `*.test.tsx` dosyalarında `// @vitest-environment jsdom` ile jsdom'da koşar
(`@testing-library/react`, `user-event`, `jest-dom`); Vitest ortamı genel olarak değişmez, birim
testleri node'da kalır. `@testing-library/dom`, `@testing-library/react`'ın zorunlu eş
bağımlılığıdır. Token kontrastı (`src/lib/contrast.test.ts`) `globals.css`'i okur: ekran bileşeni
kaynağını taramaz, renk değerini ölçer.

## 2026-11-07 · Yetki: saf kural + olgu yükleyici; oturum bağlantısı kapalı başlar
Yetki kararı `rules/authorization.ts`'te SAF işlevdir (olgular girer, karar çıkar; veritabanı/oturum yok),
böylece `docs/security.md` matrisi hızlı ve tablo-güdümlü sınanır. `permissions/` yalnız olguları yükler
(`loadActor`) ve kararı hata koduna çevirir; bağımlılıklar enjekte edilir (testte gerçek veritabanı + sahte
oturum). Oturumdaki kullanıcı kimliği tek yerden gelir (`permissions/session.ts`); Better Auth gelene kadar
`null` döner, yani her koruma `AUTH_UNAUTHENTICATED` verir (fail-closed). Reddedilen: kararı korumalara
dağıtmak (matrisi sınamak için her seferinde veritabanı gerekir ve kural kopyalanır).

## 2026-11-07 · Yönetici yetkisi üyelik yerine geçmez; askıdaki kullanıcıya hiçbir şey açılmaz
Matris yönetici sütunlarını “üye” gibi ✓ gösteriyor ama yetki tablosu ayrıdır. En az yetki ilkesiyle:
yönetici işlemi için kapsamı kapsayan etkin `AdminGrant` + doğrulanmış etkin üyelik birlikte gerekir
(doğrulanmamış kullanıcı yalnız kendi profilini görür kuralı yöneticiyi de bağlar). Yetki yok ise sebep
`AUTH_FORBIDDEN` olur (doğrulama durumu hakkında ipucu verilmez). Askıdaki kullanıcının oturumu zaten yoktur
(ban oturumları düşürür); yetki katmanı da kendi profilini dahil hiçbir şeyi açmaz — matristeki “kendi
profilini görür”den bilinçli olarak daha sıkı. Silinmiş hesap oturumsuz sayılır (varlık sızdırılmaz).
Gevşetmek gerekirse tek yer `evaluateAccess`'tir.

## 2026-11-07 · Kimlik ve yetki kısıtları veritabanında da durur
Kuralı yalnız uygulamaya bırakmak, bir hatada sessizce delinir. Veritabanı şunları zorlar: aynı
kullanıcı+bölüm+rolde tek etkin üyelik (kısmi benzersiz indeks), rol↔doğrulama yolu uyumu (alan adıyla mezun
doğrulanamaz), doğrulama alanı tutarlılığı, `AdminGrant` kapsam↔hedef uyumu ve tek etkin yetki
(`NULLS NOT DISTINCT`), `MentorProfile` ayar sınırları, ve `AdminAuditLog` için güncelleme/silme/TRUNCATE'i
reddeden tetikleyici (yalnız-ekleme değişmezi). Bedel: kısıtlar ham SQL'dir (Prisma ifade edemez; `migrate diff`
şemayla fark üretmez, doğrulandı) ve testler tabloları silerek temizleyemez — veritabanlı testler yalıtılmış
fixture ile çalışır, test veritabanı her koşuda sıfırlanır. Tetikleyici ihlali Prisma'da `P2003` görünür.

## 2026-11-07 · `User` tablosunda “rol” alanı yok
Better Auth admin eklentisi kullanıcıya bir `role` alanı koyabilir; yetki kararı BURADAN verilmez, yalnız
`Membership` ve `AdminGrant`'tan. Şemada böyle bir alan olmaması “yanlışlıkla rol okuma”yı imkânsız kılar
(şema testi korur). Eklenti alanı kendisi isterse P1-02 ekleyici migration ile, yetkiye bağlanmadığını
belirterek ekler. Ban alanları (`banned`, `banReason`, `banExpires`) şimdiden vardır; süresi dolmuş askı
kalkmış sayılır.

## 2026-11-07 · Rol geçişi: ekle-ve-kapat, yetki işlemde yeniden, satır kilidi
Öğrenci → mezun geçişi hiçbir satırı silmez: `STUDENT` `endedAt` alır, `ALUMNI` eklenir (ya da belge akışında
bekleyen satır doğrulanır). Yetki, geçiş işleminin İÇİNDE güncel veriyle yeniden değerlendirilir (bayat
`Actor` yetki vermez); kullanıcının üyelik satırları `FOR UPDATE` ile kilitlenir, ikinci çağrı güncel durumu
görür ve `ALREADY_TRANSITIONED` döner (idempotent, ikinci denetim kaydı yok). İşlem kaydı aynı işlemdedir:
kayıt yazılamazsa geçiş de geri alınır. İçerik ve puan `userId`'ye bağlıdır; hiçbir model `Membership`'e
yabancı anahtarla bağlanamaz (şema testi korur).

## 2026-11-07 · Sınıf hesabı: Eylül sınırı, düzeltme −3…+3
Akademik yıl Eylül'de başlar (Europe/Istanbul); gerçek kayıt/ders dönemi tarihleri bölümden bölüme
değişir, bu yüzden basit ve açıklanabilir bir sınır seçildi. Hazırlık ve dondurma düzeltme değerini (−1)
kullanır; normal süreyi (4 yıl) aşan öğrenci `extended` olarak işaretlenir ama sınıfı büyümeye devam eder
(K-08 “3. sınıf ve üstü” uzatmadakileri kapsar). Düzeltme aralığı `rules/classYear` ile veritabanı CHECK'inde
aynıdır.

## 2026-11-07 · İşlem kaydı politikası: kişisel veri ağı
`recordAdminAction` bilinmeyen eylem/hedef türünü ve kişisel veri taşıyan metadata/gerekçeyi yazmadan
reddeder (alan adı sözcükleri, e-posta/telefon/kimlik numarası desenleri). Bu bir ağdır, asıl kural “yalnız
kimlikler yazılır” olarak kalır; desenler UUID/seed kimliklerini yanlış alarma sokmaz (testle sabitlendi).
Gerekçe isteyen eylemler (`ADMIN_ACTIONS`) gerekçesiz çağrıldığında `AUDIT_REASON_REQUIRED` döner.

## 2026-11-07 · Eylemler hata fırlatmaz, `ActionResult` döner; Zod mesajı `ErrorCode`'dur
Next.js üretimde fırlatılan hata mesajlarını istemciden gizler; ekranın alanın altında kararlı koda karşılık gelen
Türkçe metni göstermesi için beklenen hatalar değer olarak döner: `{ ok, data } | { ok:false, errorCode, params?,
fieldErrors? }` (`src/contracts/result.ts`). Şemalarda hata mesajı doğrudan bir `ErrorCode`'dur (`{ error:
'DOCUMENT_TOO_LARGE' }`); `failureFromZod` bunu alan → kod haritasına çevirir, kayıtsız mesaj `VALIDATION_INVALID`
olur. Beklenmeyen hata `SERVER_UNEXPECTED` olur; ham mesaj, yığın ve değer dışarı sızmaz. Eylemin olası kodları
sözleşmede `*_ACTION_ERRORS` olarak durur (ekran hangi kodları metne çevireceğini oradan bilir).

## 2026-11-07 · Giriş yanıtı kayıt durumunu ele vermez (sözleşmede görünür)
`requestSignInLink` ve `requestEmailChange` tek bir başarılı yanıt döner: `CHECK_EMAIL`. Olası hatalar yalnız
geçersiz biçim ve hız sınırıdır; `AUTH_ACCOUNT_SUSPENDED`, `RESOURCE_NOT_FOUND` ya da `EMAIL_DOMAIN_NOT_ALLOWED`
bu eylemlerin kod listesinde yoktur (test korur). Askı bildirimi bağlantıya TIKLANDIKTAN sonra, e-posta sahipliği
kanıtlandığında `/giris?hata=AUTH_ACCOUNT_SUSPENDED` ile gösterilir.

## 2026-11-07 · Auth env'i ayrı şema; geliştirme sırrı yalnız local/test'te geçer
`BETTER_AUTH_SECRET` ve SMTP ayarları `getAuthEnv()` ile ayrı doğrulanır: aksi halde bu değişkenleri henüz taşımayan
mevcut `.env.local` dosyalarında `/api/health` ve bütün sayfalar kırılırdı. `.env.example` genel, sır olmayan bir
geliştirme değeri taşır ki yeni worktree'ler giriş akışını hemen çalıştırsın; `APP_ENV=prod` ile `dev-only…` sır
env doğrulamasını düşürür (test korur). LinkedIn anahtarları isteğe bağlıdır ve ikisi birlikte verilir.

## 2026-11-07 · Sözleşme PR'ında yeni tablolar: oturum, hesap, doğrulama, hız sınırı, mezun belgesi, e-posta kaydı
Better Auth adaptörünün istediği `Session`/`Account`/`Verification` ve `rateLimit.storage = "database"` için
`RateLimit` (süreçler ve yeniden başlatma arasında korunur; bellek deposu worker/HMR'da sıfırlanırdı).
`GraduationDocument` belge dosyasının karar anında silinmesini veritabanında zorlar (`storageKey` ↔ durum CHECK).
`EmailLog` giden kutusunun idempotans anahtarını tutar, gövde/adres tutmaz. Servis kartı için notlar: Better Auth
`telemetry` kapalı olmalı; `account.encryptOAuthTokens` açık olmalı (LinkedIn jetonları); oturumda IP/user-agent
saklanması gerekçelendirilmeli ya da kapatılmalı.

## 2026-11-07 · Telefon denemesinde geliştirme göstergesi kapalı
Faz 0 turunda Next.js göstergesi 390 px genişlikte alt gezinmedeki Ana sayfa öğesini örtüyordu.
Telefon denemesi geliştirme sunucusuyla yapıldığı için gösterge `devIndicators: false` ile kapatılır;
derleme ve çalışma zamanı hata katmanı açık kalır. [Next.js 16.4.5 belgesi](https://nextjs.org/docs/app/api-reference/config/next-config-js/devIndicators).

## 2026-11-07 · Field ipucu girişin altında
Aynı satırdaki alanlardan yalnız birinde ipucu olduğunda girişler farklı yükseklikte kalıyordu.
İpucu girişin altında, hatadan önce gösterilir; etiket satırında etiket, zorunlu işareti ve yardım
düğmesi kalır. Yardım düğmeli ve düğmesiz etiket satırları aynı asgari yüksekliği kullanır. İpucu/hata
`aria-describedby` bağları korunur, böylece düzen düzeltmesi ekran okuyucuya verilen
açıklamayı değiştirmez.

## 2026-11-07 · Audit kimlik değerlerinde biçim doğrulamalı ayrım
Telefon/kimlik numarası desenleri rastgele UUID ve seed kimliklerinin alt dizilerine denk
gelebiliyor; rol geçişi bu nedenle aralıklı olarak geri alınıyordu. Yalnız kimlik anahtarlarında
(`id`, `ids`, `Id`/`Ids` veya `_id`/`_ids` son eki) tam UUID ve 24 hex seed biçimi metin
taramasından ayrılır. Alan adı yasağı önce uygulanır; telefon/e-posta/TC biçimleri kimlik
anahtarında da reddedilir. Serbest metin ve gerekçede istisna yoktur.

## 2026-11-08 · Kayıtta bölüm seçimi ve LinkedIn kapalıyken sebep (P1-02 sözleşmesi)
PM kararı: kullanıcı kayıt sırasında bölümünü seçer. `listSelectableDepartments` oturumdaki e-postanın
alan adıyla eşleşen üniversitenin bölümlerini döner; kişisel e-postalı mezunda alan adı üniversiteyi
göstermediği için bütün bölümler döner ve doğrulama mezun belgesiyle yapılır. İstemci e-posta ya da
üniversite göndermez. LinkedIn anahtarı yoksa giriş seçeneği `enabled: false` ve bir `errorCode`
(`AUTH_PROVIDER_NOT_CONFIGURED`) taşır: ekran düğmeyi gizlemek yerine devre dışı gösterip sebebini yazar.
Başlatma eylemi hedef yolu istemciden almaz (açık yönlendirme yok).

## 2026-11-08 · Hesabım ve doğrulama gezinmesi
Profil sekmesi Hesabım merkezine açılır; doğrulama, e-posta ve çıkış buradan erişilir. Yönetim
bağlantısı yalnız sunucuda yetki korumalarını geçen yöneticilere gösterilir; yönetim sayfası ayrıca
sunucuda korunur. Giriş sonrası hedef ana sayfa kalır, doğrulanmamış üyeye doğrulama kartı gösterilir.

## 2026-11-08 · Better Auth HTTP yüzeyi beyaz liste; giriş sunucu eylemlerinden geçer
Better Auth yüzlerce uç açar (admin eklentisinin `impersonate-user`/`set-role`/`remove-user`, kayıt, parola,
doğrudan `sign-in/magic-link`). Hiçbirine istemciden ulaşılması gerekmez ve doğrudan giriş ucu bizim hız
sınırımızı ve nötr yanıtımızı atlardı. `/api/auth/` altında yalnız kullanıcının bağlantıya tıklamasıyla
tetiklenen üç GET ucu açıktır (`magic-link/verify`, `verify-email`, `callback/linkedin`); gerisi 404. Giriş,
e-posta değiştirme ve çıkış `auth.api` ile sunucu eylemlerinden yapılır. İki kat savunma: HTTP beyaz listesi
VE eklentinin rol sisteminin kapatılması (`adminRoles: []`, tek rol izinsiz): `User.role='admin'` olsa bile
`auth.api.impersonateUser` reddedilir (davranış testi). Bağlantı hataları `/giris?hata=<ErrorCode>`'a çevrilir
(askıdaki kullanıcının 403'ü dahil: Better Auth bu durumda yönlendirme değil JSON verir).

## 2026-11-08 · Hız sınırı: eylem düzeyinde kendi sayacımız, e-posta başına asıl koruma
Better Auth'un yerleşik sınırlayıcısı yalnız HTTP isteklerinde çalışır ve IP'ye dayanır; IP başlığı
taklit edilebilir. Asıl koruma e-posta başınadır (saatte 5 bağlantı: posta bombardımanını keser), istemci
adresi tamamlayıcıdır. Sayaç tek atomik `INSERT … ON CONFLICT` ile sayar (eşzamanlı 20 çağrıdan tam `max`
kadarı geçer, testli), anahtarlar HMAC ile özetlenir. Bedel: bir saldırgan bir kurbanın kotasını (5/saat)
tüketip girişini geciktirebilir; bağlantı 10 dakika geçerli ve test girişi/yönetici yolları ayrı olduğundan
kabul edildi. Better Auth'un kendi sınırlayıcısı da açık (veritabanı depolu) ve açık kalan GET uçlarını korur.

## 2026-11-08 · KVKK veri en azlığı: oturumda IP/user-agent yok, LinkedIn jetonları saklanmaz
Oturum satırında IP ve user-agent tutmak yetki kararına gerekmez; kanca (`sessionCreateBefore`) bunları null
yazar (hız sınırı IP'yi kendi anahtarında özetler). LinkedIn yalnız kimlik kanıtıdır: girişten sonra sağlayıcı
API'sine bir daha gidilmediği için erişim/yenileme/kimlik jetonları ve süreleri hiç saklanmaz
(`accountTokensStripped`). Şifreleyip saklamak (`encryptOAuthTokens`) yerine hiç saklamamak seçildi: sızabilecek
sır yok. Reddedilen: jetonları şifreli tutmak (yalnız ileride sağlayıcı API'si gerekirse).

## 2026-11-08 · Hesap bağlama: güvenilir sağlayıcı listesi boş
Aynı e-postalı LinkedIn hesabı mevcut kullanıcıya YALNIZ sağlayıcı e-postayı doğrulanmış bildirirse bağlanır
(Better Auth varsayılanı); `trustedProviders` boştur, `allowDifferentEmails` kapalıdır. Böylece doğrulanmamış
bir sağlayıcı e-postasıyla başkasının hesabını devralmak mümkün değildir.

## 2026-11-08 · Mezun belgesi: dosya yaşam döngüsü ve işlem sırası
Yükleme: dosya ÖNCE depoya yazılır, sonra kayıt; kayıt başarısızsa dosya geri silinir (artık dosya kalmaz).
Karar: aynı veritabanı işleminde yetki yeniden doğrulanır, belge satırı kilitlenir, üyelik güncellenir, işlem
kaydı yazılır ve dosya SİLİNİR; silme başarısızsa karar geri alınır (karar yazılıp dosya kalması, "dosya karar
anında silinir" kuralını bozardı). Çok nadir ters durum (silme sonrası işlem tamamlanamaz): belge bekleyen kalır
ve dosyası yoktur; yönetici gerekçeyle reddeder, başvuran yeniden yükler. Bekleyen mezun üyeliği yükleme
anında oluşur (öğrenci üyeliği onaya kadar etkin kalır, erişim kesilmez); onayda öğrenci → mezun geçişi
(`applyAlumniTransitionPlan`, giriş yılı öğrenci satırından devralınır), retle bekleyen satır `REJECTED` olup
kapanır ve yeniden başvuru yeni satır açar. Karar e-postası işlemden SONRA kuyruğa verilir (başarısızlığı
kararı etkilemez). Dosya yalnız belgenin bölümünü kapsayan doğrulanmış yöneticiye yetki kontrollü rotadan akar.

## 2026-11-08 · Kayıtta bölüm listesi ve alan adı kuralı
`listSelectableDepartments` oturumdaki e-postanın alan adıyla EŞLEŞEN üniversitenin bölümlerini döner,
eşleşme yoksa (mezun, kişisel e-posta) hepsini (PM kararı). Alan adı eşleşmesi TAM eşleşmedir: kayıtlı alan
adının alt alan adı ya da benzeri (`x.ogr…`, `evil-ogr…`) eşleşmez; başka üniversitenin adresi bu
üniversitenin bölümünü doğrulayamaz. Öğrenci ve personel listesi aynı alan adını içerirse iki rol de
beyan edilebilir. Mezun alan adıyla asla doğrulanmaz.

## 2026-11-08 · Sunucu eylemi gövde sınırı 6 MB
Next.js 16 sunucu eylemleri varsayılan olarak 1 MB gövde kabul eder; 5 MB PDF + çok parçalı form zarfı için
`experimental.serverActions.bodySizeLimit = '6mb'` (`next.config.ts`; testle sabit). Sözleşme sınırı (5 MB)
şema ve servis katmanında ayrıca doğrulanır; gövde sınırı yalnız taşıma tavanıdır.

## 2026-11-08 · Hesap silmede yayınlanmış içerik kullanıcıya sorulur (K-09, P1-03 sözleşmesi)
PM kararı: hesap silinirken kullanıcıya sorulur; varsayılan **yayınlanmış deneyimleri sil**, isterse
**anonimleştirip bırak** (yazar bağı koparılır; hiçbir yanıtta yazar görünmez). Her iki seçenekte oturumlar
düşer, kişisel alanlar anında temizlenir, dosyalar silinir, giriş kapanır; ekran sonuçları seçeneğin altında
açıklar (`ACCOUNT_DELETION_EFFECTS`). Onay: kullanıcı kendi e-postasını yazar. Kullanıcı satırı silinmez,
anonimleştirilir: rıza ve işlem kaydı hukuki kanıt olarak kalır. Gerekçe: KVKK silme hakkı ile platform
içeriğinin sürekliliği arasında seçimi kullanıcıya bırakmak; varsayılan, en çok veriyi silen seçenektir.

## 2026-11-08 · Görünürlük karar tablosu ve iletişim talebi durumları (P1-03 sözleşmesi)
Görünürlük `rules/visibility` karar tablosundadır: sahibi hep tam görür; yönetici yalnız görev ekranında ve
maskeli görür; `PRIVATE` onaylı iletişim talebiyle de açılmaz; dışarıdakine hiçbir alan dönmez. İletişim
talebinde ret gerekçesi yoktur (talep edene neden söylenmez); başkasının talebine erişim `RESOURCE_NOT_FOUND`
döner (varlığı sızmaz). Onaylı talep de “açık” sayılır: aynı ikili için yeni talep ancak kapanınca açılır.

## 2026-11-08 · KVKK sözleşmesinde çıktı ve SQL sınırları
PostgreSQL CHECK, NULL sonucu reddetmez: iletişim alanları açıkça NULL dışlanarak ve tek boyut
şartıyla korunur. Onaylı olmayan talep ya da talepte istenmeyen alan çıktıdaki `revealed` içine
giremez. JSON veri dökümünde talepler yalnız kendi skaler alanlarını taşır; genel nesne şeması
karşı tarafın e-posta/telefon nesnesini kabul edebildiği için kapalı bir şemaya daraltılır.
Bu sınırlar servis kartında da zorlanır; sözleşme doğrulaması yetkilendirmenin yerini almaz.

## 2026-11-08 · KVKK servisi: hız sınırları, hesap silmede anonimleştirme ve dosya silme (P1-03 servisi)
Uygulama hız sınırları yeni tablo yerine Better Auth'un `RateLimit` tablosunda, `app:` önekli anahtarla ve
tek atomik SQL'le (sabit pencere) tutulur: iletişim talebi günde 10, veri dökümü saatte 5, hesap silme
denemesi saatte 5. Hesap silmede kullanıcı satırı anonimleştirilir (ad yer tutucu, e-posta
`deleted-<id>@deleted.invalid`, telefon/görsel boş): rıza ve işlem kaydı kanıt olarak bağlı kalır, eski
e-postayla bu hesaba giriş yolu kalmaz. Bekleyen belge dosyası varken dosya silme bağlı değilse işlem hiç
başlamaz. Depolama adaptörü bağlıdır; dosyalar commit öncesinde idempotent silinir. Silme hatasında
hesap ve belge anahtarları rollback ile korunur; tekrar denenebilir. Kısmi dosya silinip commit
başarısız olursa bekleyen belge yeniden yüklenebilir (belge kararıyla aynı dış sistem sınırı). İletişim talebinde yalnız “onaylı
talebe açık” alan istenebilir (PRIVATE kimseye açılmaz, MEMBERS zaten görünür).

## 2026-11-08 · E-posta giden kutusu: işlemli kayıt, sınırlı taşıma
EmailLog ve pg-boss işi aynı PostgreSQL işleminde eklenir; idempotency anahtarı için transaction
kilidi hem eşzamanlı istekleri hem worker teslimlerini sıralar. Şablon metnini çağıran hazırlar;
worker yalnız taşır. EmailLog gövde/adres içermez; pg-boss yükleri kısa süreli saklanır ve ham
SMTP yanıtları kaydedilmez. Geçici hatalar iki kez yeniden denenir; terminal broker hataları
ayrı kuyrukla kalıcı, gövdesiz kayda dönüşür.

SMTP dış sistemdir: sağlayıcı kabulünden hemen sonra süreç/bağlantı kaybolursa yerel SENT kaydı
commit olmadan kalabilir. Bu dar belirsizlikte yeniden deneme çift teslim üretebilir; Message-ID
idempotency anahtarının sabit özetinden üretilir ama SMTP genelinde kesin tek teslim garantisi
vermez. Bu adım normal yinelenen çağrıları ve kayıtlı SENT teslimlerini engeller; böyle bir garantiyi
varmış gibi sunmaz. Sağlayıcı düzeyinde idempotency API'si P1-18 sağlayıcı kararıyla değerlendirilir.

## 2026-11-08 · Hesap silme ve belge yükleme aynı kullanıcı kilidini paylaşır

Hesap silme kullanıcı satırını işlem başında kilitler, silinme işaretini koyar ve belge anahtarlarını
kilit altında toplar; işlem sonrasında kalan kayıtlı anahtarları yeniden tarar. Belge yükleme de aynı
kullanıcı satırını kilitleyip silinmiş hesabı reddeder ve önceden yazılan dosyayı temizler. Böylece
silme sürerken başlayan yükleme silinmiş hesaba belge kaydı ve artık dosya bırakamaz.

## 2026-11-08 · Giriş ekranında odaklı düzen (PM ekran turu kararı)
Giriş ve e-postanı kontrol et sayfalarında uygulama alt gezinmesi/yan menü yerine logo ve içerik
vardır. LinkedIn yapılandırılmamışsa düğmesi ve ayraç gösterilmez; açıkken formun üstünde ikonlu
ikincil düğmedir. E-posta sözcüğü bölünmez, alan ipucu öğrenci/akademisyene üniversite,
mezuna kişisel adresini önerir; sabit üniversite alan adı arayüze yazılmaz.

## 2026-11-08 · KVKK ekranında onay kapısı ve hukuki taslaklar
Giriş sonrası ana sayfa, hesap ve doğrulama ekranları sunucunun rıza durumundaki `blocking`
sonucuyla onay adımına gider; ekran rıza/yetki kuralını tekrar hesaplamaz. Zorunlu onaylar ilk
kayıtta ve yeni sürümde boş başlar; aktarım rızası isteğe bağlıdır. Hukuki sayfalar mevcut
taslaklardan gelir, K-03 yer tutucusu ve hukuk onayı durumu açıkça gösterilir. Rızalar otomatik
verilmez; ekran kanıtı aracının test girişi de onay adımında durabilir.

## 2026-11-08 · P1-04 profil tamamlama ve pilot etiketler (PM kararı)

Profil yüzdesi kullanıcıya uygulanabilir adımların eşit ağırlıklı oranıdır; açık olmayan mentor adımı
paydaya ve eksiklere girmez. Rol ve bölüm beyanı zorunludur, diğer adımlar atlanabilir ama atlananlar
eksik sayılır. CV adımı P1-06'da paydaya eklenir. İlgi ve hedef etiketleri pilot için sabit seed ile
başlar, sonraki aşamada değiştirilebilir. Profil verisi P1-04 servisinde hesap silme/anonimleştirme
ve yalnız kendi verisini içeren veri dökümü akışlarına bağlanır.

## 2026-11-08 · P1-04 açık “atla” biçimi (PM kararı)

Atlanabilir adımın durumu `COMPLETED | SKIPPED | PENDING` olarak saklanır; “tercih etmedim” (`interested:
false`) bir cevaptır, atlama değildir, boş seçim de kaydetme sayılmaz. Atlama kayıtlı veriyi silmez ama
adım yüzdede eksik kalır; ilerleme noktası kalıcıdır. Rol ve bölüm adımı atlanamaz; ilk girişi bitirmek
kalan bekleyen adımları atlanmış sayar. Gerekçe: ekran ile servis aynı ayrımı tek yerden okur ve sonradan
“eksik adımı tamamla” daveti yalnız gerçekten atlananı hedefler.

## 2026-11-08 · P1-04 profil yazımı ve KVKK yaşam döngüsü

İlk giriş kayıtları hesap silmeyle aynı kullanıcı satırını kilitler ve hesap durumunu kilitten sonra
yeniden okur; böylece eşzamanlı kayıt silinmiş hesaba profil bırakamaz. Profil yayınlanmış içerik
değildir: K-09'un iki seçeneğinde de profil ve etiket ilişkileri silinir, ortak sözlük kalır. JSON dökümü
yalnız kullanıcının kendi profilini açık alan seçimiyle içerir. Mentor isteği bir tercihtir, üyeliği
doğrulamaz ve etkin mentor profili açmaz. P1-07 deneyim verisi gelene kadar öğrencinin mentor adımı
güvenli biçimde kapalıdır; sınıf düzeltmesi sunucudaki üyelikten hesaplanır.

## 2026-11-08 · CV hattı: kullanıcıya bağlı tablolar, sağlayıcıdan bağımsız LLM
CV'den gelen kalemler (eğitim, pozisyon, dil, sertifika, beceri) `Profile`'a değil doğrudan `User`'a bağlıdır:
P1-05'in bağımlılığı P1-03'tür, `Profile` P1-04'te gelir ve iki adım birbirini beklemesin. Beceri, `data.md`
taslağındaki `Tag(SKILL)` yerine `Skill` sözlüğü + `UserSkill` olarak kuruldu (şirket/unvanla aynı eşleme yolu;
birleştirme TD-010). LLM sağlayıcısı K-04'te açık olduğundan arayüz yalnız PDF, talimat ve JSON Şeması alır, ham
`unknown` döner; doğrulama servistedir. Sahte adaptör `local`/`test`'te çalışır ve `prod`'da env doğrulamasını
düşürür. Reddedilen: sağlayıcı SDK'sına bağlı arayüz (K-04 cevabı hattı yeniden yazdırırdı).

## 2026-11-08 · CV önerisi yalnız açık kararla yazılır
Fark üç sonuç verir: yeni, değişen, çakışan (elle düzeltilmiş kalem). Uygulama yalnız kullanıcının kalem kalem
kabul ettiği anahtarları yazar; çakışan kalem ayrıca `overwriteMine` ister; kullanıcı öneriyi onay ekranında
düzeltirse kalem "elle düzeltilmiş" olur ve sonraki CV'de çakışma olarak çıkar. CV'de olmayan değer fark sayılmaz
(eksik bilgi profildekini silmez). Kalem anahtarı yalnız öneriden türer; profil/CV değişmişse karar reddedilir
(`CV_REVIEW_STALE`) ve hiçbir şey yazılmaz. Sözlükte eşleşmeyen değer yalnız kullanıcı onaylayınca yönetici
kuyruğuna girer (atılan CV kuyruğu kirletmez).

## 2026-11-08 · CV yükleme sınırları ve saklama
Sayfa sayımı bağımlılıksız ve sezgiseldir (sayfa nesneleri ile `/Pages` `/Count`'unun büyüğü; sıkıştırılmış nesne
akışları açılır, ad kaçışları çözülür); asıl maliyet sınırı 5 MB + günlük sınır + sağlayıcı harcama sınırıdır.
Günlük hak yalnız doğrulamayı geçen yüklemede harcanır (sabit 24 saatlik pencere, mevcut sayaçla). Kullanıcı başına
tek işlenen ve tek onay bekleyen CV vardır (kısmi benzersiz indeks); yeni yükleme eski bekleyen sonucu atar. Yurt
dışı rızası hem yüklemede hem iş başında okunur. Son uygulanan CV dosyası kalır; uygulamada/atmada eski dosyalar,
hatada ise dosya hemen silinir; açık inceleme talebine bağlı dosya silinmez (kayıt kancası `CV_FILE_HOLDS`).

## 2026-11-08 · Deneyim görünürlüğü ve anonim çıktı sınırı (K-07, P1-07)

PM kararı: yayınlanmış içerik üniversitedeki tüm doğrulanmış üyelere görünür; bölüm/fakülte ayrımıyla
kısıtlanmaz ve başka üniversiteye açılmaz. Moderasyon kapsamı yazım anındaki bölüme göre korunur.
Anonim deneyimde yazar kendi listesi ve moderasyon dahil hiçbir çıktı şemasına girmez; eski veri
belgesindeki moderatör istisnası kaldırıldı. Depodaki yazar bağı sahiplik/hesap silme içindir; K-09
anonimleştirmede yayınlanmış içerikte boşaltılabilir. Şikâyetin raportörü de çıktıya taşınmaz.

Sözleşme eksik taslağı tür bazlı tam şablondan ayırır; tür değişince ilgisiz alanlar reddedilir.
Yayın/ret kararına ait alanlar SQL CHECK'le birlikte tutulur; yayınlama yetkisi ve durum geçişleri
servis kartında zorlanır. CV davetinin isteğe bağlı Position kimliği yalnız girdidedir; sahipliği
P1-05/06 bağlandığında sunucuda doğrulanır. Arama vektörü ve sözlük FK'sı P1-08'e bırakıldı.

## 2026-11-08 · Arama: ASCII katlamalı çift indeks ve sözcük bazlı yazım hatası toleransı
“ISTANBUL” tr-TR kuralıyla “ıstanbul” olur ve “İstanbul” kaydını bulamazdı; kullanıcı ise noktasız I'yı da noktalı
yazar. Bu yüzden üretilmiş sütun her alanı hem tr-TR küçük harf + Türkçe gövdeleme hem ASCII katlanmış basit sözlükle
indeksler (işlevler yerelden bağımsızdır; `lower()` veritabanı yerel ayarına bağlı olurdu). Yazım hatası toleransı
tüm sorgu üzerinde değil SÖZCÜK başınadır: tüm sorguya benzerlik “marker staj” gibi sorguda tek ortak sözcükle her
şeyi eşleştiriyordu. Gövde metninde yazım hatası aranmaz (ağır ve gürültülü); şirket, şehir, ülke ve tür adı
üzerinde yapılır. Sektör süzgeci şirket sözlüğü üzerindendir (`companyId` → `Company.sectorId`); şirketi sözlüğe bağlı olmayan deneyim sektör süzgecinde çıkmaz.
Yazarı silinmiş, askıdaki ya da yazar bağı kopmuş (K-09 anonimleştirme) deneyim içeriği korur ama yazarsız görünür.


## 2026-11-08 · İlk giriş adımlarına dönüş

Hesabım'daki Profilim / Başlangıç adımları satırı ilk giriş tercihlerini yeniden açar;
atlanan uygulanabilir ilk adım öne gelir. Geri düğmesi kullanıcıyı önceki uygulanabilir
adıma taşır ve bu oturumda seçilmiş değerleri korur. Gerekçe: atlanan seçimler sonradan
tamamlanabilir ve kullanıcı adımlar arasında veri kaybetmeden gezinebilir.

## 2026-11-08 · Tur düzeltmesi: dönüş yolu, yönetimde rıza, geliştirme günlüğü (PM kararı)

Faz 1 ekran turunun güvenlik/KVKK bulguları için:
- Oturumsuz kullanıcı hata ekranı yerine girişe yönlenir; gitmek istediği yol `?donus=` ile taşınır ve
  yalnız site içi göreli yol kabul edilir (açık yönlendirme yerine sessizce ana sayfa).
- Rıza kapısı yönetim sayfalarını ve eylemlerini de kapsar; kontrol yetkiden sonradır.
  Deneyim moderasyonunda kuyruk, şikâyet listesi, kararlar ve yalnız moderatör yetkisiyle
  görülen detaylar da bu kapıdadır; yazarın kendi kaydına ve üyenin normal yayın erişimine ek kısıt getirilmez.
- `next dev` günlüğünde sunucu eylemi argümanları ve istek URL günlükleri kapalıdır; URL’lerde kodlanmış kişisel veri bulunabilir. Telefon testi geliştirme
  sunucusuyla yapıldığı için geliştirme günlüğü de kişisel veri kuralına tabidir.
- İletişim hedefi önizlemesi talep edilemeyen her hedefe aynı yanıtı verir.

## 2026-11-08 · Deneyim servisi: anonim çıktı, atomik moderasyon ve K-09

Detay, deneyimlerim ve moderasyon kuyruğu tek kapalı çıktı dönüştürücüsünden geçer; anonim yazar
kimliği audit metadata'sına da girmez. K-07 sorgusu doğrulanmış etkin üyeliğin üniversitesine bakar;
yetkili moderatör kendi yönetim kapsamını kullanır. Yazım anındaki bölüm sonradan değişmez.
Deneyim/şikâyet işlemleri User → Experience kilit sırasını hesap silmeyle paylaşır; hesap durumu ve
yetki işlem içinde güncel veriden tekrar okunur. Karar ile audit aynı transaction'dadır.

Yayınlanmış deneyim doğrudan düzenlenmez; ret sonrası düzenleme taslağa döner ve yeniden moderasyon
ister. Şikâyet DB sayacı 10/24 saat ve tek açık kişi/hedef kaydıyla sınırlıdır. K-09'un iki seçiminde
kişisel/yayınlanmamış içerik ve kişinin şikâyet metinleri silinir; anonimleştirme yayınlanmış deneyimde
yazar bağını koparır. Zorunlu temizleme işleyicileri ek test/özellik işleyicileriyle devre dışı kalmaz.
Kendi JSON dökümü deneyimleri bütün durumlarıyla içerir; başka kullanıcının deneyimi/kimliği eklenmez.
K-08 artık yalnız kullanıcının kendi yayınlanmış deneyimlerini sayar; sınıf eşiği ayrıca korunur.

## 2026-11-08 · CV iş denemelerinin nesli ve son dosyanın korunması

Aynı CV işi yeniden teslim edilirse attempts sayacı atomik UPDATE RETURNING ile deneme nesli olur;
sonuç/yeniden deneme yalnız o nesli günceller. Hata temizliği satırı kilitleyip güncel durum/nesli
kontrol etmeden PDF silmez: eski işin geç hatası yeni PARSED/APPLIED dosyasını yok edemez. Onaylanan
ad düzeltmeleri mevcut eğitim/dil/sertifika kalemlerine de uygulanır; CV yazımı User kilidi altında
kanonik askı/silinme kontrolünü yeniden yapar. Çıktı üst sınırı UTF-8 baytlarıyla ölçülür.

## 2026-11-08 · Deneyim ekranları: rotalar ve anonimlik sınırı (P1-07)

Deneyim yazma ve yönetimi `/deneyimlerim`, `/deneyim/yeni`, `/deneyim/[id]` (+ `/duzenle`) ve
`/yonetim/deneyimler` altındadır; `/deneyimler` yolu P1-08 akışı için boş bırakıldı. Form alanları tür
şablonundan okunur (`experienceTemplateSchema`): sözleşme değişince ekran kendiliğinden değişir, tür değişince
yeni türde sorulmayan alan içeriğe girmez ve kullanıcıya söylenir. Anonim deneyimde ekran yazar bilgisini hiç
çizmez; anonim yanıtta yazar alanı olmadığı için sahibin kendi anonim deneyimini şikâyet edememesi kullanıcının
kendi listesinden anlaşılır (ilk 50 yayınlanmış kayıt; kaçırılırsa yalnız fazladan bir düğme görünür, yetki
sunucudadır). Moderasyon kuyruğu içeriği açılır bölümde gösterir; karar ve şikâyet çözümü gerekçeli penceredir.

## 2026-11-08 · Yönetim paneli: kapsam, askı ve toplu rapor kuralları
Askıya alma Better Auth ban alanlarına yazılır ama eklentinin HTTP ucu kapalı olduğundan kendi servisimiz yazar (oturumlar
aynı işlemde silinir). Askı hesap geneli olduğu için hedefin bütün etkin üyelikleri yöneticinin kapsamında olmalıdır; aksi
halde yalnız sistem yöneticisi yapar. Yetkili kullanıcıyı yalnız sistem yöneticisi askıya alır (bölüm yöneticisi
üstünü susturamasın), kimse kendi hesabı/yetkisi üzerinde işlem yapamaz ve son sistem yetkisi kaldırılamaz. Mezun
istihdam raporu ve Excel yalnız toplu sayı verir: kişi satırı yok, yalnız sözlükle eşleşen adlar, üç kişiden küçük
gruplar bastırılır — serbest metin ve tek kişilik gruplar kimliği ele verirdi. Excel `.xlsx`tir (Türkçe karakterler için
UTF-8, CSV'nin BOM sorunu yok). Sözleşme iki dosyadır: panel sorguları (W2) ve kullanıcı/yetki eylemleri.

## 2026-11-08 · Yönetici atama/kaldırma tek kilitle sıralanır; üyelik düzeltmede geçmiş korunur
İki sistem yöneticisi aynı anda birbirini kaldırırsa yetki yüklemesi ve yazma sıralanmadığında ikisi de başarılı olup
sistemde yönetici kalmayabilirdi. Atama/kaldırma tek bir tavsiye kilidiyle sıralanır ve yetki kilitten SONRA yüklenir:
ikinci istek güncel durumda yetkisizdir. Üyelik düzeltmede bölüm/rol değişirse eski satır silinmez, kapatılır ve
yöneticice doğrulanmış yenisi açılır; yalnız yıl düzeltmesi yerinde yapılır. Bekleyen/reddedilen üyelik düzeltilmez
(kendi akışı vardır: belge onayı/ret); düzeltme rolün yıl kısıtlarına (öğrenci giriş, mezun mezuniyet, akademisyen
hiçbiri) uymak zorundadır. Rol düzeltmesinde mentor uygunluğunun yeniden hesabı bu adımda yoktur: mentor profili
yetki anında okunur, K-08 eşiği yalnız mentor olma isteğinde denetlenir.

## 2026-11-08 · Yönetim sözleşmesinde değer maskesi ve açık onay

Maskeli telefon/e-posta çıktı alanları maske biçimini doğrular; yalnız alanı masked diye adlandırmak ham
veri sızıntısını engellemez. P1-11 kartına göre yıkıcı/yetki değiştiren kullanıcı işlemleri açık
confirmed:true ister; askı kaldırma da gerekçelidir. Sözlük silme ve eşleşmeyeni atmada onay/gerekçe
sözleşmede zorunludur. Excel bağlantısı yalnız filtre şemasından geçen alanları taşır; kişisel ya da
bilinmeyen URL parametresi eklenmez. Bu alanlar ekranın onay penceresi ile sunucu doğrulamasını bağlar.

## 2026-11-08 · Profil içeriği: beceri = Tag, görünürlük sunucuda, bağlantılar izinli listeyle
Beceri modeli (TD-010) PM kararıyla `Tag` (tür SKILL) + kullanıcı-etiket bağıdır; böylece benzer yol önerisi ve dizin
tek sözlükle çalışır. Serbest yazılan beceri normalleştirilip kişisel etiket (`curated = false`) olarak açılır,
yönetici kuyruğuna düşer ve başkalarına ASLA önerilmez (başkasının metni sızmasın); hesap silinince ya da son bağı
kalkınca silinir. Eski `UserSkill` verisi taşındı, tablo daraltma migration'ına bırakıldı (TD-013). Başkasının
profilinde gizli alan yanıttan çıkarılır, `null` yazılmaz (anahtar bile sızdırmaz); hedef silinmiş/askıda/doğrulanmamış
ya da ortak üniversite yoksa varlığı sızmayan `RESOURCE_NOT_FOUND`. Sosyal bağlantılar yalnız `https` ve sabit alan adı
listesindedir (sorgu/parça atılır, IDN/alt alan benzerleri geçmez); saklı veri okunurken de yeniden doğrulanır.
CV onayına başlık/özet/şehir kalemi eklendi (bağlantı ve iletişim bilgisi LLM'den alınmaz); elle yazılan alan
çakışma olarak sorulur. "Reddet" ayrı eylem değildir: kalem için karar vermemek yazmamaktır (onaysız yazma yok).
Tamamlama göstergesi okuma anında hesaplanır (ilk giriş adımları + başlık/şehir, eğitim, ≥ 3 beceri, uygulanmış CV).

Kişisel beceri koruması yalnız yeni öneri ucunda değil ilk girişin eski SKILL liste ucunda da
uygulanır. LinkedIn kullanıcı adı yüzde kodlaması çözüldükten sonra tek ad olarak doğrulanır;
kodlanmış ayraç/kontrol ve bozuk/çift kodlama profil yolu olamaz. Beceri migration'ının geri
alması önce yeni becerileri eski modele taşır, önceki kurallı etiket/bağları korur. Yeniden
uygulama görünür adı kaybetmez ve kurallı etiketi kişisele düşürmez.

## 2026-11-08 · Yönetim yazımları yetki iptali ve hesap silmeyle sıralanır

Askı ve üyelik düzeltmesi de atama/kaldırmanın aynı tavsiye kilidini alır; güncel yetki
kilitten sonra okunur. Böylece yetkisi kaldırılan yöneticinin bekleyen yazımı sonradan
uygulanmaz. Aktörün kullanıcı satırındaki paylaşım kilidi askı/silmeyle yetki okumasını
sıralar. Hedef kullanıcı kilidi atama ve üyelik düzeltmesinden önce alınır; hesap silme ve
mezun geçişiyle ortak sıra User → Membership'tir. Silme ile yarışan atama silinmiş hesapta
etkin yetki bırakamaz ve ters satır kilidi sırası oluşmaz.

## 2026-11-08 · Yönetim paneli servis payı: eşleşmeyen değer çözümü, istihdam raporu, Excel
`UnmatchedValue.dismissedAt` (ekleyici migration): "at" kararı sütunla tutulur; çözülmüş ya da atılmış değer yeniden
gelirse yalnız sayaç artar, kuyruk yeniden açılmaz (CHECK: ikisi birden olamaz). "Bağla" değeri kaydın takma adı yapar ve
sözlük bağı boş profil kalemlerini bağlar (kalem metni değişmez; tarama pilot ölçeğinde 5.000 pozisyonla sınırlıdır, kalanı
sonraki CV ile bağlanır). Sektörde takma ad yoktur: sektöre "bağla" geçersiz, "yeni kayıt" geçerlidir. Sözlük yazmaları tür
başına danışma kilidiyle (`pg_advisory_xact_lock`) serileşir: ad/takma ad çakışma denetimi yarış altında da doğrudur;
kilit sırası her yerde tür kilidi → satır kilididir. Silinen kayda bağlı eşleşmeyen değerler kuyruğa döner.
İstihdam raporu: kişi başına tek temsilci pozisyon (güncel > en son biten), yalnız sözlükle eşleşen adlar; küçük gruplar
(< 3) `Diğer`'de birleşir, o da < 3 ise hiç gösterilmez. Excel için ExcelJS kullanıldı (`docs/engineering.md` yığınında,
onaylı); dosya bellekte üretilir, işlem kaydı ve hız sınırıyla aynı işlemdedir. Kullanıcı aramasında `LIKE` özel karakterleri
kaçırılır (Prisma `contains` kaçırmaz).

Panelde SKILL kullanım sayısı ve bağlama `Tag(SKILL)`/`ProfileTag` üzerinden yürür; eski
`UserSkill` aktif kullanım sayılmaz. Profil yazımıyla aynı etiket anahtarı kullanılır; kişisel
bağlar kurallı etikete çiftlemeden taşınır, yeniden adlandırma bağları korur, sözlük silinince
kullanıcının metni kişisel beceri olarak kalır. Excel rotası sayfa kapısına güvenmez: yetki
sonrası zorunlu onay transaction içinde, hız sayacı ve dosyadan önce doğrulanır. Audit okuması
eski metadata'nın iç içe değer/anahtarlarında da kişisel veriyi gizler. Üyelikler yetki
hesabından önce sunum amacıyla kesilmez; eski ama etkin kapsam üyeliği kaybolmamalıdır.

## 2026-11-08 · Mentor dizini: görünürlük, müsaitlik ve benzer yol kuralı (P1-09)
Dizinde yalnız görünür mentor vardır: etkin `MentorProfile`, silinmemiş ve askıda olmayan hesap, doğrulanmış etkin
üyelik, arayanla aynı üniversite (K-07); arayan kendini görmez. Süzgeçler yalnız daraltır, kapsam oturumdan gelir.
"Deneyim türü" süzgeci yalnız ADLI yayınlanmış deneyime bakar: anonim deneyim mentoru süzgeçle de ele vermez.
Müsaitlik tek kuralda (`rules/mentorAvailability`): "müsait değilim" (`pausedUntil` gelecekte) ve bu ayki kapasitenin
dolması; kapasite 0 olan mentor doludur. Doluluk veritabanı süzgecinde değil bellekte hesaplanır (kaynak enjekte edilir),
bu yüzden "yalnız müsait" sayfalaması kapasite süzgecinden SONRA yapılır; tarama pilot ölçeğinde 500 mentorla sınırlıdır.
Onaylı randevu sayacı P1-10'a kadar 0 döner (`services/mentor-load.ts`).
"Sana benzer yol izleyenler" (`rules/similarity`, saf): sektör, ilgi, beceri, hedef, bölüm örtüşmesi puanlanır; en az bir
GÜÇLÜ gerekçe (sektör/ilgi/beceri) şarttır, yalnız ortak hedef/bölüm öneri sebebi değildir. Gerekçe değerleri yalnız iki
tarafın da sahip olduğu öğelerdir; öneri havuzu yalnız müsait görünür mentorlardır; en çok 5. Profilden giriş noktaları
yalnız uygunluk bayrağı döner (randevu P1-10, CV incelemesi P1-15).
`Profile.completionScore` tek kaynak: `loadProfileCompletion`/`syncCompletionScore` (`services/profile.ts`) profil
sayfasındaki yüzdeyle aynı işlevdir; profil içeriği, ilk giriş adımı ve CV uygulama yazımları aynı işlemde günceller.
İlk giriş ekranının kendi yüzdesi (yalnız ilk giriş adımları) ayrı bir göstergedir. Üyelik doğrulaması gibi profil dışı
değişimler skoru bir sonraki profil yazımında yansıtır; okuma yolundaki yüzde her zaman güncel hesaplanır.
Pilot sözlük seed'i (TD-011, PM onaylı): sektör 10, unvan 15 (takma adlı), beceri 14; şirket yazılmaz (eşleşmeyen
kuyruğundan gelir). Tekrar koşulabilir; var olan kayda dokunmaz, başka kaydın takma adıyla çakışan takma adı atlar.

## 2026-11-08 · Üretilmiş arama sütunları ve GIN indeksleri şemada modellenir
`prisma migrate dev`, şemada olmayan GENERATED ALWAYS arama sütunları (`Experience.searchVector`/`searchKeys`) ve 6 GIN
indeksi için sonraki her migration'a yanlış `ALTER`/`DROP INDEX` yazıyordu; uygulanırsa arama bozulurdu. İndeksler
`@@index(type: Gin, ops: raw("gin_trgm_ops"))`, sütunlar `@default(dbgenerated())` ile modellenince `migrate diff` boş
çıktı. Bedel: `searchKeys` istemcide sıradan `String?` görünür; Prisma istemcisinde global `omit`
(`src/lib/prisma-options.ts`) ile hiçbir sorguda varsayılan dönmez, ham SQL arama yine okur (`searchVector`
`Unsupported` olduğundan istemcide zaten yoktur). Migration bekçi testi (`prisma/migration-guard.test.ts`) ikinci kemer
olarak kalır. Reddedilen: yalnız elle düzeltme notu (insan hatasına açık).
## 2026-11-08 · Bildirim tercihleri ve yıllık doğrulama (P1-12)

Zorunlu hesap/güvenlik iletileri kapatılamaz; diğer türler varsayılan açık olup hem kuyruğa alınırken hem de teslimden
önce güncel tercihle denetlenir. İşler İstanbul saatiyle günlük çalışır ve dönem/olay anahtarıyla yinelenir. Öğrenci
posta geçişi için doğrulanmış üyeliğin üniversitesindeki öğrenci alan adı ve mevcut sınıf hesabının dördüncü yılı
kullanılır. Mezun yanıtları seçime bağlı HMAC, 30 günlük süre ve veritabanında koşullu tek kullanım taşır; kimlik
oturumdan doğrulanır. E-posta tarayıcılarının bağlantıyı açması yanıt kaydetmez: kullanıcı ayrıca onaylar. Jeton URL
parçasında taşınır (sunucu istek günlüğüne gitmez); e-posta ile açılan farklı sekmeden dönüş için tarayıcıda geçici tutulur ve sonuçta silinir.
Bağlı olmayan mezun belgesi artıkları, yeni yükleme olasılığına karşı en az bir saat sonra taranır.
## 2026-11-08 · Kullanım metrikleri: kişisel veri içermeyen olay, bastırılmış panel (P1-13)
Kendi `Event` tablomuz; üçüncü taraf analitik yok. Kişisel veri koruması üç katmanlıdır: tür başına `strict` Zod şeması (serbest
metin alanı hiç yok, arama olayında yalnız süzgeç TÜRÜ ve sonuç kovası), veritabanı CHECK'i (düz nesne, kısa, `@`/uzun rakam
yok) ve panelde küçük hücre bastırma (ayrı kullanıcı < 3 → `OTHER`, o da < 3 ise gizli). Olay yazımı işlem dışından, ateşle-ve-unut
yapılır: başarısız ekleme açık işlemi bozmaz ve hata kullanıcı akışına yansımaz; profil eşiği olayı yazım işlemi bittikten sonra
önceki/sonraki skor karşılaştırmasıyla bir kez yazılır. Rol ve bölüm olay anındaki birincil üyelikten (akademisyen > mezun >
öğrenci) anlık görüntü olarak saklanır; sonradan rol değişse de geçmiş sayı kayar. Anonim deneyim yayın olayı kullanıcıya,
role ve bölüme bağlanmaz (anonimlik sızmasın); küçük hücre gizleniyorsa tür toplamı da gizlenir. Saklama: hesap silmede `userId` hemen,
24 ay sonra `detachOldEvents` ile kopar (zamanlı iş TD-014). Panel kapsamı `admin-access` yardımcılarıyla yüklenir (yetki işlemin içinde yeniden okunur). Excel ExcelJS ile (#32 ile aynı sürüm), `DATA_EXPORT` kaydı hedefi `USAGE_METRICS`.



### P1-13 bağımsız inceleme düzeltmesi

Panel ve Excel işlemleri işlem içinde zorunlu rızayı kontrol eder. Gizlenen küçük hücre varsa tür toplamı da gizlenir;
böylece gösterilen hücrelerin toplamdan çıkarılmasıyla küçük grubun sayısı açığa çıkmaz. Olay yazımı kullanıcı satırıyla
silinmeye karşı sıralanır ve silinmiş hesap tekrar bağlanmaz; eşzamanlı profil eşiği yazımları tekilleştirilir. CV uygulamasında eşik için skorlar işlem içinde alınır; işlemden sonra başarısız ek sorgu kullanıcıya yanlış hata döndürmez.

## 2026-11-08 · Randevu motoru: veritabanı kısıtı, takvim süpürmesi, kapasite tanımı (P1-10)
Çakışma kuralı iki exclusion constraint'tir (mentor ve öğrenci için, yalnız `REQUESTED`/`CONFIRMED`) ve aynı öğrencinin aynı
mentora yanıt bekleyen tek talebi kısmi benzersiz indeksle sınırlanır; servis önce slotu yeniden üretip doğrular, eşzamanlı
yarışta kaybeden `APPOINTMENT_SLOT_TAKEN` alır. Onayda kapasite, mentor profili satırı kilitlenerek serileştirilir: kapasite 1
iken eşzamanlı iki onaydan yalnız biri geçer. Kapasiteyi `CONFIRMED`, `COMPLETED` ve `NO_SHOW` harcar (İstanbul takvim ayı);
dizin ve randevu aynı tanımı kullanır (`services/mentor-load.ts`). Zaman aşımı D11: talepten 72 saat sonra ya da başlangıçtan
12 saat önce, hangisi erkense; süpürme ve yanıt satır kilidiyle yarışır, tek sonuç doğar.
Takvim çağrısı istekte değil `appointment.sweep` süpürmesinde yapılır: dış servis çökse de onay bozulmaz, en çok 3 deneme,
sonra (ya da adaptör kapalı / yurt dışı aktarım rızası yok) `calendarFailedAt` dolar ve mentor linki elle ekler. Gerçek Google
adaptörü kullanıcı onayını bekler (E4); arayüz, sahte adaptör ve elle link yolu tamamdır. Bildirimler commit sonrası, en iyi
gayretle ve idempotent anahtarla e-posta kuyruğuna gider (e-posta hatası randevuyu geri almaz). Hesap silmede açık randevular
sistem iptali olur ve kişisel serbest metin temizlenir. Bulgu (düzeltildi): `.ics` metin kaçışında `\;` yanlışlıkla `;`
yazılmıştı (testin beklentisi de aynı hatayı taşıyordu); mutasyon testi yakaladı.


### P1-10 incelemesi: randevu yazımında güncel hesap ve sınırlı takvim denemesi

Randevu mutasyonları yetki okunmadan önce User satırını paylaşılmış kilitle tutar; talep iki tarafı kimlik sırasıyla kilitler. Böylece askı/hesap silme yazımı beklenirken eski yetkiyle işlem tamamlanmaz ve karşılıklı taleplerde ters kilit sırası oluşmaz. Kapasite için MentorProfile, durum için Appointment kilidi korunur. Üst üste binen takvim işleri deneme hakkını satır kilidi altında ayırır; toplam üç hakkın üstüne çağrı yapmaz. Dış çağrı transaction dışında ve aynı iş anahtarıyla idempotent kalır. Hesap silme, kişinin daha önce yazdığı iptal gerekçesini de temizler; ICS metninde CR/LF'nin her biçimi kaçırılır.

Randevu talebinde slotun zaman/biçim geçerliliği doluluk süzülmeden doğrulanır; dolu geçerli slotun son kararı exclusion constraint'e bırakılır. Böylece kazanan önce commit ettiğinde de, çağrılar aynı anda yazdığında da kullanıcıya aynı SLOT_TAKEN sebebi döner; liste dolu slotları göstermemeye devam eder.

Bağımsız worker React server koşuluyla çalıştığından randevu e-posta kataloğundaki basit adlandırılmış alanlar React/Next içe aktarmadan doldurulur. Randevunun kullandığı profil kuralı da oturum bağlayan permissions giriş noktası yerine doğrudan actor/guards yardımcılarını alır. Böylece takvim süpürmesi e-posta worker'ının başlamasını engellemez; ayrı Node sürecinde gerçek iş modülü içe aktarma ve metin üretimi testlidir.

## 2026-11-08 · Görüşme sonrası yanıt ve güvenilirlik (P1-14)

PM kararı: son 12 ayda `COMPLETED` ve `NO_SHOW` sayılır; iptaller ve geri bildirim verme oranı paydaya girmez. Üçten az
görüşme Yeni, en az üçte katılım oranı %80 veya üzeri Güvenilir, diğerleri Dikkat'tir; kullanıcıya sayı ile nedeni
gösterilir. Gerçekleşme için iki tarafın olumlu yanıtı gerekir; mentor öğrencinin katılmadığını bildirirse `NO_SHOW`
olur. Her taraf yalnız bir kez yanıtlar ve diğer tarafın özel notu veri dökümüne girmez.

### CV incelemesi · talep sınırı ve dosya ömrü

Mentorun aylık sınırı İstanbul takvim ayındaki oluşturulmuş talepleri sayar; kapanmış talepler de o ayın kapasitesini tüketir. Mentor ve öğrenci satırları kilitlenerek eşzamanlı talepler sınırı aşamaz. Talep yalnız son uygulanmış CV dosyasına bağlanır; açık talepler bu dosyayı saklama süpürgesinden korur. Yanıt veya 14 günlük süre sonunda erişim hemen kesilir; başka açık talebi olmayan eski dosya temizlenir, kişinin son uygulanmış CV’si korunur. Faydalı işareti tamamlanmış talep üzerinde bir kez kaydedilir; puan P1-16 tarafından işlenir. CV inceleme bildirimleri, deneyim davetlerinden bağımsız ve varsayılan açık bir kullanıcı tercihidir.
### P1-11 incelemesi: yönetim sayfasında yanıt başlamadan kapsam denetimi

App Router yükleme sınırı yanıtı başlattıktan sonra sayfadaki red HTTP 200 kalabildiği için yönetim layout'u mevcut yetki kapısını önce çalıştırır. Proxy'nin kendisinin yazdığı istek yolu yalnız doğru yeteneği seçer; yetki yine sunucu servisinden gelir. Kapsam dışı sayfa ve kullanıcı ayrıntısı üst grup hata sınırıyla Türkçe 404 döner; eylemlerin kendi yetki denetimleri de korunur. Ortak yönetim listeleri izin verilen uzun, boşluksuz değerleri hücre içinde böler; mobil kart ve masaüstü tablo sayfayı genişletmez.

### PM kararı · Profil eşikleri ve veri saklama

`PROFILE_THRESHOLD` eşik başına kullanıcıyla bağlı son 24 aylık pencerede bir kez yazılır; bağ koparıldıktan veya pencere
dolduktan sonra yeniden geçişte yeni olay yazılabilir. KVKK veri en aza indirme için daha uzun süre yaşayan ayrı kullanıcı
işaretçisi tutulmaz.

### P1-09 incelemesi: ortak filtre gönderimi ve profil girişleri

Mentor dizini ve arama aynı filtre kabuğunu kullanır. Bekleyen gezinme sırasında Uygula yerel disabled taşır; mentor dizini de çip kaldırma/temizleme kaynaklı ikinci gezinmeyi reddeder. Uzun beceriler kartta erişilebilir tam başlıkla kısalır, öneri gerekçeleri satıra bölünür. Profil görünürlüğü denetimi geçtikten sonra mevcut mentor uygunluk servisiyle iletişim ve kapalı girişlerin nedenleri bağlanır; görünmeyen profilde ek sorgu yapılmaz. Randevu/CV incelemesi eylem ekranları kendi kartlarındadır; uygunluk bayrağı yeni yetki vermez.
### P1-12 incelemesi: ortak hesaplı uçtan uca testler

Bildirim bağlantısı testi seed öğrencisinin pozisyonuna bağlı kayıt oluşturur; profil/CV testi aynı öğrencinin pozisyonlarını temizler. Bu nedenle ortak hesap kullanan uçtan uca dosyalar tek işçiyle koşar. Her şablonun güncel tercihe uyması ve bağlantının hesap/imza/süre/tek kullanım sınırları bağımsız negatif testlerle korunur. Olay commit edildikten sonra kuyruğa yazım başarısızsa otomatik telafi bu pakette yoktur; ana işlemin başarısı korunur.

### Bildirim niyeti ve kuyruk telafisi

Moderasyon, iletişim, CV daveti ve randevu bildirimlerinde olayın niyeti iş değişikliğiyle aynı veritabanı işlemine yazılır. Niyet yalnız tür, alıcı ve kaynak kimlikleri taşır; ad, e-posta, serbest metin ve bağlantı saklamaz. Dakikalık pg-boss aktarıcısı kaydı kilitleyip mevcut tercih denetimli e-posta kapısına aynı tekilleştirme anahtarıyla yollar; başarısızlıkta kayıt kalır, başarılı kuyruk yazımından sonra silinir. Kuyruk kabulü sonrası kesintide tekrar aynı anahtar kullanılır. Randevu metni güncel kayıttan hazırlanır, silinmiş hesaplara gönderilmez.
### P1-14 incelemesi: form erişimi ve yalıtılmış iş testi

Formun taraf denetimi hesap layout'unda loading başlamadan yapılır; yabancı kullanıcı gerçek, Türkçe 404 alır. Sayfa ve gönderim eylemi kendi denetimini korur. İstek yolu yalnız proxy'nin yazdığı başlıktan seçilir, erişim kararı katılımcı servisinindir. Görüşme işi testi bağlantı ayarlarını sahte değerlerle kurup temizler; rolün yerel env dosyasına dayanmaz. İki tarafın onayı, tek yanıt ve gösterge kapsamı bağımsız yarış/negatif testleriyle korunur.

### P1-10 ekran incelemesi: yarış sonrası güncel slot ve doğru sekme

Sunucu bir slotu dolu/bayat diye reddettiğinde ekran eski seçimi bırakır, o slotu geçici listeden çıkarır ve sunucu listesini yeniden ister; hata metni korunur. Randevu listesinin rol başlığı yalnız başarılı liste yanıtıyla birlikte değişir; bekleyen ikinci tıklama veya hata, eski veriyi başka rolün başlığı altında göstermez. Görüşme formuna giriş mevcut geri bildirim servisinin taraf/zaman/gönderim kontrolünden gelir.

### P1-18 — dağıtım ve toplu davet sınırı

İşletim sağlayıcısı seçilmeden aynı imaj ayrı web ve worker süreçleri olarak çalışır; web
başlangıcı yalnız `migrate deploy` yapar, seed üretime taşınmaz. Yedek DB ile dosyayı tutarlı
almak için süreçlerin durdurulmasını, geri yükleme boş ayrı hedefi gerektirir. Toplu davet yalnız
sistem yöneticisine açılır; kayıtlı hesaplara bildirim tercihini aşarak gönderilmez. Henüz hesabı
olmayan alıcının adresi outbox içinde uygulama sırrından türetilen anahtarla kimliği doğrulanmış
şifreli tutulur; iş kaydı ve niyet aynı işlemde yazılır, başarılı aktarımdan sonra niyet silinir.
SMTP teslimi ve altyapı seçimi ayrıca işletim kararına bağlıdır.

### P1-13 ekran incelemesi: toplamdan küçük grup çıkarımını engelleme

Gizlenen hücre varsa etkin kullanıcı toplamı da gizlenir; görünür grubun kişi sayısı toplamdan çıkarılarak küçük grup hesaplanamaz. Aynı servis izdüşümü panelin HTML/RSC verisine ve Excel özetine uygulanır. Kullanım sayfasında zorunlu rıza ve yönetici yetkisi loading başlamadan kontrol edilir; rızasız/yetkisiz erişim gerçek 404, dosya rotası 403 döner. Diğer sayfaların yeniden onay akışı korunur.

Gün sonu müsaitliği sözleşmede 1440 dakikadır; yerel saat alanı 24:00 kabul etmediği için bitişte 00:00 gösterilir ve sunucuya yine 1440 gider. Alan ipucu gün sonu anlamını açıklar.
### P1-15 incelemesi: CV bildiriminde işlemsel telafi

CV talep, yanıt ve süre dolumu bildirimleri #45'in niyet kaydını aynı veritabanı işleminde oluşturur. Hızlı kuyruk denemesi başarısız olsa da niyet kalır; ortak aktarım işi aynı iş anahtarıyla mevcut CV bildirim kapısına döner. Niyette yalnız talep kimliği ve olay türü bulunur; alıcı talebin taraflarıyla yeniden eşleştirilir, not/CV/e-posta kopyalanmaz. Metinleri ve CV dosyasını temizleyen hesap silme, artık bulunmayan talebin bekleyen bildirimini de gönderimsiz sonlandırır.

### TD-017 — bildirim niyetinde sınırlı tekrar ve kalıcı hata

Çözülemeyen davet dahil aktarım hataları beş denemeyle sınırlıdır; üstel bekleme niyetin kilitli
işleminde saklanır ve kilitten sonra yeniden kontrol edilir. Son hatada yük temizlenir, sabit kodlu
kalıcı hata kaydı tutulur ve operatör günlüğüne kişisel veri içermeyen tek uyarı yazılır. Bu işletim
kaydı otomatik işin sonucudur; insan yönetici eylemi olarak kaydedilmez. Kalıcı hata aynı iş
anahtarının tekrar sahnelenmesiyle canlanmaz; diğer niyetler ve hesap silme ilerler. Geçici kuyruk
kesintilerinde aynı idempotency anahtarıyla teslim güvencesi korunur.

## 2026-11-08 · Puan motoru ve hile önleme (P1-16)

**Yazım yolu.** Puan, olayı üreten işlemin DIŞINDA ve kendi işleminde yazılır (deneyim yayını, iki tarafın onayıyla `COMPLETED`
olan görüşme, öğrencinin “faydalı” işareti). Gerekçe: moderasyon, form ve CV akışı puan hatasıyla bozulmasın; kaçan puanı günlük
`points.finalize` işi son 14 günü aynı kurallarla yeniden tarayarak tamamlar, `points.backfill` ise tarihin tamamını. Her yazım
`(userId, action, sourceType, sourceId)` anahtarıyla idempotenttir; hata sabit metinle yutulur (`points: award failed`).

**Çarpanlar.** Puan = taban × yüzde / 100, tam sayı ve aşağı yuvarlanır (ör. 10 × %25 = 2). Olay anı görüşmenin başlangıcıdır
(gecikme ve takvim ayı bundan hesaplanır). İkili tavanı sıradan bağımsızdır: aynı İstanbul ayında çarpanı > 0 başka görüşme varsa
yeni görüşme 0 alır; yoksa son 180 günde ÖNCEKİ puanlı görüşme sayısına göre %100 → %50 → %25. Geri alınan görüşme ayın hakkını
serbest bırakır; geri almak diğer kayıtları yeniden hesaplamaz. Eşzamanlı iki tamamlanma ikili advisory kilidiyle sıralanır.
Kural değişikliği yalnız yeni kayıtları etkiler (`basePoints` kayıt anını saklar).

**Gizlilik.** Hiçbir çıktıda kaynak (deneyim, randevu, CV) ya da karşı taraf kimliği yoktur: anonim deneyimin puanı yazar–içerik
bağını sızdırmaz. Puan ve geçmiş yalnız sahibine görünür; yönetici ekranları yalnız sistem yöneticisine açıktır. Hesap silinince
puan kayıtları, etiketler ve şüphe işaretleri silinir; başkalarının kayıtlarındaki karşı taraf bağı kopar.

**Kurucu üye etiketi (K-10).** Pilot süresince ilk yayınlanan ADLI deneyim etiket verir; ANONİM deneyim puan verir ama etiket
vermez (etiket herkese görünür, anonimlik sızmasın). Geri alınan etiket kendiliğinden yeniden verilmez. Pilot bitişi isteğe bağlı
`FOUNDING_MEMBER_UNTIL` (`YYYY-MM-DD`, İstanbul günü dahil; boşsa pilot açık) env'inde; bitiş sonradan değişince verilmiş etiket
korunur. Etiket, kaynağı olan puan kaydına bağlıdır: o kayıt geri alınırsa etiket düşer.

**Şüphe taraması (K-11 eşikleri, PM onayladı).** `rules/pointsSuspicion.ts` `SUSPICION_THRESHOLDS`: 24 saatte ≥ 40 puan
(`BURST`); son 90 günde toplam ≥ 15 puanın ≥ %60'ı ve ≥ 3 kaydı tek karşı taraftan (`SINGLE_COUNTERPART`); aynı ikilide iki
tarafın görüşme yanıtı ≤ 60 sn arayla ≥ 3 kez, 180 günde (`SYNC_FEEDBACK`). İşaret ceza değildir: puanı geri almaz; yalnız karar
verilene dek kullanıcının BEKLEYEN puanı kesinleşmez. Aynı kanıt (`evidenceKey`) iki kez, aynı (kullanıcı, kural) için iki açık işaret
olmaz. Sistem yöneticisi onaylarsa işarete bağlı kayıtlar `FRAUD_CONFIRMED` ile geri alınır; reddederse puana dokunulmaz.



### P1-13 ekran incelemesi: toplamdan küçük grup çıkarımını engelleme

Gizlenen hücre varsa etkin kullanıcı toplamı da gizlenir; görünür grubun kişi sayısı toplamdan çıkarılarak küçük grup hesaplanamaz. Aynı servis izdüşümü panelin HTML/RSC verisine ve Excel özetine uygulanır. Kullanım sayfasında zorunlu rıza ve yönetici yetkisi loading başlamadan kontrol edilir; rızasız/yetkisiz erişim gerçek 404, dosya rotası 403 döner. Diğer sayfaların yeniden onay akışı korunur.

## 2026-11-08 · SSS akışı: kimliksiz yayın, benzer soru kapısı, puan yayınla birlikte (P1-17)

**Gizlilik.** Soran mentora ve moderatöre, cevap yazanlar birbirine ve moderatöre hiç görünmez; yayın çıktısı yalnız soru,
cevap ve tarihtir. Moderatörün düzenlediği yayın metni soran ve TÜM cevap yazanların ad/soyadını (ek almış biçimler dahil:
“Ahmet'e”, “ahmete”) ve e-posta/telefon/kimlik numarası biçimini içeremez; denetim yayın anında sunucudadır
(`FAQ_IDENTITY_LEAK`) ve bilerek katıdır (sızıntı geri alınamaz); yalnız ad ÖNEKİ eşleşmesi engel değil moderatör onaylı uyarıdır (kart 122, aşağıda). Soru ve cevap
gönderiminde e-posta/telefon biçimi de erken reddedilir. Yayın, kaynak talebin bölümünün üniversitesindeki doğrulanmış
üyelere açıktır (K-07). Karar notu (ret gerekçesi, yönlendirme notu) yalnız soran öğrenciye görünür; bildirim e-postası notu
taşımaz.

**Benzer soru kapısı.** Yazarken `suggestSimilarFaqs` (saatte 60) en çok 5 öneri verir: tam soruda `pg_trgm` benzerliği ≥ 0,35
ya da bütün sözcüklerin tam metinde eşleşmesi. Gönderim aynı işlevi kullanır; öneri varken onaysız gönderim
`FAQ_SIMILAR_EXISTS` ile reddedilir, öğrenci önerileri gördüğünü `similarAcknowledged` ile onaylayınca geçer. Talep hız sınırı
günde 3; reddedilen deneme sayaç tüketmez (sayaç kayıtla aynı işlemdedir).

**Puan.** Yalnız yayında ve `docs/data.md` gereği yayınla AYNI işlemde yazılır (soran 2, seçilen cevap 5, seçilmeyen her cevap
1); kaynak anahtarı (talep / cevap kimliği) çift yazımı önler ve günlük uzlaştırma ile `points.backfill` aynı kuralı kullanır.
Karşı taraf kaydedilmez: soran ve cevap yazanlar birbirini tanımaz, bu da karşılıklı puan anlaşmasını zorlaştırır.

**Moderasyon.** Yayın/ret/yönlendirme talebin YAZILDIĞI bölümün kapsamıyla işlem içinde doğrulanır ve `MODERATION_PUBLISH`,
`MODERATION_REJECT`, `MODERATION_REDIRECT` ile aynı işlemde kaydedilir. Yönlendirilen öğrenci mentor dizini bağlantısını görür.
Hesap silinince yayınlanmamış talepler (cevaplarıyla) silinir, yayınlanmışta soran bağı kopar; yazılan cevaplar silinir, seçilmiş
cevap kimliksiz kalır; yayınlanan SSS kimlik taşımadığı için kalır.

## 2026-11-08 · Tur 2 düzeltmeleri: beklenen durumlar, panolu ana sayfa, ekran klavyesi

**Beklenen durumlar alarm değildir.** Rol dışı sayfa, henüz açılmayan form, giriş/doğrulama/onay gerektiren ekranlar gibi
normal sonuçlar `ErrorState` içinde ortak bir durum görünümüyle çizilir (`src/lib/expected-states.ts`): nötr simge,
`role="status"`, h1 durum başlığı ve TEK eylem. Başlık ve eylem metni katalogdadır; ham mesaj yoktur. Listede olmayan kod ya da
`onRetry` verilen satır içi kullanım gerçek hata olarak kalır ("Bir sorun oluştu", kırmızı simge, `role="alert"`). Yönetim alt
sayfalarında eylem "Yönetim paneline dön"dür (yol bağlamından).

**Ana sayfa kişisel pano.** Girişli ve doğrulanmış kullanıcıya karşılama, bekleyen işler (yanıt bekleyen iletişim/CV talebi,
doldurulacak görüşme formu, yöneticiye moderasyon sayısı; yalnız sıfırdan büyükler), rol bazlı 4 büyük kısayol ve yöneticiye
"Yönetim". Sayılar sunucuda oturumdaki kullanıcının KENDİ kayıtlarından hesaplanır (`getHomeSummary`); yönetici sayısı panel
servisinin kapsam kesişiminden gelir. Randevu talebi sayısı `/randevular`a gider; SSS kısayolu/sayısı ekranı main'e girince eklenir (kanca yorumlarda).

**Ekran klavyesi.** Yapışkan eylem çubukları (`.sticky-actions`, 8 form) ve alt gezinme, ekran klavyesi açıkken (görsel görünüm
alanı ≥ 140 px küçülür ve bir metin girişi odaktadır) gizlenir/akışa döner (`KeyboardState`). Seçenekler: (a) eylemleri her zaman
form sonuna almak — mobilde eylem çubuğunun hızlı erişimini kaybettirir; (b) çubuğu klavyenin üstünde tutmak — iOS'ta layout
görünümü küçülmediği için çubuk klavyenin ARKASINDA kalır; (c) seçilen: klavye açıkken akışa dön, kapalıyken yapışkan kal. Gerçek
cihaz doğrulaması telefon testine yazıldı (`docs/engineering.md`).

**Açık şüpheye yeni kanıt ve oturumsuz eylemde dönüş (kart 116).** Karar bekleyen işaret varken aynı kural için bulunan yeni
kanıt artık sessizce atlanmaz: işarete sayaç, son görülme ve en çok 5 sayısal özet eklenir (tekrar anahtarı listesiyle
idempotent; asıl kanıt kimlikleri değişmez, böylece onay yalnız işaretin kanıtını geri alır, kalanı sonraki tarama yeni işaretle
yakalar). Seçenekler: (a) her yeni kanıta ayrı işaret — kısmi benzersiz indeks "tek açık işaret" kuralını bozar; (b) kanıtı
işarete katıp onayda hepsini geri almak — yönetici görmediği kaydı geri almış olur; (c) seçilen: sayaç + özet. Oturumu düşmüş
kullanıcının eyleminde `AUTH_UNAUTHENTICATED` her formda ayrı ele alınmaz; sunucu eylemlerinin ortak çıkışı `failAction` girişe
`?donus=` ile yönlendirir (`safeReturnPath`), `ErrorState`'in "Giriş yap" bağlantısı da aynı yolu taşır.

**Marka paleti: İris + Mercan (kullanıcı isteği ve açık onayı, 8 Kas).** Önceki mavi/gri palet "çok sıkıcı" bulundu; İstanbul Üniversitesi
renklerine dayanmama kararı verildi. Seçilen: İris `#5B5BF6` ana, Mercan `#FF7A59` vurgu, Nane `#0F9F8F` destek, sıcak nötrler,
yalnız büyük alanda marka geçişi, `prefers-color-scheme` ile koyu tema; başlık Plus Jakarta Sans, metin Inter
(`next/font/google`, kendinden barındırılır; yeni npm bağımlılığı yok). Mercan zeminde metin koyu (beyaz AA değil), `primary`
metni `primary-soft` üstünde AA değil (soft zeminde `on-primary-soft`). Seçenekler: (a) yalnız İris + nötr — canlılık yok;
(b) Mercan'ı ana renk yapmak — beyaz metinle AA sağlanamaz; (c) seçilen: İris ana, Mercan az kullanılan vurgu. Kontrast
testi iki temayı da korur (`src/lib/contrast.test.ts`). Risk: ilk derleme ağa muhtaç (Google Fonts indirmesi).

**Mezun staj/iş ilanları: sözleşme ve veri modeli (P2-04, kart 129).** Plan `docs/faz2-plan.md`, kararlar D19 (PM, 8 Kas). İlan yazarı doğrulanmış
etkin üyelikli mezun/akademisyendir; moderasyon yazarın yazım anındaki bölümünün kapsamındadır (deneyimle aynı kalıp; `MODERATION_*`,
hedef `JOB_POSTING`); görünürlük K-07 üniversite düzeyindedir, hedef bölümler süzgeç ve eşleştirme içindir. Seçenekler ve gerekçeler:
(a) **Şikâyet:** plan "ReportTargetType genişler" diyordu, ama `Report` hedefe FK ile (Experience) bağlıdır; çok biçimli hedef için mevcut
tabloyu daraltmak yerine ayrı `JobPostingReport` seçildi (ekleyici, SSS'nin deneyimi sokmamasıyla aynı mantık). (b) **Son tarih** takvim günüdür
(`DATE`, İstanbul): ilan o günün sonuna kadar açıktır; "yayından en çok 60 gün" kuralı hem servis hem CHECK'tedir (yayın anı İstanbul gününe
çevrilir; gün sınırı testli). (c) **Okuyucu çıktısında yazar adı yoktur** (yalnız `authorKind`); `CONTACT_REQUEST` ilanında iletişim talebi bağlantısı
için `contactUserId` döner (D7), moderatör kuyruğunda görünen ad vardır. (d) **Puan:** `JOB_POSTING_PUBLISHED` 5 puan, 7 gün gecikmeli, ayda en çok
3 ilan puan getirir (fazlası çarpan 0), kesinleşmeden geri çekilen/kaldırılan ilanın puanı `POSTING_WITHDRAWN` nedeniyle geri alınır; yeni enum
değerleri (`PointAction`, `PointSourceType`, `PointRevokeReason`, `NotificationType`, `EventType`) PostgreSQL'de kaldırılamaz (geri alma notu
migration'da). (e) `PENDING` ilan son günü geçerse `EXPIRED` olur (kuyrukta bekletilmez). Hız sınırı: 30 günde 5 gönderim. Bildirim, servis ve
ekran ayrı kartlardadır (bu PR yalnız sözleşme, şema ve migration).

**Mezun ilanları: servis, D7 ve K-07 kararları (P2-04, kart 129).** (1) **D7 (PM):** `CONTACT_REQUEST` ilanında yazar kimliği okuyucuya HİÇ gitmez. `/iletisim-iste`
önizlemesi görünen ad döndürdüğü için ilan→yazar adı sızardı (ayrıca uuid7 hesap zamanını sızdırır); bu yüzden `contactUserId` sözleşmeden
kaldırıldı, iletişim talebi ilan üzerinden gider (`previewJobPostingContact`/`requestJobPostingContact`, girdi `jobPostingId`; sunucu yazarı çözer,
mevcut `ContactRequest` kaydı/bildirimi/hız sınırı; talebe sunucuca `source=JOB_POSTING` + `jobPostingId` (ilan silinirse SET NULL) + talep anındaki başlık/kurum
özeti yazılır). **Giden talep sızıntısı (W2 bulgusu, PM kararı):** giden listede hedef adı/kimliği PENDING'de görünürdü; ilan kaynaklı talepte `counterpart` artık
`null` ve `origin{başlık, kurum}` gösterilir, kimlik/ad yalnız `APPROVED`'da açılır (REVOKED'da yeniden gizli; ilan kapansa/silinse de sızmaz); veri dökümünde onaysız
giden talepte `targetId` yoktur; doğrudan profil talebi (kişiyi kendisi seçmiş) değişmedi. Önizleme ilan başlığı/kurum gösterir, olumsuz durumların hepsi tek genel yanıttır; talep notuna
"İlan: <başlık>" bağlamı eklenir; ad yalnız onayda açılır. Seçenekler: (a) uuid'siz takma ad — yeni tablo gerektirir; (b) mevcut `/iletisim-iste` — ad
sızar; (c) seçilen: ilan üzerinden, sunucuda çözümleme. (2) **K-07 (PM):** başka üniversitenin bölümü `JobPostingDepartment`'a veritabanında
bağlanabilir; kapı SERVİS katmanındadır (hedef bölümler ve kapsam bölümü yazarın üniversitesinden; gönderimde yeniden denetlenir, gerçek DB testi +
mutasyon). Tetikleyici bilerek yok: mevcut modüllerle tutarlı (kapsam servis katmanında). (3) **Süzgeç:** `organizationName` yalnız sözlüğe bağlı OLMAYAN
(serbest adlı) kurumu eşler; sözlük şirketi `companyId` ile seçilir, ikisi birlikte gönderilemez; süzgeç seçenekleri iki grubu ayrı satır verir. (4) **Puan:**
yalnız yayınlanmış (`PUBLISHED`/`EXPIRED`) ilana; ay tavanı yazar başına advisory kilidiyle sıralanır; süre dolumu puanı geri almaz, çekme/kaldırma
kesinleşmemiş puanı geri alır (`POSTING_WITHDRAWN`); `points.backfill` ilanı da işler. (5) **Süre dolumu:** `PENDING` ilan son günü geçerse
`EXPIRED` olur; taslak ve reddedilmiş ilan dokunulmaz. (6) Hesap silme yazarın ilanlarını (hedef bölüm ve şikâyetleriyle) siler; veri dökümü yalnız kendi
ilanlarını içerir.
**Girişsiz tanıtım sayfası (kullanıcı isteği, 8 Kas).** Girişsiz ana sayfada deneyim, mentor ve gerçekleşen görüşme için yalnız
sunucuda hesaplanan toplu sayılar gösterilir; üçten küçük toplam sayı yerine “Yeni başladık” görünür. Veri kaynağına ulaşılamazsa
ayrı bir belirsiz durum gösterilir. Örnek kartlar sentetiktir ve etkileşim almaz. Kahraman metni ilk HTML'de ve sabit koyu zeminde;
marka geçişi dekoratiftir. Hareket azaltma tercihinde içerik korunur ve hareket durur.

**SSS kimlik denetimi: engel ve uyarı (kart 122, PM kararıyla).** Önceki denetim 4+ harfli adları önek olarak eşleştirdiği için
"sisteme", "denizcilik" gibi sıradan sözcükler yayını engelliyordu. Türkçe yazım kuralı: özel isim ek alınca kesme alır
("Deniz'in"); kesmesiz ekli biçim ("denize", "sisteme", "Ahmete") çoğunlukla cins isimdir. Şimdi: **engel**
(`FAQ_IDENTITY_LEAK`, onayla aşılamaz) = adın tam sözcüğü (kesmeli ekli biçimler dahil: kesmede sözcük bölündüğü için tam eşleşir),
harfleri boşluk/noktalamayla bölünmüş ad, e-posta/telefon/kimlik biçimi, kullanıcı/kayıt kimliği; **uyarı**
(`FAQ_IDENTITY_WARNING`) = ad ile başlayan başka sözcük (kesmesiz ekli biçim ve önek: "sisteme", "Ahmete", "denizcilik").
Uyarıda moderatör eşleşen sözcükleri görür (en çok 5) ve "Kişisel bilgi değil, yayımla" ile `confirmNotPersonal` gönderir; yayın
olur ve `MODERATION_PUBLISH` işlem kaydına sabit gerekçe + `identityWarningConfirmed`/`warnedWordCount` (sözcükler kaydedilmez)
düşer. Seçenekler: (a) tümünü engel bırakmak — yanlış alarm; (b) önek ve ekli biçim denetimini kaldırmak — gerçek ad sızıntısı
ayırt edilemez; (c) seçilen: kesmeyle ayrılan/bölünmüş/tam ad engel, geri kalanı onaylı uyarı. Bilinen sınır: kesmesiz yazılmış
gerçek ad ("Ahmete sordum") artık engel değil uyarıdır; moderatör ad olduğunu ayırt edebilmelidir (ad moderatöre gösterilmez, yalnız
metindeki sözcük). Moderatör ekranı (uyarı + onay düğmesi) #54 main'e girince bağlanır.

**Referans kanıt zinciri (P2-03, PM kararı).** Mezun yalnız kendi onaylı iletişim talebi veya tamamlanmış görüşmesi bulunan öğrenciyi seçebilir; dosya/ekran görüntüsü alınmaz. Referans ve referansla kabul, öğrenci–mezun doğrulaması ardından kapsamlı yönetici kararıyla ilerler. Onaylanan referans 20, kabul 30 ek puandır; ikisi kendi yönetici kararından 14 gün sonra kesinleşir ve kendi bekleme süresinde iptal edilebilir. İkinci onayın iptali ilk onayın süresi dolmuş puanını geri almaz; kesinleştirme görevinin gecikmesi hak ediş tarihini değiştirmez. Aynı ikilide aynı İstanbul ayında sonraki referanslar puan çarpanı 0 alır. İnceleme işareti ceza değildir: aynı öğrenciye 180 günde üç veya 24 saatte toplam beş onaylı beyan, sıfır çarpanlı kayıtlar da sayılarak yöneticiye işaretlenir. Geri almada PostgreSQL enum değerleri kaldırılmaz; eski sürümün yeni değerleri okuyamaması durumunda veri korunarak ileri onarım gerekir.
**Ters yönlü arama ("staj arıyorum"): sözleşme ve veri modeli (P2-06, kart 140; D20/D28).** Seçimler: (1) **Rıza** yeni isteğe bağlı sürümlü belge `JOB_SEEKER_VISIBILITY`
(genel onay ekranında sorulmaz; kendi ayar ekranında önizlemeyle istenir); görünürlük **sorgu anında** son rıza satırına bakılarak denetlenir, bu yüzden geri alma
anında etkilidir (gecikmeli temizlik yok); geri alınca bekleyen talepler kapanır. (2) **Aday kimliği opaktır:** `Profile.seekerRef` rastgele (UUIDv4), kullanıcı
kimliği değildir; görünürlük kapanınca silinir, açılınca yenilenir (eski bağlantı geçersiz); `CHECK` bayrak ↔ ref tutarlılığını zorlar. Seçenekler: (a) kullanıcı
kimliğini döndürmek — uuid7 hesap zamanını sızdırır; (b) kullanıcı başına HMAC — çözümlenemez; (c) seçilen: saklanan rastgele ref. (3) **Kart beyaz listedir**
(bölüm, sınıf, ilgi etiketleri, dönem, kişisel veri biçimi ayıklanmış başlık satırı); ad/fotoğraf/e-posta/telefon/kullanıcı kimliği yoktur (şema testi
anahtar adlarını korur). (4) **D7 genelleştirildi:** `ContactRequestSource.SEEKER_PROFILE`; ilan ve aday kaynaklı taleplerde hedefin kimliği/adı yalnız `APPROVED`'da açılır
(`source !== PROFILE` kuralı; giden liste, döküm). (5) **Beyan:** mezunun "işe alım yapıyorum" beyanı `Profile.hiringDeclaredAt` (D28); aramayı yalnız doğrulanmış
etkin `ALUMNI` + beyan yapar. (6) **Hız:** günde 50 kart, ayda 20 talep; görüntülenme sayacı `Profile.seekerViewCount` (kim baktığı tutulmaz). Enum değerlerini
KULLANAN CHECK ayrı migration'dadır (PostgreSQL: yeni enum değeri aynı işlemde kullanılamaz). Rıza ve aydınlatma eki metni `docs/legal-drafts.md` §4 (taslak ⏸).


**D7 kaynaklar arası kimlik bağı (PM, kart 143).** Bekleyen iletişim talepleri kaynak ve bağlam başına tektir: PROFILE ve SEEKER_PROFILE ayrı, JOB_POSTING ilan başına ayrıdır. Böylece anonim aday/ilan talebi, bilinen profile gönderimde ALREADY_OPEN veya ortak requestId ile eşlenmez. Aday aramasını yalnız aynı SEEKER_PROFILE kaynağındaki açık talep etkiler. Hem açık hem onaylı talep tekilliği yalnız aynı kaynak/bağlam içindedir. Farklı kaynaklar birbirini engellemez ve birbirinin durumunu değiştirmez; başka kaynağın onayı bekleyenleri otomatik kapatmaz. Aynı çiftin farklı kaynaklarda birden çok onaylı kaydı olabilir; öğrenci gelen kutusunda bunları ayrı ayrı yönetir. Bu, PM’nin ilk tek-APPROVED/otomatik-kapatma kararının yerine geçer: bilinen profil onayı opak kart ile kişi arasındaki bağı açıklama izni değildir. İlan silinince kaynak anahtarı yetim kayıt id'siyle ayrılır. İndeks migration'ı veri silmez; geri almada bir çiftte birden fazla açık bağlam varsa durur (silerek çözmez), ileri onarım veya açık kullanıcı kararları gerekir.
**İlan eşleştirme (P2-05, PM kararı).** İlanın metninden etiket türetilmez: yazar sözlükten en çok beş etiket ve isteğe bağlı 1–4 sınıf alt kümesi seçer. Hedef bölüm zorunludur; sınıf seçiliyse öğrenci sınıfı içinde olmalı ve bildirim için en az bir ortak etiket bulunmalıdır. Etiketsiz ilan uygun bölüm/sınıf panosunda görünür, bildirim oluşturmaz. Yayın işlemindeki niyetler İstanbul gününe göre özetlenir; günde bir, kayan yedi günde en çok üç e-posta gönderilir. Küçük erişim sayıları (üçten az) gizlenir.

P2-05 geri alma: önce eski uygulama sürümüne dönülür; yeni eşleşme verisi korunacaksa yedeklenir. Yalnız bu özelliğin `JobMatchDigest`, `JobMatch`, `JobPostingTag` tabloları ve `JobPosting.targetGrades` sütunu kaldırılabilir; mevcut ilan/profil/etiket kayıtlarına dokunulmaz. PostgreSQL `NotificationType.JOB_MATCH` enum değeri silinmez, kullanılmadan kalır. Yerel geri alma provası yalnız ayrılmış test kopyasında yapılır; uygulanmış migration dosyaları değiştirilmez. DDL geri alındıktan sonra ileri dönüş yeni bir onarım migration’ıyla, kalan enum yeniden eklenmeden yapılır; özgün ADD VALUE satırı tekrar çalıştırılmaz.

**Şirket sayfasında gizlilik ve birleştirme (P2-09, kart 149).** Pozisyonlar bugün doğrulanmış aynı üniversite üyelerine profilde görünür olduğundan (PM A) yalnız etkin doğrulanmış ve askıda olmayan mezunlar sayılır; kişi listesi verilmez ve çalışan/geçmiş çalışan hücresi üç kişinin altında gizlenir. Gelecekte pozisyon görünürlüğü değişirse ortak `countableAlumniPositionsWhere` aynı kurala uyarlanır. Dönem ve popüler şirket eşiği deneyim satırına değil farklı yazara bakar. Aynı üniversitede anonim deneyim varsa mentor, çalışan ve dönem kesitleri birlikte bastırılır; aksi hâlde adları bilinen kesitlerle anonim yazarın kesişimi kurulabilir. Popüler sıralama anonim deneyimden etkilenmez. Şirket birleştirme geri alınamaz; deneyim, pozisyon, ilan ve eşleşmeyen değer bağlantıları taşınır, eski kimlik hedefe yönlenir ve işlem kaydı tutulur. `Company.searchKeys` ve trigram indeksi şemada modellenir; üretilmiş sütunu bekçi korur.

**Başvuru takvimi ve takip gizliliği (P2-11, kart 152).** Başvuru ayı yalnız kişinin kendi düzenleme formunda ve veri dökümünde, ayrıca en az üç farklı yazarlı toplu dağılımda kullanılır; deneyim detayına veya kartına girmez. Ayı eksik eski kayıtların mevsimi üç aya yaklaşık dağıtılır ve arayüz bu yaklaşımı açıklar. Anonim deneyim bulunan kapsamda tüm takvim kesiti gizlenir; sektör ile şirket sayılarının farkından küçük veya çakışan kümelerin çıkarılmasını önlemek için bu sektör ayları da gizlenir. Takip yalnız etkin doğrulanmış öğrenciye açıktır; hesap silmede takip ve anonimleştirilen içerikte başvuru ayı silinir. Aylık İstanbul işi outbox kullanır, teslimde güncel takip/tercih/eşik ve aynı günlük-haftalık e-posta kotası tekrar denetlenir. Niyet benzersiz anahtarı atomik ekleme ile korunur; eşzamanlı tekrarlar hata veya ikinci kayıt üretmez.
**Mülakat soru bankasında konumlandırma ve gizlilik (P2-10, kart 151).** Deneyimde yapılandırılmış pozisyon yoktur; şirket + pozisyon + dönem birleşimi anonim yazarı daraltabileceğinden pozisyon süzgeci sonraki fazın k-anonimlik değerlendirmesine bırakılır. Soru grupları en az üç farklı yazardan gelir; tekil grup sayıları yayımlanmaz. Kaynaklar sorgu anında görünürlük ve kimlik denetiminden geçer; ayrı soru tablosu tutulmaz. Kimliği engelleyen şirket bağlamı, soru ve sayım kaynaklarından ayrıdır: bağlı deneyimin geri çekilmesi veya yazarın askıya alınması diğer sorularda adını açmaz. Kimlik bağlamına yalnız halen veya moderasyon kaydıyla daha önce yayımlanmış kaynaklar girer; hiç yayımlanmamış özel taslak başkasının sorularını bastıramaz. Bu bağlam istemciye verilmez ve ayrı kişisel veri kaydı tutulmaz. Boşlukla bölünmüş telefon/e-posta da türevden düşer; aynı metnin güvenlik sonucu yalnız aynı istek ve şirket içinde yeniden kullanılır.

**Yılın Mezunu adayları ve kamuya açık doğrulama (P2-01, kart 157).** Akademik yıl İstanbul'da 1 Eylül'de başlar; aday listesi bölümün töreninden 30 gün önce dondurulur ve yalnız gerekçeli yönetici işlemiyle yeniden hesaplanır. Açık şüphe bayraklı adaylar dışarıda tutulur, şüpheli puan kayıtları sayılmaz; puan ödülü otomatik vermez. Doğrulama kodu rastgele 256 bit, kullanıcı yayını açıkça seçmeden sayfa kapalıdır ve rıza geri alındığında kapanır; hesap silme ödülü ve aday anlık görüntüsünü kaldırır. LinkedIn API kullanılmaz, yalnız sabit adrese parametreli bağlantı üretilir; kurum adı üniversite sözlüğünden, isteğe bağlı kurum kimliği yapılandırmadan gelir. Rıza metni hukuki onay bekleyen taslaktır.

Dondurma işinin çalışmadığı uzun kesintide geçmiş durum güvenilir biçimde yeniden kurulamaz. İki dakikadan geç kalmış otomatik dondurma bu yüzden sessizce güncel listeyi eski anlık görüntü diye sunmaz; yönetici gerekçeli yeniden hesaplamayla güncel durumu bilinçli olarak dondurur. D27 eki (kart 158): dondurmadan sonra doğrulanan şüphe adayı gerekçeli yeniden hesaplamaya kadar gizler; puan otomatik değişmez. Verilmiş ödül otomatik geri alınmaz; yöneticiye uyarı gösterilir ve ilk görüntülemede ödül/şüphe başına tek işlem kaydı tutulur, karar insanda kalır. Yerelde IP kotası tamamlayıcı savunmadır; yüksek entropili kodla birlikte bu kapsamda kabul edilmiştir. Canlıda güvenilir proxy/son hop kuralı TD-021 ve K-02 kapısıdır; kota aşımı da aynı bulunamadı yanıtını verir.
**Beceri açığı hedefi ve tamamlayıcı gizlilik (P2-07, kart 155).** GOAL etiketleri pozisyon olmadığı için öğrenci hedefini Title sözlüğünden açıkça seçer; profil ve kendi veri dökümünde saklanır. Aynı üniversitenin doğrulanmış etkin ve askıda olmayan her mezunu yalnız en son başlayan güncel pozisyonuna atanır; bilinmeyen başlangıçlar sona konur, eşit tarihte en eski kayıt kimliği seçilir ve hedef grupları ayrık kalır. Analizi isteyen kullanıcı, öğrenci ve mezun rolleri birlikte olsa da her hedefte kaynak kümesinden çıkarılır; kendi beceri değişikliği kaynak sayısı veya eşiği değiştiremez, diğer öğrencilerin analizinde sayılabilir. Zaman içinde mezun eklenmesi veya çıkmasıyla iki ölçümün karşılaştırılmasından doğan kalan risk, bant + yüzde beşlik adım + iki tarafta en az beş eşiğiyle PM tarafından kabul edildi. Bir beceri ancak sahip olan ve olmayan kümelerin her ikisi de en az beş kişi olduğunda görünür; grup büyüklüğü 10+/25+/50+ bandı ve yüzde beşlik adımla verilir. İlerleme yalnız güvenli satırlardan hesaplanır; bastırılan satırlar, sayıları veya toplamları yanıta girmez. Serbest kişisel beceriler sözlükle eşleşmiyorsa yayımlanmaz; uygulanan CV becerileri ve eş anlamlılar aynı sözlük kimliğinde birleşir. Profilde görünmeyen eski UserSkill satırları analize ve mentor filtresine girmez.

**Ayın mezunu bölüm kapsamı (P2-02, kart 159).** PM B kararı: her bölüm ve İstanbul takvim ayı için en çok bir mezun seçilir. Ana sayfa ve arşiv yalnız kullanıcının doğrulanmış etkin üyeliklerinin kendi bölümlerindeki, moderasyonlu ve güncel açık yayın rızalı hikâyeleri gösterir; başka bölüm/üniversite ve girişsiz tanıtım sayfası hikâyeyi alamaz. Rıza geri alındığında, açık veya doğrulanmış şüphe ortaya çıktığında ve hesap silindiğinde hikâye hemen kalkar; bu durumdaki mezun seçilemez. Bilinen diğer kişi adları ve kişisel bilgi biçimleri SSS kimlik kuralıyla denetlenir; bilinmeyen özel adları otomatik tanımanın garantisi olmadığından moderasyon gereklidir.

Ayın mezununda yalnız İris→Mercan baş harfli avatar kullanılır; uzak LinkedIn fotoğrafı üçüncü taraf isteği ve ayrı rıza gerektirdiğinden gösterilmez. Yerel fotoğraf yükleme ve sunma Faz 3'e ertelendi (PM kararı).

**Aylık özet ve ortak gönderim kotası (P2-13, kart 161).** Özet önceki takvim ayının bölüm deneyimlerini ve sorgu anında görünür diğer bölümleri kullanır; boş özet gönderilmez. İlan ve başvuru hatırlatmalarıyla ortak günlük/haftalık kotayı aşmamak için hak e-posta outbox işleminden önce kalıcı ayrılır. Kuyruğa yazma başarısız olduğunda o günün hakkı kullanılmamış olsa da korunur; ilk hafta ertesi gün yeniden denenir. E-posta tesliminde rıza, tercih ve içerik tekrar hesaplanır; içerik değişmişse eski e-posta gönderilmez. Bu seçim, çökme sonrasında kota aşımı ve artık görünmeyen verinin teslimi yerine bazı özetlerin gecikmesini kabul eder.

### P2-08 · YBS ders kaynağı

Kullanıcının verdiği 89 ders resmî seed listesidir; daha önceki hoca onayı koşulu kaldırıldı. OBS kaynağında Rusça II ve IV için aynı `FOYD0014` kodu kullanıldığından ders, bölüm + kod + yarıyıl ile ayırt edilir. Küçük sektör hücreleri ve tamamlayıcıları birlikte gizlenir.
**Etkinlik katılımı (P2-12, kart 163).** Etkinlik penceresinde iki dakikada değişen altı haneli kod ve aynı kodu taşıyan QR gösterilir. Kullanıcı onayıyla `qr` 0.7.2 seçildi (MIT veya Apache-2.0; bağımlılıksız, sunucuda çevrimdışı SVG üretir). QR bağlantısında etkinlik kimliği ve kısa kod URL parçasındadır; kişisel veri içermez ve kod sunucu günlüklerine gönderilmez. Etkinlik katılımı 5 puan, 3 gün bekleme ve İstanbul ayında dört puanlı etkinlik sınırıyla yazılır; iptal veya doğrulanmış şüphe puanı geri alır. İlk şüphe işaretinin kanıtı karar anında değiştirilmez; kalan etkinlik kanıtı günlük taramada ve puan kesinleştirilmeden önce yeniden değerlendirilir, böylece karar sırasında başka etkinlikte biriken kanıt kaybolmaz. Aynı saniyede veya aynı ağda en az üç katılım yalnız inceleme işaretidir, otomatik ceza değildir. Ağ değeri etkinliğe bağlı HMAC özeti olarak tutulur ve 30 gün sonra temizlenir; ham IP saklanmaz. Ağ başlığı güvenilir proxy yapılandırmasına bağlıdır, taklit edilebilir ve coğrafi/fiziksel katılım kanıtı değildir.

**LinkedIn profil PDF yolu (kart 172).** LinkedIn API veya kazıma yerine kullanıcının indirdiği PDF mevcut CV onay hattına kaynak işaretiyle girer; onaydan önce profil yazılmaz ve LinkedIn dosyası karar anında silinir. PDF metin çıkarıcı ve maskeleme durumu aşağıdaki kart 215 kararına göre belirlenir. Deneme modunun örnek verileri gerçek profil olarak sunulmaz.

**LinkedIn ve hikâye korumaları (kart 179).** Gerçek PDF çıkarma, maskeleme ve metin sağlayıcısı birlikte hazır değilse LinkedIn seçimi kapalıdır; hazır olunca durum portlardan türetilir. LinkedIn PDF ve karar verilmemiş öneriler yüklemeden 24 saat sonra, kuyrukta takılsalar da dakika başı temizlenir; işçi kapalıysa gecikme olabilir. Hikâyede kişi adı denetimi aynı üniversitenin etkin üyelerindeki tam adlarla sınırlanır; iletişim bilgisi denetimi korunur ve adaylar trigram indeksiyle aranır.
**Gerçek Google Takvim/Meet adaptörü (kart 174; kullanıcı kararı 9 Kas: "olmazsa olmaz").** Yeni bağımlılık yok: Google REST `fetch` ile çağrılır (resmi `googleapis` istemcisi yüzlerce MB ve gereksiz yüzey). Yenileme jetonu env'de değil **veritabanında AES-256-GCM ile şifreli** (`IntegrationConnection`); anahtar yeni bir sır olarak eklenmedi, `BETTER_AUTH_SECRET`'tan HKDF ile türetilir (bağlam AAD olarak bağlanır). Sonuç: sır değişirse bağlantı yeniden kurulur (adaptör "yeniden bağla" durumuna alır, randevu elle linke düşer). Seçenekler: (a) jetonu env'e koymak (sunucuya elle kopyalama, döndürme zor; ilk plan); (b) panelden tek seferlik OAuth + şifreli DB (seçilen; yönetici bağlar/keser, işlem kaydı `INTEGRATION_CONNECT/DISCONNECT`). OAuth kodu akışı: yalnız `calendar.events` kapsamı, `access_type=offline` + `prompt=consent`, `state` ve PKCE yöneticinin tarayıcısındaki imzalı httpOnly çerezde (yöneticiye, 10 dk süreye bağlı). Etkinlik kimliği `idempotencyKey`'den türer: aynı anahtar çift etkinlik açmaz (409'da mevcut okunur). Bağlı değilken `CALENDAR_NOT_CONNECTED` (yeniden denenmez; randevu onaylı kalır, mentor elle ekler). Sınır: bağlanmadan önce onaylanmış randevulara sonradan otomatik bağlantı eklenmez. Erişim jetonu süreç belleğinde ~1 saat tutulur; bağlantı kesilince jeton Google'da da iptal edilir (diğer süreçlerdeki önbellek bu yüzden zarar vermez).
**Marka ve tanıtım sayfası yeniden (kart 167; kullanıcı kararları 9–10 Kas).** Kullanıcı arayüzü “aşırı AI slope” buldu: süs yıldızları kaldırıldı, mercan `#ff7a59`'dan `#ff6b7f`'a (pembeye) kaydırıldı, açık tema zemini krem (`#fffaf4`), koyu tema zemini lacivert (`#14224a`; PM önerisi, kullanıcı onayı bekliyor, değer yalnız `globals.css`'te) oldu. Logo 3. tur kararıyla `mezunportal.` (kepli “o”, yapışık n–p geçişi, yuvarlak mercan nokta); harfler Plus Jakarta Sans ExtraBold'dan dış hatlı çizildi, bu yüzden yazı tipi yüklenmese de logo bozulmaz. Seçenekler: (a) logoyu metin + CSS ile kurmak (taslak böyleydi; yazı tipi ve tarayıcı farkıyla kayar, favicon/e-postada yok); (b) dış hatlı SVG (seçilen). Tanıtım sayfası İÜ geneli yerine İÜ İktisat Fakültesi YBS'ye özel; ana başlık sabit, dokuz satır dönüyor (mesaj kataloğu dizi kabul etmediği için `rotating.line1…line9`). Sayılar yalnız 3 ve üstündeyse görünür. Telefon maketi, yörünge ve süs yıldızları kaldırıldı: yalnız tipografi, logo ve renk.
**CI az ve öz (kart 164; kullanıcı kararı 9 Kas: "10-15 dk koşmasın, önemli şeylere baksın").** Faz 0'dan kalan taslak PR #6 (Postgres hizmeti, tam test, build, 20 dk zaman aşımı, eski taban) kapatılıp yerine tek, hafif iş akışı açıldı. Seçenekler: (a) #6'yı güncellemek (tasarımı ağır; her kapıyı koşuyor); (b) yeni hafif iş akışı (seçilen): tür denetimi, kalite ve veritabanı gerektirmeyen birim testleri paralel, ≤ 5 dk. Veritabanı testleri, build ve e2e CI'da yok: PM'in yerel birleştirme kapısı zaten tam testi koşuyor ve CI'da Postgres kurmak süreyi uzatıyor. Repo herkese açık olduğundan Actions ücretsizdir.
**Marka ve tanıtım sayfası yeniden (kart 167; kullanıcı kararları 9–10 Kas).** Kullanıcı arayüzü “aşırı AI slope” buldu: süs yıldızları kaldırıldı, mercan `#ff7a59`'dan `#ff6b7f`'a (pembeye) kaydırıldı, açık tema zemini krem (`#fffaf4`), koyu tema zemini lacivert oldu (önce `#14224a` önerildi; kullanıcı 10 Kas'ta daha koyu `#0e1a38`'i seçti, değer yalnız `globals.css`'te; kep tahtası logo rengi `#14224a` kaldı, marka rengidir). Logo 3. tur kararıyla `mezunportal.` (kepli “o”, yapışık n–p geçişi, yuvarlak mercan nokta); harfler Plus Jakarta Sans ExtraBold'dan dış hatlı çizildi, bu yüzden yazı tipi yüklenmese de logo bozulmaz. Seçenekler: (a) logoyu metin + CSS ile kurmak (taslak böyleydi; yazı tipi ve tarayıcı farkıyla kayar, favicon/e-postada yok); (b) dış hatlı SVG (seçilen). Tanıtım sayfası İÜ geneli yerine İÜ İktisat Fakültesi YBS'ye özel; ana başlık sabit, dokuz satır dönüyor (mesaj kataloğu dizi kabul etmediği için `rotating.line1…line9`). Sayılar yalnız 3 ve üstündeyse görünür. Telefon maketi, yörünge ve süs yıldızları kaldırıldı: yalnız tipografi, logo ve renk.
**LinkedIn profil PDF yolu (kart 172).** LinkedIn API veya kazıma yerine kullanıcının indirdiği PDF mevcut CV onay hattına kaynak işaretiyle girer; onaydan önce profil yazılmaz ve LinkedIn dosyası karar anında silinir. PDF metin çıkarıcı ve maskeleme durumu aşağıdaki kart 215 kararına göre belirlenir. Deneme modunun örnek verileri gerçek profil olarak sunulmaz.

**Faz 2 ekran cilası (kart 190): ortak bileşen, tek köşe ölçeği, sekme kaymasız.** Faz 2 ekranları #80 tasarım yönünden önce ya da hızlı yazılmıştı: ham `<button>/<input>/<select>`, kit dışı `rounded-2xl/3xl`, tema belirteci olmayan sınıflar (`text-muted`, `bg-background` stilsiz kalıyordu) ve çıplak boş durum paragrafları vardı. Etkinlik, ders rehberi, aylık özet ve ilan ekranları `Field/Input/Button/Badge/Card/IconChip/EmptyState/PageHeader`'a taşındı; yalnız sunum katmanı değişti, iş kuralı ve sözleşme aynı. Üç tasarım kararı: (1) Listedeki onay/ret/iptal düğmeleri gerekçe yokken kapalı bırakılmaz (tıklanmadan neden kapalı olduğu anlaşılmıyordu); tıklanınca sebep alanın altında söylenir ve odak alana gider. (2) `Tabs`, seçili sekmeyi `scrollIntoView` yerine yalnız şerit içinde yatay kaydırır: sekme şeridi ilk ekranın altındaysa tarayıcı sayfayı aşağı kaydırıp başlığı kesiyordu (şirket sayfası, puan yönetimi). (3) `ResponsiveRows` mobil kartı ilk hücreyi başlık, son hücreyi eylem alanı yapıp ortadakileri iki sütuna indirir; etiketler (`dt`) korunur (puan yönetimi sayfası 390 px'te 4565 → 3905 px).
**Görüşme formu 404'ü rota grubu `loading.tsx` sınırının üstünde verilir (triyaj).** Rota grubuna ortak `loading.tsx` iskeleti eklenince (`(kimlik)/loading.tsx`) hesap layout'undaki `notFound()` iskeletin altında kaldı: yabancı görüşme formu veri vermiyordu ama durum kodu 404 yerine 200 dönüyordu (iskelet önce gider, durum sonradan değişmez). Taraf denetimi `(kimlik)/layout.tsx`'e (sınırın üstüne, `feedback-route.ts`) taşındı; hesap layout'undaki `notFound()` savunma katmanı olarak kaldı. Bu layout'tan fırlatılan 404 üst sınıra gittiği için Türkçe ekran kök `not-found.tsx`'ten gelir. Aynı nedenle `(randevu)` ve `(profil)` grup iskeleti altındaki "bulunamadı" sayfaları durum kodu 200 ile döner (içerik verisizdir, yabancı ve olmayan kayıt aynı ekranı verir); bu rotalar için 404 durum kodu şartı yoktur, değişirse aynı yöntemle grup layout'una taşınır.

**Kullanım hissi (kart 207): eylem geri bildirimi tek kalıp.** Onay/kayıt/gönder eylemlerinde başarı geri bildirimi ekrandan ekrana değişiyordu (satır içi kutu, tam ekran, yönlendirme, hiç): ana eylemlerin hiçbirinde toast yoktu ve satır içi kutular sayfayı aşağı itiyordu. Tek kalıp: anında bekleyen düğme, çift gönderim kilidi, başarıda toast (ortak `useAction` + `useToast`; toast kök düzende yaşadığı için yönlendirmeden sonra da görünür), hatada satır içi kararlı metin ve **korunan veri** (başarıda form temizlenir, başarıda yönetim gerekçesi sıfırlanır). Ölçüm (Chromium, 390, sunucu eylemi yavaşlatılıp kesilerek) tek bir senaryo dosyasıdır (`tests/e2e/feel.spec.ts`). `Button`'a `disabledReasonId` eklendi: aynı sebebi paylaşan düğme grubunda sebep her düğmenin altında tekrarlanmaz, `aria-describedby` tek yazılı ipucuna bağlanır. Yükleme iskeleti: `ilanlarim` ve etkinlik **listesi** için eklendi; etkinlik listesi `(liste)` rota alt grubunda tutulur çünkü bir `loading.tsx` altındaki `notFound()` durum kodunu 200'de bırakır ve `etkinlikler/[id]` gerçek 404 vermelidir. Kapsam dışı kalan: uygulama içi bildirim kutusu yok (`/hesap/bildirimler` yalnız tercih ekranı), bu yüzden "bildirimi okundu yap" yerine "bildirim tercihini kaydet" ölçüldü; "ilan başvurusu" harici bağlantıdır. Yılın Mezunu yönetiminde (R1/R2 provası): karar penceresi her açılışta ve kapanışta temiz başlar, pencere hatası ayrı durumdadır (önce sayfadaki tek `message` hem başarıyı hem hatayı pencerenin alanına basıyordu); karar gerekçesi ile yeniden hesaplama gerekçesi ayrı durum ve ayrı hata taşır (önce tek `reason` ikisini paylaşıyor, pencerede yazılan metin arkadaki alana sızıyordu). Tören tarihinin 30 gün kuralı istemcide sunucuyla aynı `awardFreezeAt` ile denetlenir ve sebep tarih alanının altında yazılır; sunucunun `VALIDATION_INVALID` yanıtı iki nedene sahiptir (tarih çok yakın ya da dönem zaten donmuş), bu yüzden alanın altındaki metin ikisini de söyler ve ayrı bir hata kodu açılmadı (sunucu sözleşmesi bu kartın kapsamı dışındadır). Seçimden sonra kazanan kart `Bu yılın mezunu` rozeti alır, diğer kartlarda kapalı düğmelerin sebebi sayfada tek bir yerde yazılır (`disabledReasonId`), başarı toast'ı kişinin adını söyler. Yönetimde ilan 'Yayımla/Reddet' penceresi tek cümlelik gövde taşır.
**Dialog Tab sırası ve Safari (kart 209 takip).** Modal ve alt sayfada Tab/Shift+Tab sırası görünür odaklanabilir denetimler üzerinden elle yürütülür: Safari'nin varsayılan klavye tercihi düğme ve bağlantıları atlayabildiği için yalnız ilk/son öğede müdahale etmek odağın pencereden kaçmasını engellemiyordu. İlk odak ve Esc sonrası dönüş korunur.
**Soru bankasında güvenli toplam ve sayfalama (kart 205).** Sayfalar ve toplam, k-anonimlik, bulanık soru birleştirme ve kimlik denetimi tamamlandıktan sonra yalnız gösterilebilir şirket gruplarından üretilir. Önce şirketleri saymak bastırılan gruplar hakkında bilgi verebilir; tüm adayları hesaplamanın O(n) maliyeti pilot için kabul edilir, gerekirse sonraki fazda güvenli özet veya önbellek değerlendirilir.
**Hukuki metinler resmî dilde kalır, canlıdan önce okunur (PM, Faz 2 kapanışı).** Arayüz "sen" dilindedir (`docs/design.md` "Ses"), ama KVKK belgeleri (`docs/legal-drafts.md`) hukuk geleneği gereği resmî "siz" dilinde kalır; taslak hâli pilot ve deneme için yeterlidir. Canlıya almadan önce üniversitenin KVKK birimi ya da bir hukukçu bu metinleri okur (`BACKLOG.md` PILOT-LEGAL). Reddedilen: belgeleri de "sen" diline çevirmek: hukuki okurun beklediği biçimi bozar ve kullanıcıya fazladan bir onay turu yükler.
**Tanıtım sayfası masaüstünde tam genişlik, dönen satırda durdur düğmesi yok (kullanıcı kararı, 12 Kas).** Kullanıcı masaüstü koyu temada sayfayı gördü: "yanlar boş duruyor", "durdur/devam et tuşunu kaldır, yazı sürekli değişsin", "10 yazı". Kullanıcı kararı (12 Kas): görünür durdur düğmesi kaldırıldı; hover/odakta bekleme + azaltılmış hareket tercihi korunur (satır ~3,6 sn'de döner; fare ya da klavye odağı kahraman metnindeyken bekler; `prefers-reduced-motion`'da hiç dönmez; ekran okuyucuya canlı bölge değil, ilk satır bir kez okunur). Bu, WCAG 2.2.2'nin (5 sn'den uzun hareketi durdurma mekanizması) kullanıcı tarafından bilinçli gevşetilmesidir; telafi hover/odak bekletmesi ve azaltılmış hareket tercihidir, `localStorage` tercihi ve düğme metinleri (`pause*`) silindi. Düzen: kahraman ≥ 64 rem'de iki sütun, sağda ürünün kendi bileşenleriyle çizilmiş ÖRNEK kart kompozisyonu (deneyim, mentor, ilan; "Örnek görünüm" etiketli, dekoratif ve `inert`, gradyan/parlama yok), kapsayıcı 80 rem (≥100 rem'de 90 rem), bölüm başlıkları ve kapanış iki sütun. Sayı bandı 5 sayıyı (deneyim, mentor, görüşme, ilan, şirket) simgeli kartlarda gösterir; hepsi yine k ≥ 3 kuralına tabidir (`publicLandingCount`), yeni sayılar herkese açık toplamlardır (kişi verisi yok). Dönen satırlar 10'a çıktı (6. ve 7. satır PM/kullanıcı onaylı metinle değişti).


**Tanıtım takibi: çok geniş ekranda sayfa ölçeği, dokunmatikte bekletme yok (kullanıcı kararının devamı, 12 Kas).** Kullanıcı "sayfanın tamamına yay" demişti; 80/90 rem kapsayıcı 2560 px'te içeriği genişliğin yalnız %56'sına (3440'ta %42'sine) bırakıyordu. Yalnız kapsayıcıyı büyütmek satırları uzatır, yazıyı ve kartları küçük bırakır; bu yüzden `.landing` ≥ 125 rem'den başlayarak kademeli `zoom` alır (1,15 → 2; eşikler 125/140/160/190/215 rem) ve sayfa bütün olarak (yazı, kit kartları, boşluklar) orantılı büyür: içerik 2560'ta ≈ %83'ü kaplar. `zoom` rem tabanlı kit bileşenlerini büyütebilen tek yoldur (`rem`/`vw` karışımı bileşen başına tek tek ayar ister); desteklemeyen tarayıcıda (Firefox < 126) `@supports` ile devreye girmez, sayfa 1440 px ortalı kalır ve bozulmaz. 1440/1920 değişmez. Ayrıca dönen satırın fare bekletmesi yalnız `(hover: hover) and (pointer: fine)` cihazlarda bağlanır: telefonda bir dokunuş `mouseenter` bırakır ve satır bir daha dönmezdi ("o yazı paso değişsin"). Klavye odağı ve azaltılmış hareket her cihazda bekletir/durdurur.

**Uygulama içi bildirim kutusu (P2-05 sözü, kart 217).** Ölçüm: `NotificationIntent` yalnız e-posta çıkış kutusudur ve gönderince satırı siler; uygulama içi tek kayıt `JobMatch` idi (düz liste, ham tarih başlıklı, okundu yok, yalnız öğrenci). Karar: ayrı kalıcı `InAppNotification` tablosu (ekleyici migration), `stageNotification`'ın AYNI işleminde yazılır; ilan eşleşmesi ise alıcı başına ilana özel kayıttır (`stageJobMatches`), bu yüzden aynı günün üç eşleşmesi "Profiline uyan 3 yeni ilan var." olarak toplanır. Kutu e-posta tercihlerinden bağımsızdır (tercih ekranı zaten "hangi e-postaları almak istediğini seç" der; ekrana not düşüldü). Kayıt `kind` + `refId` taşır; metin ve bağlantı sunucu kataloğundan kurulur (bildirimde kişisel veri yok, bağlantı veritabanından ya da istemciden serbest metin gelmez). Gruplama kuralı: aynı tür + aynı İstanbul günü; sayfalama güne göredir (bir grup iki sayfaya bölünmez, tek gün sayfayı aşarsa o gün bütün okunur). Bir günü keyfi kayıt sayısında kesmek kalan kayıtları imlecin gerisinde bırakacağından gün bütünüyle okunur; büyük grubun okundu işlemi istek başına kimlik sınırına uygun parçalara ayrılır. Rozet sayısı da ürün verisidir: ilk çizim ve GET merkezî zorunlu onay kapısından geçer, oturum/menü uygunluğu bu veri denetiminin yerine geçmez. Kutuya girmeyenler: aylık özet (içeriği gönderim anında hesaplanır), pilot davet (alıcı kişisel adres) ve ilan özeti niyeti (eşleşmenin kendisi girer). Rozet kök düzende sunucudan gelir; kök düzen gezinmede yeniden çizilmediği için gezinme, pencere odağı ve okundu işaretleme sonrası küçük bir GET (`/api/bildirimler/okunmamis`) ile tazelenir; sunucu eylemi değildir, böylece eylem sayan ölçümlere ve çift gönderim kilitlerine karışmaz. Eski ilan eşleşmeleri (`JobMatch`) `20261112040000_in_app_notification_backfill` migration'ıyla kutuya OKUNMUŞ olarak taşındı (PM onaylı veri taşıması): yalnız ekler (hiçbir satırı silmez/değiştirmez), idempotenttir (`key` benzersiz, `ON CONFLICT DO NOTHING`), kişisel veri taşımaz (tür + ilan kimliği + zaman), yalnız hâlâ yayındaki ilanları ve silinmemiş kullanıcıları alır; okunmuş işaretlenir ki yükleme anında kimsenin rozeti dolmasın. Geri almada `readAt = createdAt` kaynağı kanıtlamaz: uygulamanın önceden okunan satırları da bu eşitliği taşıyabilir. Deploy öncesi yedek alınır; yalnız bu çalıştırmada eklendiği kimlik bazında kanıtlanan satırlar geri alınır. Böyle bir kayıt yoksa toplu silme yapılmaz, ileri düzeltme veya yedekten kurtarma seçilir. Bu sayede `/hesap/bildirimler`'deki ham tarihli düz eşleşme geçmişi kaldırıldı: uygulama içi bildirimler TEK yerdedir (`/bildirimler`), tercih ekranı yalnız e-posta tercihleri ve kutuya bağlantıdır. Okunmamış sayısı 100'de sınırlıdır ("99+"); kutu kayıtları silinmez ("sınırsız"), hesap silmede temizlenir.

**LinkedIn PDF metin çıkarıcı (kart 215).** `unpdf` 2.1.0 (MIT) sunucuda yerel PDF.js metin çıkarımı için seçildi; `pdfjs-dist` doğrudan entegrasyonuna göre daha küçük bir arayüz sağlar. Güvenilmeyen PDF sınırlı, sonlandırılabilir iş parçacığında işlenir. Mevcut CV hattında güvenilir kişisel veri maskeleyici bulunmadığından gerçek LLM için LinkedIn seçimi kapalı kalır; maskeleme ve metin sağlayıcısı bağlanmadan ham PDF veya metin dışarı gönderilmez. İşleme sırasında süreç RSS'i 384 MB'tan fazla büyürse (sıkıştırma bombası: V8 yığın sınırı ArrayBuffer'ı saymaz, 300 MB'a açılan 300 KB'lık akış +557 MB tepe bellek yaptı) iş parçacığı süre dolmadan sonlandırılır. Normal CV akışı metin çıkarmaz; sağlayıcıya yalnız PDF gider (rıza kapısı, K-04).
**LinkedIn PDF metin çıkarıcı (kart 215).** `unpdf` 2.1.0 (MIT) sunucuda yerel PDF.js metin çıkarımı için seçildi; `pdfjs-dist` doğrudan entegrasyonuna göre daha küçük bir arayüz sağlar. Güvenilmeyen PDF sınırlı, sonlandırılabilir iş parçacığında işlenir. Mevcut CV hattında güvenilir kişisel veri maskeleyici bulunmadığından gerçek LLM için LinkedIn seçimi kapalı kalır; maskeleme ve metin sağlayıcısı bağlanmadan ham PDF veya metin dışarı gönderilmez. İşleme sırasında süreç RSS'i 384 MB'tan fazla büyürse (sıkıştırma bombası: V8 yığın sınırı ArrayBuffer'ı saymaz, 300 MB'a açılan 300 KB'lık akış +557 MB tepe bellek yaptı) iş parçacığı süre dolmadan sonlandırılır. Kart 231 güncellemesiyle normal CV de LinkedIn gibi yerelde metin çıkarma → kişisel veri maskeleme → metin sağlayıcısı yolunu kullanır; gerçek sağlayıcıya ham PDF gitmez. Kart 232 PM kararı: ad maskelemesi kurum adıyla çakışsa da gizlilik önceliklidir; kurum eki istisnası maskeyi atlatacağından eklenmez. Eşadlı okulun kısmen maskelenmesi bilinen sınırdır; kullanıcı öneriyi onay ekranında düzeltebilir.
**E2E: WebKit kapsamı ve tek işçi zorunluluğu (kart 225, 12 Kas).** İsteğe bağlı WebKit projesi `E2E_WEBKIT=1` ile proje adı verilmeden koşulunca 110 testin hepsini WebKit'te de koşuyordu (varsayılan Chromium listesi 96); artık yalnız `webkit-*.spec.ts` dosyalarını (14 test) koşar, tek tek spec'leri WebKit'te denemek için kasıtlı `E2E_WEBKIT=all` kapısı kaldı. Testler ortak seed hesaplarını paylaştığı için `--workers=2` yarış kırmızısı üretiyordu; yarış yalnız birkaç spec arasında değil aynı hesapları kullanan bütün dosyalar arasındadır (kartta adı geçen dört spec kendi aralarında iki koşuda da geçti), bu yüzden hesabı birkaç spec için ayırmak çözüm olmaz. Kök çözüm (spec başına ayrı hesap/persona) büyük bir iştir; o gelene kadar `global-setup.ts` paralel koşuyu sessiz kırmızı yerine açık hatayla reddeder.

**E2E test sunucusunda Node kullanımdan kaldırma uyarıları kapalı (kart 118 takibi, 12 Kas).** pg'nin "Calling client.query() when the client is already executing a query" uyarısı Prisma 7 sorgu yorumlayıcısından geliyor (BACKLOG TD-027); Next dev sunucusu onu tarayıcı konsoluna iletir ve hata katmanı sol altta "1 Issue" rozeti çizer. 390 px'te rozet alt gezinmenin "Deneyim" bağlantısını örter ve uyarı süreç başına bir kez çıktığından taze sunucuda ilk koşan spec'in tıklaması 120 sn asılırdı. `devIndicators: false` zaten açıktı ama hata rozetini gizlemez, hata katmanı bilinçli açık kalır. Bu yüzden yalnız `playwright.config.ts` test sunucusu `NODE_OPTIONS=--no-deprecation` ile açılır (normal dev, birim ve DB koşuları uyarıyı görmeye devam eder); `a11y-tour`'daki `nextjs-portal` atlaması kaldırıldı.


**Yönetimde şikâyet toplamı ve boş durumlar (kart 246).** Ana panelin sayısı yalnız deneyim raporlarını saydığı için dolu ilan kuyruğu sıfır görünüyordu. Toplam iki kuyruğun açık satırlarını kapsar; ilan filtresi listeyle aynı hedef bölüm kapsamını paylaşır (yazıldığı bölümle karıştırılmaz). Bölüm sayısı kadar OR/JOIN üretilmez; tek ilişkisel hedef filtresi kullanılır ve 130 bölümde aynı rapor tek sayılır. Boş durum bölümünü açıkça adlandırır; iki kuyruk boşsa tek mesaj gösterilir. Son ilan kararında boşluğa geçiş, mevcut odak dönüşünü korur.
**Faz 1 çekirdek ekranların görsel cilası (kart 237, 190'ın Faz 1 karşılığı).** Ölçüm (25 ekran × 360/390/1440 × açık/koyu, `pnpm evidence` yöntemi): taşma, tek h1/main, 44 px hedef, gradyan, çıplak alan ve 12 px altı yazı yok; tek ölçülebilir bulgu mentor dizininde mobil başlık atlamasıydı (h1 → kart h3; filtre paneli kapalıyken h2 yok, kartların üstüne gizli h2 eklendi). Asıl kayıp sunum hiyerarşisindeydi. Kararlar: (1) **Mentor yüzü** her yerde aynıdır: baş harf avatarı (`Avatar`, dekoratif), ad, güncel konum ("unvan · şirket"), müsaitlik rozeti; üye profilinde giriş noktaları başlığın ALTINDA durur (önce sayfa sonundaydı, uzun profilde ekranın dışında kalıyordu) ve tek birincil eylem **"Randevu iste"**dir; randevu kapalıysa açık olan iletişim isteği birincil olur (sayfada her zaman bir birincil eylem vardır). "Referans verdi: 0" gibi sıfır sayacı gösterilmez. (2) **Deneyim okuma:** mülakat soruları öğrencinin aradığı kısım olduğundan zeminli kutuda numaralı satırlarla, süreç adımları numaralı, tavsiye sol çizgiyle ayrılır; başlıkla aynı olan "Kurum" satırı detayda gizlenir (moderasyonda gösterilmeye devam eder); satır uzunluğu `max-w-2xl` ile 75 karakter altında kalır. "Geri" bağlantısı okuyucuyu "Deneyimlerim"e götürüyordu: okuyucu listeye ("Deneyimlere dön"), yazar kendi listesine döner; sahiplik belirsizse güvenli varsayılan liste. (3) **Ana sayfa:** karşılama her zaman ilk şeydir ("Profilini tamamla" kutusu karşılamanın altına indi, sayfa düzeyinde değil panonun `notice` yuvasında); karşılamanın altında rolüne göre tek sıcak cümle, bekleyen iş varsa sayıyı söyler; boş "Bekleyen işlerin" bölümü tek satırlık sakin onay kartı oldu (eylemler zaten hemen altındaki kısayollardır). İş kuralı, sözleşme ve yetki değişmedi; yalnız sunum katmanı.

**Faz 1 cilası ikinci tur (kart 251, 237'nin "bilinçli bırakılan" listesi).** Beş ekran yalnız sunum olarak yenilendi; iş kuralı, yetki ve veri değişmedi. (1) Kendi profilim ~3000 px'ti: bilgi bölümleri katlanır (varsayılan kapalı; başlık düğmesi `aria-expanded`, özet "2 kayıt" `aria-describedby` ile okunur ve başlığın erişilebilir adını bozmaz), "Ekle/Düzenle" bölümü açmadan çalışır ve kayıttan sonra bölüm açılır; ilk ekranda tamamlanma + tek "sıradaki adım" (`pickNextStep`: doğrulama → temel bilgi → eğitim → beceri → tercihler; CV zaten ayrı kart) ve CV kartı kalır. Katkı puanı özeti ilk ekranda kalır (P1-16 kararı, `points.spec` ilk ekranda arar); "Hedefime ne kadar yakınım?" paneli bölümlerin altına indi, kapalı değil: e2e'ler onu görünür bekliyor. (2) Hesap menüsünde 13 kartlık tek "Görüşmeler ve içerikler" grubu amaca göre bölündü (Profil · Görüşmeler ve mentorluk · Staj ve iş · Yazdıklarım ve sorular · Bildirimler · Gizlilik ve veriler · Yönetim · Oturum); bağlantı satırı tek bileşende (`AccountLink`), masaüstünde iki sütun. (3) Randevu ayrıntısında zaman çizelgesi (talep → mentor onayı → görüşme → geri bildirim) yalnız `status`tan türetilir (`buildTimeline`); yolun bittiği durumda çizelge orada durur ve kalan adımlar gösterilmez. İptal onaydan önce mi sonra mı olduğu görünümden bilinmediği için "onaylandı" iddia etmez. Meet bağlantısı bilgi kartından önce gelir; ekranda tek birincil eylem vardır. (4) Deneyim formu tek uzun sayfaydı: bölümler numaralı kart + ilerleme şeridi (ilk eksik bölüm "şu anki adım"; doğrulama ve gönderme akışı DEĞİŞMEDİ, bölümler istenen sırayla doldurulur). Kaydedilmemiş değişiklik son kayıtla karşılaştırılır (yazıp silen "değişmemiş" sayılır); sekme kapatma `beforeunload` ile, uygulama içi bağlantı tıklaması yakalama aşamasında durdurulup "taslağı kaydet ve çık / kaydetmeden çık / burada kal" ile sorulur. Bilinen sınır: bu sürüm tarayıcı geçmişindeki Geri/İleri geçişini korumaz; bu yolda kaydedilmemiş metin kaybolabilir. Otomatik kayıt yoktur; form açıklaması ayrılmadan önce taslağı kaydetmeyi ister. Bu sunum paketinde bağlantı ve sekme kapatma koruması ile sınırlıdır. (5) Randevu boş durumu: sebep sıcak dille, tek eylem "Mentor bul" (`/mentorlar`). Yeni bağımlılık, env, migration yok.
**Başarısız bildirim niyeti saklama süresi (TD-018, kart 259, PM kararı).** Yükü zaten temizlenmiş `FAILED` niyetler operatör incelemesi için `failedAt` üzerinden 90 gün tutulur; bu süreyi aşanlar mevcut günlük görev düzeneğinde tek silme sorgusuyla temizlenir. Üç ay inceleme için yeterlidir; sınırsız saklama veri en azlığına uymaz. Tam 90 günlük sınır sonraki günlük koşuya kalır; `PENDING` ve başka tablolar korunur, yeni günlük veya kişisel veri kaydı üretilmez. Şema/migration değişmez.
**Panoya kopyalama tek kalıp (kart 255, 247 provası bulgusu).** `navigator.clipboard` yalnız güvenli bağlamda (https, localhost) vardır; telefonu `http://` ağ adresiyle açınca tanımsızdı ve ödül sayfasındaki "Doğrulama bağlantısını kopyala" yakalanan hatada form cümlesini ("Alanları kontrol edip yeniden dene.") gösteriyordu. Sitede panoya yazan tek yer o sayfadaki iki düğmeydi; ortak `copyToClipboard` (`src/lib/copy-to-clipboard.ts`: önce pano, olmazsa seçim + `execCommand('copy')`, hiçbirinde fırlatmaz) ve `CopyButton` (`src/components/ui`) eklendi. Başarıda mevcut toast; ikisi de olmazsa bağlama uygun tek cümle ("Kopyalanamadı. Bağlantıyı aşağıdan seçip kopyalayabilirsin.") ve metin seçili, salt okunur bir alanda belirir, odak oraya gider. Yeni kopyala düğmesi `CopyButton` kullanır; metinler `messages/tr.json`'dan prop olarak gelir (bileşende sabit metin yok).
**PM ekran turu düzeltmeleri, öğrenci tarafı (kart 264).** Yalnız sunum; iş kuralı, yetki ve veri değişmedi. (1) Dosya seçici: tarayıcının dile göre değişen "Choose File · No file chosen" görünümü yerine ortak `FilePicker` (`src/components/ui`): düğme ("PDF seç", seçilince "Dosyayı değiştir") + dosya adı ("Henüz dosya seçilmedi"). Gerçek `<input type="file">` korunur ve alanı örter (görünmez); tıklama, sürükle-bırak, klavye ve `FormData` okuması aynen çalışır. Etiket `Field` ile, dosya adı ve hata `aria-describedby` ile bağlanır. CV, belge ve davet yüklemesinde kullanılır. (2) Girişli ana sayfa ≥1024 px'te iki sütun; kod sırası telefon sırasıyla aynı kaldı (odak sırası görsel sırayı izler, 390 düzeni değişmedi). Sol: karşılama, onay kutusu, hikâye, bekleyen işler; sağ: kısayollar, yönetim, "Sana uyan ilanlar". Kısayollar mentor hesabında da sağ sütunu doldursun diye sağda; yeni sorgu eklenmedi (sayfada yaklaşan randevu/etkinlik verisi yok). (3) Arama blokları: `/ilanlar`'daki tek satırlık kalıp ortak `SearchBar` oldu (`[ara] [Ara] [Filtreler]`; etiket görünmez, ipucu yer tutucuda ve ekran okuyucuya açıklama olarak). `/deneyimler` ve `/sirketler` bunu kullanır; `FilterShell` telefondaki "Filtreler" düğmesini arama satırına geçirir (`search` prop'u; mentor dizini eski yerleşimde kalır). Terim birliği (`docs/design.md` "Filtre"): kullanıcıya görünen bütün "Süzgeç" metinleri "Filtre" yapıldı (yalnız iki `filters` anahtarı değil; "Filtreleri uygula/temizle" da, yoksa düğme "Filtreler", işlem "Süzgeçleri uygula" derdi). (6) Tanıtım sayıları < 768 px'te 3 sütunlu kompakt satır (6 sütunlu ızgara 1–5 kartı dengeler); ≥768 px değişmedi. (7) CV kaynak seçimi ortak `RadioGroup`'a geçti. (8) Deneme verisi: tamamlanmış örnek randevu İstanbul saatiyle 11:00 (UTC 08:00); `upsert` `update: {}` olduğu için var olan veritabanlarında eski satır kalır, yeni kurulumda görünür. Yeni bağımlılık, env ve migration yok.

**Mezun/akademisyen günü düzeltmeleri (kart 265, PM kararı).** Randevu listesi kimlik biçiminden tarih çıkarmak yerine önce REQUESTED talepleri (başlangıç artan), sonra diğer gelecekteki kayıtları (başlangıç artan, tam şimdi dahil), sonra geçmişi (başlangıç azalan) sıralar; aynı saatte kimlik yalnız kararlı eşitlik bağıdır. Aynı sıralama imleçten sonraki sorguya da uygulanır; imleç yalnız kendi katılımcı/durum kapsamında çözülür. Üç sınırlı sorguyla grup geçişi yapılır, bütün geçmiş belleğe alınmaz. CV incelemeleri kısayolu mentor olabilen üyede kalır: ayarsız üyeye mentor ayarlarına yönlendiren açıklama gösterir; yeni yetki veya CV erişimi açılmaz. Diğer değişiklikler karar sonrası odak ve bağlama uygun metinlerdir.
**İşçi kapanışı süre sınırlı ve açıkça çıkar (kart 262, 256 incelemesi bulgusu).** Ölçüm: `email-worker.ts` SIGTERM'de bütün `stop()` adımlarını ~75 ms'de bitiriyor (DB varken de silinmişken de), yine de tam e2e koşusunun başlattığı işçi sonra çıkmıyordu (4 tam koşunun 4'ünde `ppid 1` yetim; `SIGTERM` bir kez geldiği için ikincisi `stopping` korumasıyla yok sayılıyordu). Karar: kapanış başarıyla biterse `process.exit(0)`; hata ya da 20 sn (15 sn pg-boss zarif kapanışı + pay) aşımında sabit satır ve çıkış 1; ilk sinyalden 1 sn sonra gelen ikinci sinyal hemen çıkar (1 sn içindeki kopya, Ctrl+C'nin işçiye hem doğrudan hem üst süreçten gelmesidir, yok sayılır). Çalışma ortamları artık birlikte kapatılır (`allSettled`): biri hata verirse ötekiler açık kalıp işçiyi yaşatmaz. Testler işçiyi SIGTERM → bekle → SIGKILL ile kapatır (`tests/e2e/email-worker.ts`). Not: 20 sn içinde bitmeyen bir iş, işçi çıkınca tamamlanmamış kalır; pg-boss onu süre aşımından sonra kuyruğun yeniden deneme ayarına göre yeniden dener (iş en az bir kez işlenir).

**Test kapısında işçi/bellek hatası (TD-023, PM kararı).** Yerel 16 GB makinede eşzamanlı rol ve PM yükünde `Worker exited unexpectedly` veya `ERR_WORKER_OUT_OF_MEMORY` altyapı kaynaklı olabilir; yalnız tanınan düşmüş dosyalar bir kez yeniden koşulur ve kapı çıktısı bunu açıkça yazar. İkinci koşu da düşerse kapı kırmızıdır; tekrarlanan bellek sızıntısı böylece gizlenmez. Gerçek assertion hataları yeniden denenmez; hata metninde işçi/bellek hata kodu geçse bile `AssertionError` ve DOM beklentisinin `Error: expect(...)` çıktıları gerçek hata sayılır.

**Stres araması ve soru bankası (TD-022).** İlanın etkin/doğrulanmış yazar üyeliği eşdeğer bir indeksli EXISTS ile kontrol edilir; hedef ve üniversite görünürlüğü aynıdır. Soru bankasının üniversite/şirket kimlik bağlamı için ekleyici kapsayıcı indeks kullanılır; k≥3, kimlik denetimi ve güvenli gruplardan sonra sayfalama değişmez. Şirket seçilince indeks kullanılır; tüm şirketlerde planlayıcı başka indeks seçebilir. Hesap O(n) kalır, kalıcı önbellek yoktur.
**Adım göstergesi kabın genişliğine göre (kart 275, 270 ölçümü).** `Stepper`'ın özet ("Adım 2 / 5: Ad" + çubuk) ile yatay liste arasındaki geçişi ekran genişliğine (`md`) bağlıydı. Yatay listenin en dar hâli adım sayısı ve etiket uzunluğuyla büyür (deneyim formunda 5 adımda 629 px); form sütunu ise 472 px'tir. Bu yüzden liste 768 px ve üstündeki HER ekranda sütundan 157 px taşıyordu; sayfa yatay kayması yalnız kabın sol kenarı + 629 px görüntü alanını aştığı genişliklerde (768, 769, 1024, 1025 px) göründü. Geçiş artık `@container` + `@3xl` (kap ≥ 48 rem) ile kabın genişliğine bağlı: dar form sütununda her ekranda özet, geniş kapta liste. Yalnız sunum; sütun genişliği değişmedi. Koruma: birim (kap sorgusu sınıfları) ve e2e (360–1280 arası 11 genişlikte sayfa ve liste taşması 0).
**Tablet düzeltmeleri, EK 1 ve EK 2 (kart 275).** (EK 1, #134 incelemesi) Belge formunda dosya seçmeden göndermek "Seçtiğin dosya boş." diyordu: tarayıcı seçilmeyen dosya girdisi için adsız, 0 baytlık bir `File` gönderir. `graduationDocumentFormInput` bunu "seçilmedi" sayar (`DOCUMENT_REQUIRED`); adı olan boş dosya `DOCUMENT_EMPTY` kalır, yeni hata kodu yok. CV formunda dosya seçilince "Bir PDF dosyası seç." hatası kalkar; toplu davette 30 KB üstü dosya reddi `FilePicker` alanına bağlı hata olur ("Dosya çok büyük."). `/ilanlar` da ortak `SearchBar`'ı kullanır. `SearchBar` satırı sarabilir ve `wideTrailing` verilince girdi en az 10 rem kalır (360 px'te "Filtreler (1)" ile girdi 105 px'e düşüyordu). Alt sınır HER ZAMAN uygulanmaz: sabit 160 px, filtre yokken de düğmeyi alt satıra itip `/ilanlar`'ın mobil ilk ekranındaki iki kartı 17 px aşağı kaydırıyordu (e2e yakaladı); `/ilanlar`'ın "Filtreler" düğmesi sayı göstermediği için uzamaz ve bayrağı vermez. (EK 2) `/randevular` 1920'de 512 px'lik telefon sütununda kalıyordu; ≥1280 px'te sütun `max-w-5xl` olur ve kartlar iki sütun akar, 390/768 px aynı kalır. Tek randevusu olan hesapta sağ yarı boş kalır (yeni sorgu eklenmedi). Yeni bağımlılık, env, migration yok.
**Koyu tema taraması (kart 280).** Koyu tema hiç bütünüyle taranmamıştı. 390 px koyu kipte 4 kişi + girişsiz kullanıcı için 88 ekran (90 rotanın ikisinde ayrıntı bağlantısı yok) ve 7 etkileşimli durum (filtre alt sayfaları, açık bölüm, bildirim, kapatma onayı) HESAPLANMIŞ stilden WCAG AA ölçüldü: 3000 metin, 5 yer tutucu, 190 kontrol, 991 simge. Metin ve yer tutucuda hata yok ve eşiğe 0,7 puandan yakın çift yok: token çiftleri (`contrast.test.ts`) ekranda doğru birleşiyor. Tek gerçek bulgu bir BİLEŞEN hatasıydı: toplu davetteki ham `<textarea>` kontrol sınırında dekoratif `border` token'ını kullanıyordu (koyu 1,77:1, açık 1,27:1; kontrol sınırı 3:1 ister). Kit `Field` + `Textarea` (`border-border-control`: koyu 5,49:1, açık 4,1:1) ve `Button`'a geçti. Token değeri değişmedi; yeni renk adı yok. Kalıcı koruma: `tests/e2e/dark-theme.spec.ts` seçili 15 ekranda aynı ölçümü koyu 390 px'te koşar (devre dışı, görünmez ve tarayıcı çizimli onay kutusu/radyo hariç). Bilinen sınır: tarayıcının kendi çizdiği onay kutuları ve radyo düğmeleri (`accent-primary`) hesaplanmış stilden ölçülemez; piksel ölçümü `/ilanlar` filtresindeki onay kutusunda sınır 4,65:1 verdi (geçer) ama kit `Checkbox`'tan farklı gri çizilir; kit bileşenine taşınması ayrı iştir. Ölçüm yalnız Chromium'dadır.
**E-posta şablonları turu (kart 291).** 37 e-posta (36 şablon, randevu onayı iki biçimde) sentetik veriyle gerçek üreticilerden (`decorateEmail`, `buildAppointmentEmail`, auth portu, özet) üretildi ve 360/390 genişlikte açık/koyu ölçüldü. Yatay taşma, 44 px altı düğme, harici/göreli bağlantı ve koyu kipte düşük karşıtlık yoktu. Bulunanlar ve çözümler (yalnız sunum katmanı; kuyruk, outbox ve gönderim mantığı değişmedi): (1) altbilgi 13 px'ti → 14 px, tercih bağlantısı dikey dolguyla ≥ 44 px dokunma alanı. (2) Ön izleme metni yoktu; gelen kutusu önizlemesi "mezunportal. Merhaba, …" ile başlıyordu → gizli `email-preheader` öğesi ilk cümleyi taşır (`preheaderOf`: selamlama ve bağlantı atılır; gerekçe/not satırları ilk cümleden sonra geldiği için kilit ekranına düşmez). (3) `<title>`, `<meta charset>` ve `supported-color-schemes` eksikti → eklendi. (4) Mezun "hâlâ çalışıyor musun" e-postasında "Hayır" cevabı düğme değil, yanında sıkışmış ham jetonlu uzun adresti → iki ayrı düğme (Evet birincil, Hayır ikincil çerçeveli); düz metin kopya da üç satıra ayrıldı. (4b) Ana eylem düğmesi cümle ortasında kalıyordu ("…giriş sayfasını aç: [Daveti kabul et]") → satır başında değilse kendi satırına iner. (5) Diğer ikincil iç bağlantılar (aylık özet aboneliği) artık uzun jeton yerine kısa adres gösterir; `href` aynıdır. (6) Dört konu satırı anlamsızdı ("Deneyimin hakkında", "SSS talebin hakkında", "İlanın hakkında", "Referansın hakkında") → "…incelendi" / "Referansında güncelleme var"; ret konularında "reddedildi" bilerek yazılmadı (kilit ekranında gerekçesiz görünmesin), "Sorun SSS'de yayınlandı" ("Sorun" = problem) "Sorduğun soru SSS'de yayınlandı" oldu. KRİTİK KISIT: aylık özetin gönderim anı denetimi (`notification-preferences.ts`) kayıtlı DÜZ METNİ yeniden üretilen metinle karşılaştırır; bu yüzden düz metin altbilgisi ve özet metni bu kartta DEĞİŞTİRİLMEDİ (değişirse kuyruktaki özetler sessizce düşer). (Bu kısıt kart 300 / TD-028 ile kalktı: denetim artık veriye bakar, bir sonraki kayda bkz.) HTML bu karşılaştırmaya girmez. Bilinen sınırlar (ölçülmedi): Gmail koyu kipi `prefers-color-scheme` yerine kendi dönüşümünü uygular; Outlook masaüstü `a` dolgusunu yok sayar (düğme metne yapışık görünebilir); `List-Unsubscribe` başlığı aktarım katmanında yok (gönderim mantığı bu kartın dışında); markadaki Mercan noktası açık zeminde 2,64:1 (logo metni olduğu için WCAG karşıtlık istisnası). Yeni bağımlılık, env, migration yok.
**Yerli onay kutusu ve radyolar kit bileşenlerine (kart 286, 280 taramasının kapsam dışı listesi).** Tarayıcının kendi çizdiği `<input type="checkbox|radio">` (13–20 px, gri) kit `Checkbox`/`RadioGroup`'tan farklıydı; koyu temada seçilmemiş yerli radyo düz koyu gri dolu daire gibi çizildiği için seçili/seçilmemiş ayrımı zorlaşıyordu. Kit'e küçük bir ek: `RadioGroup` seçeneğinin radyo girdisi `Radio` (`src/components/ui/radio.tsx`) olarak çıkarıldı (24 px, `border-control` halka, seçiliyken `primary` dolu; `RadioGroup` artık onu kullanır, davranış aynı). Kendi etiket kartını kuran ekranlar (geri bildirim büyük seçenekleri, SSS cevap kartları) kartlarını ve ≥ 44–48 px tıklama alanını koruyup yalnız girdiyi `Radio` yapar; iş arayan rıza onayı ve iletişim alanı seçimi kit `Checkbox`'tır. Form adı, değer, varsayılan seçili ve devre dışı durumlar aynıdır (sunucu eylemleri aynı alanı alır). Kit dışında `type="checkbox|radio"` yazmak ESLint kuralıyla (`eslint.config.mjs`, `no-restricted-syntax`) yasaktır: ilk sürümde kaynağı okuyan bir test vardı, ama `docs/engineering.md` "ekran kaynağı deseni testle değil lint kuralıyla korunur" der; R1 incelemesinde lint kuralına çevrildi, test silindi. İstisnalar: kitin kendisi, bileşen galerisi ve test dosyaları. Koyu tema korumasına (`dark-theme.spec.ts`) R1 notları eklendi: her rota için yanıt durumu 200 ve son adres doğrulaması (var olmayan sayfada da yeşil çıkıyordu) ve renk ayrıştırması tarayıcının kendi renk motoruyla (`oklab`/`color-mix`/saydam renkler artık şeffaf sayılmaz; çözülemeyen renk hata verir). Davet gönderiminin çift gönderim birim testi, formun yalnız durum (`pending`) tabanlı kilide güvendiğini ve iki hızlı tıklamada iki istek gittiğini ortaya çıkardı; diğer formlar gibi eşzamanlı `ref` kilidi eklendi.


**pg eşzamanlı sorgu uyarısı incelemesi (TD-027, kart 294).** Prisma 7.10.1, adapter-pg 7.10.1 ve pg 8.23.1 ile `loadActor` (`src/server/permissions/actor.ts`) işlem içinde üyelik, yetki ve mentor ilişkilerini yüklerken yorumlayıcı tek pg istemcisine eşzamanlı sorgu yollar; ayrı `Promise.all` kullanılan işlem yolları da vardır. Yerel yeniden üretim: `NODE_OPTIONS="--conditions=react-server --trace-deprecation" pnpm exec tsx scripts/td027-probe.ts`; uyarı sürerse çıkış 1, düzelince 0 olur (yalnız seed veritabanından okur). 13 Kasım 2026 itibarıyla kurulu 7.x Prisma/adapter ve 8.x pg sürümlerinden daha yeni kararlı sürüm bulunmadı. Yukarı akışta benzer hata açık: https://github.com/prisma/orm/issues/29407. Deneyde ilişkileri ayrı ve sıralı okumak 60 ölçümde aynı sonuçları verdi (yerelde medyan 5,48 → 5,42 ms; ağ gecikmesindeki maliyet ayrıca ölçülmedi), fakat yetki okuması dışında işlem içi eşzamanlı yollar kaldığından bu tek değişiklik borcu kapatmaz. PM kararı: Bu turda yetki çekirdeği değiştirilmez; düzeltme pg@9 geçişinde veya başka bir yetki işi sırasında güvenlik incelemesiyle ele alınır. Uyarı gizlenerek çözülmüş sayılmaz; e2e'deki mevcut geçici `--no-deprecation` istisnası ve TD-027, kapsamlı düzeltmeye kadar kalır.
**WebKit turu P3'leri (kart 284, R1 kart 282 bulguları).** Dört küçük düzeltme; renklere ve koyu tema token'larına dokunulmadı. (1) `CopyButton` başarısızlık alanı ve `FilePicker` sabit alt gezinmenin ve yapışkan çubuğun arkasında kalıyordu: `focus()` WebKit'te hiç kaydırmaz, Chromium'da alanı kenarda bırakır; ama `scrollIntoView({ block: 'nearest' })` `scroll-margin`'i iki motorda da uygular. Çözüm: `scroll-above-bars` payı (globals.css; alt gezinme 4,5 rem + çubuk) ve odaktan sonra açık `scrollIntoView`. `FilePicker` dokunma/fare odağında kaydırmaz (basma ile bırakma arasında sayfa kayarsa tıklama başka öğeye düşebilir; gerçek cihazda denenmedi), klavye odağında (`:focus-visible`) ve dosya seçilince kaydırır. (2) Boş GET alanları adrese girmez (`/ilanlar?q=ornek&departmentId=&…` → `?q=ornek`): `formdata` olayında boş metinler atılır (`omitEmptyFields`; Safari 15+, olay yoksa ya da JavaScript kapalıysa form eskisi gibi gider). (3) Arama girdisi için alt sınır 7,5 rem (120 px): 360 px'te satır tek kalır, 320 px'te (girdi 87-95 px, yerli temizle düğmesi "ornek"i kesiyordu) "Filtreler" alt satıra iner. (4) CV "CV'yi oku" çubuğu dosya seçilene kadar yapışkan DEĞİL: dosya yokken işe yaramaz ve 390/375/320 px'te seçicinin %44/%38/%60'ını örtüyordu; dosya seçilince yapışır ve seçici çubuğun üstüne alınır. Bedeli: ilk ekranda düğme dosya seçilene kadar alt gezinmenin altında kalır (önceden 390/375'te görünürdü). Ölçüm WebKit + Chromium, Playwright cihaz profili; gerçek iPhone'da denenmedi.

**Aylık özet gönderim anı denetimi veriye bağlandı (kart 300, TD-028).** `maySendNotification` aylık özeti gönderimde yeniden üretip konu ve DÜZ METNİ kuyruktakiyle karşılaştırıyordu (amaç meşru: bayat özeti göndermemek). Ölçüldü: tercih ve veri aynıyken yalnız `APP_URL` ya da `BETTER_AUTH_SECRET` (abonelik jetonu) değişince, ya da altbilgi/`tr.json` metni düzelince kuyruktaki bütün özetler o ay için sessizce düşüyordu; satır kullanıcı hiçbir şeyi kapatmadığı hâlde `EMAIL_PREFERENCE_DISABLED` yazıyor, günlük yoktu ve anahtar kaldığı için ay içinde yeniden denenmiyordu. Canlıya alımda `APP_URL` değişeceği için pilot öncesi kapatıldı. Karar: bayatlık VERİYLE ölçülür. `digestFingerprint` (`rules/digest.ts`): dönem + deneyim/ilan/etkinlik KİMLİKLERİ (küme) + başvuru dönemi etiketleri (firma/sektör adı) + puanlar, sha256 (metin, adres, jeton, `APP_URL`, gizli anahtar ve `tr.json` etiketleri girmez). Kuyruğa alırken `QueuedEmail.digestFingerprint` (kuyruk YÜKÜNDE, Prisma şeması ve migration değişmedi) yazılır, gönderimde aynı veriden yeniden hesaplanıp karşılaştırılır. Alan `queuedEmailSchema`'da olmak ZORUNDA: şemada olmazsa `safeParse` onu siler ve denetim sessizce eski metin karşılaştırmasına dönerdi; `queued[0].digestFingerprint` testle korunur. Parmak izinden ÖNCE kuyruğa alınmış kayıtlar (alan yok) geçiş dönemi için eski metin denetimiyle doğrulanır (bilinen sınır: onlar `APP_URL` değişimine duyarlı kalır; kuyruk yeni kayıtlarla dolunca bu dal ölü kalır). Sebep kodları: `decideNotification` karar SEBEBİYLE döner (`maySendNotification` yalnız boolean sarmalayıcıdır). `EMAIL_PREFERENCE_DISABLED` yalnız kullanıcı bildirimi gerçekten kapattığında yazılır; kuyruktaki içerik bayatsa `DIGEST_STALE`, `JOB_MATCH_STALE`, `APPLICATION_WINDOW_STALE` (bu iki dalın karşılaştırma mantığı değişmedi, yalnız kod); alıcı artık uygun değilse (hesap silindi/yasaklı, adres değişti, davetli artık üye, onay çekildi) `EMAIL_RECIPIENT_INELIGIBLE`. Bunlar `EmailLog.errorCode`'a yazılan İÇ dizgelerdir ve kullanıcıya dönmez; bu yüzden `src/lib/errors.ts` ve `messages/tr.json` `errors.codes` kaydına EKLENMEDİ (AGENTS §3 kuralı kullanıcıya dönen hata içindir); `EmailFailureCode` tipi ve db testleri korur. Bayat içerik `email.stale` olay adıyla günlüğe düşer (günlük kuralı aynı: alıcı, sebep ve gövde yazılmaz; sebep çıkış kutusu satırındadır). Kilit ekranı politikası (#144 P3'leri): konu satırında "reddedildi" yazılmamasıyla aynı gerekçeyle ön izleme (preheader) kişi adı, e-posta adresi, işveren adı ve gerekçe taşımaz; randevu e-postaları, e-posta değişikliği onayı ve "hâlâ çalışıyor musun" sabit, genel bir cümle kullanır (ayrıntı gövdede kalır), başka şablonun ilk cümlesinde e-posta adresi çıkarsa genel cümleye düşer; `email-presentation-security.test.ts` bunu gerçek üreticilerle ve katalogdaki bütün e-posta metinleri için tamlık denetimiyle korur (yeni şablon ilk cümlesine kişisel bilgi sızdırırsa test kırılır). Belge ret konusu "Mezun belgen onaylanamadı" → "Mezun belgen incelendi" (diğer ret konularıyla tutarlı).
**Boş platform turu (kart 298).** Bütün turlar zengin deneme verisiyle yapılmıştı; pilotun ilk günü platform neredeyse boş olacak. Kendi veritabanına yalnız zorunlu veri yazıldı (kurum/bölüm, ders sözlüğü, test kişileri, etiket, sözlük, puan kuralı; deneme içeriği ve örnek görüşme yok, test mentorları pasif) ve 6 kişi için (öğrenci, mezun, akademisyen, bölüm ve sistem yöneticisi, girişsiz) 120 ekran 390 px'te, öğrenci ve tanıtım sayfası ayrıca 1440 px'te gezildi; yatay taşma ve hata yok. İlkeler: (1) Filtre ya da arama yokken boş sonuç "bulunamadı" demez ("Bu filtrelerle deneyim bulunamadı", "Şirket bulunamadı" ilk gün yanlış anlatıyordu); "henüz yok" der. (2) Filtre/arama yokken "0 sonuç / 0 ilan / 0 soru / 0 şirketten soru bulundu" yazılmaz; sayaç ilk kayıtla ya da filtreyle görünür (`FilterShell.hideCount`). (3) Her boş ekranda tek, rol için doğru eylem (öğrenciye "ilan ver" denmez; ilan verebilen role "ilk ilanı sen paylaş"). (4) k≥3 eşiği ölü sayfa hissi vermeden, gerekçesiyle söylenir: şirket sayfası, mülakat soru bankası, başvuru takvimi (dönem), ders rehberi (ders sonucu) için "en az üç farklı kişi". Kural, sorgu ve eşik değişmedi; yalnız metin ve boş dal. Tanıtım sayfası "Şu ana kadar" sayıları: her sayı ayrı ayrı 3'ün altındaysa hiç basılmaz ve hiçbiri yoksa bant hiç çizilmez, yani 0 hiçbir yerde görünmez; bu zaten doğruydu ve testle kilitli (`landing.test.tsx`, `landing.test.ts`), yeni bir şey eklenmedi. Gizlilik notu da yalnız bant varken görünür. Bilerek bırakılanlar: (a) öğrencinin "Randevularım" boş durumundaki "Mentor bul" mentör yokken de boş mentör dizinine gider (dizin artık "deneyimlere bak" yolunu gösterir); (b) `/hesap/referanslar` boş metni tüm roller için ortak ve eylemsiz; (c) `/deneyimlerim`, `/ilanlarim` ve ilan verebilenin `/ilanlar` ekranında başlıktaki ve boş durumdaki eylem aynı hedefe gider (iki düğme, tek eylem); (d) mentor ve akademisyen için `/mentorlar` boş durumu rolden bağımsız "Deneyimlere bak" der (mentorluğu açma yolu ana sayfa ve hesaptadır); (e) `/hesap/sss` alan etiketi "Sorun" ("sorun" = problem okunabilir) ayrı küçük iş. Yeni bağımlılık, env, migration yok.

**Bayat çıkan aylık özet o ay kaybolmaz: ay başına en çok bir kez yeniden üretilir (kart 307, TD-028 devamı).** Kuyruktayken veri değişince özet `DIGEST_STALE` ile düşüyordu ve satırın kalıcı anahtarı (`monthly-digest:<kullanıcı>:<ay>`) o ay yeni özeti engelliyordu: kullanıcı o ayın özetini hiç almıyordu. PM kararı: bayat çıkan özet ertesi planlayıcı koşusunda taze veriyle bir kez daha üretilir. Uygulama: her deneme kendi anahtarını alır (ilk `…:<ay>`, yeniden üretim `…:<ay>:r1`; `monthlyDigestKey`, sınır `DIGEST_MAX_REGENERATIONS = 1`, `rules/digest.ts`). `nextMonthlyDigestKey` (`services/monthly-digest.ts`) sıradaki anahtarı seçer: satır yoksa o anahtar; satır yalnız `DIGEST_STALE` ile düşmüşse bir sonraki; gitmiş, kuyrukta bekleyen ya da başka nedenle düşmüş (tercih kapalı, alıcı uygun değil, taşıma hatası) satırdan sonra yeniden üretim YOK; `:r1` de bayat çıkarsa ay biter ve `DIGEST_STALE` kalır. Planlayıcı ve işçi aynı fonksiyonu çağırır; işçide kullanıcı kilidi altında ve işlemin içinde okunur, iki işçi yarışırsa ikincisi birincinin `:r1` satırını görüp çıkar, anahtar tekilliği çift gönderimi ayrıca engeller. **Karttaki "anahtar serbest bırakılır" ifadesinden ayrıldık:** bayat satırı yeniden adlandırmak yerine yeni anahtar türetildi. Anahtar el değiştirirse aynı kuyruk işinin yeniden teslimi satırı bulamaz (`EMAIL_LOG_MISSING` fırlatır, pg-boss denemeleri tüketilir), bayat satırın denetim izi kaybolur ve yeniden adlandırma ile yeni satır arasında yarış penceresi açılır; yeni anahtarda bayat satır olduğu gibi kalır. Bunun için `decideNotification` ayı anahtardan `.at(-1)` ile okumaz, `digestCycleOfKey` kullanır (`:r1` eki aksi halde her yeniden üretimi bayat sayardı). Kuyruk yükü, şema ve migration değişmedi. Bilinen sınır: planlayıcı ayın yalnız ilk 7 gününde koşar; bayatlık o pencereden sonra olursa yeniden üretim hakkı kullanılamaz (pencere ürün kararı, değiştirilmedi).
**Boş durum turundan kalan işler (kart 305).** (1) `/hesap/sss` alan etiketi "Sorun" ("sorun" = problem okunabiliyordu) → "Sorduğun soru" + yardım metni. (2) Boşken tek düğme: `/deneyimlerim` alttaki yapışkan "Deneyim yaz" çubuğu, `/ilanlarim` ve ilan verebilenin `/ilanlar` ekranı başlıktaki "İlan ver" gizlenir, boş durumun düğmesi kalır; dolu düzen aynı. (3) `/hesap/referanslar` boş durumu rolüne göre: mezun ("Referans verdim" tek eylem; başlıktaki gizlenir), öğrenci ve diğer roller eylemsiz ama nedeni yazılı ("referansı yalnız mezun başlatır"), inceleme kendi cümlesi. (4) `/mentorlar` boş dizin: mentor olabilen ama profili kapalı rolde "Mentor ayarlarını aç" (öğrencide "Deneyimlere bak" kalır); rol sayfada `getMyMentorSettings().eligible` ile bilinir. (5) Randevularım "Giden" boşken dizinde bu kullanıcının görebildiği hiç mentor yoksa "Mentor bul" yerine "henüz mentor listelenmiyor" + deneyimlere yönlendirme (`searchMentors({}).total === 0`; mentor varsa bugünkü). EK 6 (PM kararı): ret ve yönlendirme e-postalarının (deneyim, SSS ret ve mentora yönlendirme, ilan, mezun belgesi) önizlemesi de konu satırı gibi sonucu söylemez; nötr "… incelendi; ayrıntılar e-postada" der, sonuç gövdede kalır (`REVIEWED_PREVIEW`); politika testi her ret metnini kapsar ve katalogda adı ret/yönlendirme/red diyen yeni metin eklenince kırılır. Dikkat: yalnız ret nötr olunca onay e-postalarının önizlemesi ("… incelendi ve yayınlandı") hâlâ olumlu sonucu söylüyor, yani kilit ekranında "nötr = olumsuz" çıkarımı mümkün kalır; PM kararı yalnız retti, onay önizlemelerini de aynı nötr cümleye almak ayrı küçük iş önerisidir. EK 2 (#148 R1 notları): soru bankasında süzgeçle eşleşme yokken eski "henüz yok ve gizlilik" cümlesi yanlıştı → "Bu seçimle eşleşen soru yok" + süzgeci temizle (gizlilik cümlesi yalnız `insufficient` iken); aralık dışı sayfada toplam sayı ile "henüz yok" çelişiyordu → deneyim araması, mentör dizini, ilanlar, SSS ve soru bankasında "Bu sayfada sonuç yok" + ilk sayfa bağlantısı (deneyim araması ve SSS toplamı pencere sayımıyla 0 geldiği için sayaç da gizlenir); SSS arama sayacı testi eklendi. Yeni bağımlılık, env, migration yok.

**Gerçek ilk giriş turu (kart 313).** Test girişi olmadan gerçek akış (okul e-postası → e-postadaki bağlantı → onay → doğrulama → başlangıç; mezun: kişisel e-posta → belge → inceleme → yönetici onayı → onay e-postası) 390 px açık, sonra koyu ve 1440 px'te gezildi; hata yolları da denendi (İÜ dışı adres, büyük harf ve boşluklu adres, kullanılmış ve süresi dolmuş bağlantı, başka tarayıcıda açma, hız sınırı). Yalnız sunum değişti; kimlik, jeton ve hız sınırı mantığı aynı. (1) İlk onaydan sonra dönüş yolu yoksa ana sayfaya gidilir; eskiden `/hesap` ayarlar sayfasına düşüyordu ve sıradaki adım orada görünmüyordu. (2) Üyelik başarı ekranının tek eylemi "Başlangıç adımlarına geç" (`/baslangic`); eskiden "Durumu gör" iki ara sayfa daha açtırıyordu. Ana sayfadaki doğrulama kartı öğrenci ve akademisyeni doğrudan üyelik formuna götürür (araya tek düğmeli durum sayfası girmez); kişisel e-postayla gelen mezun (`emailKind === 'OTHER'`) için kart ve durum sayfası "Mezun belgeni yükle" der (eskiden öğrenciye yönelik genel metin). Ölçü (e2e adım farkı): onay kaydından başlangıç adımlarına 6 dokunuş (Ana sekmesi, Doğrulamaya git, Üyeliğini doğrula, Durumu gör, Ana sayfaya dön, Profilini tamamla) → 2 (Doğrulamaya git, Başlangıç adımlarına geç). (3) "E-postanı kontrol et" ekranı bağlantının süresini ve tek kullanımlık olduğunu söyler (süre e-postadaki `SIGN_IN_LINK_MINUTES` sabitinden gelir; ikisi birlikte değişir) ve adres yanlışsa girişe dönmeyi yazar. **Devredilen bulgu (mantığa dokunulmadı):** doğrulama ucunda IP başına 5 dakikada 10 isteklik sınır var; kampüs ağında aynı IP'den giren sınıf ilk girişte "Çok fazla deneme yaptın" görebilir. PM kararı W2'nin 314 kartına (EK B4) gitti. (4) **PM kararı (EK): onay e-postaları da nötr.** Konu ve ön izleme sonucu söylemez: deneyim, SSS (yayın ve mentora yönlendirme), ilan ve mezun belgesi onayları "… incelendi; ayrıntılar e-postada" der, sonuç gövdede kalır, düz metin gövdesi değişmedi. Gerekçe: kart 305'te yalnız ret nötr yapılınca onayın olumlu ön izlemesi kilit ekranında "nötr = olumsuz" çıkarımına izin veriyordu. Politika testi onay ve ret için tek kural ("ön izlemede inceleme sonucu yok"); katalogda adı onay/yayın/ret/yönlendirme diyen yeni bir metin listeye eklenmezse test kırılır. Randevu e-postalarının konusu hâlâ kararı söylüyor (ayrı iş).

**İlk giriş turu P3'leri (kart 316, 313 sonucu + #152 R1 notları).** (1) "E-postanı kontrol et" ekranı bağlantı istenen adresi (kullanıcının kendi yazdığı, maskesiz: maske yazım hatasını gizlerdi) ve "Farklı adres gir" bağlantısını gösterir. Adres URL'ye, çereze, sunucuya ve günlüğe girmez; yalnız o sekmenin `sessionStorage`'ında durur (sekme kapanınca gider; bellek kapalıysa ekran adressiz de eksiksizdir); ortak bilgisayarda sonraki kişi görmesin diye giriş tamamlanınca (oturumlu bir ekran çizilince) ve oturum kapatılınca da silinir; saklanan ve gösterilen adres en çok 254 karakterdir (testle kilitli). Başka tarayıcıda açılan bağlantı isteği yapan sekmeyi beklemede bırakır; otomatik algılama kimlik mantığına dokunurdu, bu yüzden sabit yardım cümlesi yazıldı ("başka bir tarayıcıda ya da cihazda açtıysan orada giriş yapmış olursun; bu sekmeyi kapatabilirsin"). (2) Zorunlu onay beklerken (oturum var, güncel onay yok) alt sekme çubuğu ve masaüstü yan menü çizilmez: sekmelerin hepsi onaya geri yolluyordu. Karar `AppShell`'de sunucudan gelir (`consentPending`), yol adından çıkarılmaz ve yalnız `CONSENT_REQUIRED` hatasında verilir (veritabanı gibi başka bir hata gezinmeyi gizlemez); yapışkan eylem çubuğu ekranın dibine iner. Başlangıç adımlarında (`/baslangic`) alt çubuk **açık kaldı**: oradaki sekmeler çalışıyor ve adım çubuğu alt gezinmenin yüksekliğine göre konumlu; kapatmak ayrı bir düzen işi. (3) Mezun belgesi onay e-postasının düğmesi "Başlangıç adımlarına geç" → `/baslangic` (eskiden durum sayfasıydı: bir ara sayfa); ret e-postası yeniden başvuru için durum sayfasında kalır. (4) Soru bankasında süzgeç varken boş sonuç tek eylem olarak "Filtreleri temizle"yi söyler. Eşleşme gerçekten yoksa başlık "Bu seçimle eşleşen soru yok"; gizlilik eşiğinin altında kalan bir şirket varsa "eşleşen yok" fazla kesindir (soru var ama gösterilemiyor olabilir), başlık "Bu seçimde henüz gösterilebilecek soru yok" olur ve altına gizlilik gerekçesi yazılır. Eşik ve hesap değişmedi; metin sayı, yer tutucu ya da şirket adı vermez (sabit dize; testle kilitli: ileride biri sayı eklerse kırılır). Süzgeçsiz hâl aynı kaldı. (5) Önizleme tamlık testi adlandırmaya değil içeriğe bağlandı: katalogdaki her e-posta metninin ham ön izlemesi (ilk cümle) sonuç sözcüğü ("yayınlandı", "onaylandı", "reddedildi", …) taşıyorsa metin ya nötr cümleye bağlı (`REJECTIONS`) ya da gerekçesiyle "bilerek serbest" (randevu onayı: PM kararı, gizli değil ve işe yarar; bağlantı eklendi: karar değil) olmalı; yeni şablon adı ne olursa olsun bu kuralı geçmeden eklenemez. `/mentorlar` ve `/randevular` sayfa dosyalarındaki üç bağlantı kararı (`canOpenMentoring`, `mentorsAvailable`, rol) testle kilitlendi. Kimlik, jeton ve hız sınırı mantığına dokunulmadı.
**İlk giriş turu P3'leri (kart 316, 313 sonucu + #152 R1 notları).** (1) "E-postanı kontrol et" ekranı bağlantı istenen adresi (kullanıcının kendi yazdığı, maskesiz: maske yazım hatasını gizlerdi) ve "Farklı adres gir" bağlantısını gösterir. Adres URL'ye, çereze, sunucuya ve günlüğe girmez; yalnız o sekmenin `sessionStorage`'ında durur (sekme kapanınca gider; bellek kapalıysa ekran adressiz de eksiksizdir); ortak bilgisayarda sonraki kişi görmesin diye giriş tamamlanınca (oturumlu bir ekran çizilince) ve oturum kapatılınca da silinir. Başka tarayıcıda açılan bağlantı isteği yapan sekmeyi beklemede bırakır; otomatik algılama kimlik mantığına dokunurdu, bu yüzden sabit yardım cümlesi yazıldı ("başka bir tarayıcıda ya da cihazda açtıysan orada giriş yapmış olursun; bu sekmeyi kapatabilirsin"). (2) Zorunlu onay beklerken (oturum var, güncel onay yok) alt sekme çubuğu ve masaüstü yan menü çizilmez: sekmelerin hepsi onaya geri yolluyordu. Karar `AppShell`'de sunucudan gelir (`consentPending`), yol adından çıkarılmaz ve yalnız `CONSENT_REQUIRED` hatasında verilir (veritabanı gibi başka bir hata gezinmeyi gizlemez); yapışkan eylem çubuğu ekranın dibine iner. Başlangıç adımlarında (`/baslangic`) alt çubuk **açık kaldı**: oradaki sekmeler çalışıyor ve adım çubuğu alt gezinmenin yüksekliğine göre konumlu; kapatmak ayrı bir düzen işi. (3) Mezun belgesi onay e-postasının düğmesi "Başlangıç adımlarına geç" → `/baslangic` (eskiden durum sayfasıydı: bir ara sayfa); ret e-postası yeniden başvuru için durum sayfasında kalır. (4) Soru bankasında süzgeç varken boş sonuç, gizlilik eşiğinin altında kalan bir şirket olsa bile arama dilini ("Bu seçimle eşleşen soru yok") ve tek eylemi "Filtreleri temizle"yi söyler; gerekçe aynı cümleye eklenir, eşik ve hesap değişmedi, metin sayı ya da şirket adı vermez. Süzgeçsiz hâl aynı kaldı. (5) Önizleme tamlık testi adlandırmaya değil içeriğe bağlandı: katalogdaki her e-posta metninin ham ön izlemesi (ilk cümle) sonuç sözcüğü ("yayınlandı", "onaylandı", "reddedildi", …) taşıyorsa metin ya nötr cümleye bağlı (`REJECTIONS`) ya da gerekçesiyle "bilerek serbest" (randevu onayı: PM kararı, gizli değil ve işe yarar; bağlantı eklendi: karar değil) olmalı; yeni şablon adı ne olursa olsun bu kuralı geçmeden eklenemez. `/mentorlar` ve `/randevular` sayfa dosyalarındaki üç bağlantı kararı (`canOpenMentoring`, `mentorsAvailable`, rol) testle kilitlendi. Kimlik, jeton ve hız sınırı mantığına dokunulmadı.

**Kampüs NAT ve yönetici kapsamı (kart 314).** Ortak kampüs IP'sinde 80 farklı kullanıcının beş dakikada giriş yapabilmesi için bağlantı isteği/doğrulama IP penceresi 120/5 dk, uygulama IP penceresi 200/saat, genel Better Auth penceresi 1000/dk; e-posta başına 5/saat ve tek kullanımlık özetli jeton korunur. Paylaşılan IP sınırı aşılırsa nötr yoğunluk mesajı gösterilir. IP'nin güvenilir proxy ile doğru belirlenmesi TD-021'dir. Kapsam dışı yönetici kayıtları olmayan kayıtla aynı yanıtı verir; mentor deneyim filtresi yalnız arayanın üniversitesindeki yayınları sayar.
