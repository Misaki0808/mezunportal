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

## 2026-11-08 · Yönetim paneli: kapsam, askı ve toplu rapor kuralları
Askıya alma Better Auth ban alanlarına yazılır ama eklentinin HTTP ucu kapalı olduğundan kendi servisimiz yazar (oturumlar
aynı işlemde silinir). Askı hesap geneli olduğu için hedefin bütün etkin üyelikleri yöneticinin kapsamında olmalıdır; aksi
halde yalnız sistem yöneticisi yapar. Yetkili kullanıcıyı yalnız sistem yöneticisi askıya alır (bölüm yöneticisi
üstünü susturamasın), kimse kendi hesabı/yetkisi üzerinde işlem yapamaz ve son sistem yetkisi kaldırılamaz. Mezun
istihdam raporu ve Excel yalnız toplu sayı verir: kişi satırı yok, yalnız sözlükle eşleşen adlar, üç kişiden küçük
gruplar bastırılır — serbest metin ve tek kişilik gruplar kimliği ele verirdi. Excel `.xlsx`tir (Türkçe karakterler için
UTF-8, CSV'nin BOM sorunu yok). Sözleşme iki dosyadır: panel sorguları (W2) ve kullanıcı/yetki eylemleri.

## 2026-11-08 · Yönetim sözleşmesinde değer maskesi ve açık onay

Maskeli telefon/e-posta çıktı alanları maske biçimini doğrular; yalnız alanı masked diye adlandırmak ham
veri sızıntısını engellemez. P1-11 kartına göre yıkıcı/yetki değiştiren kullanıcı işlemleri açık
confirmed:true ister; askı kaldırma da gerekçelidir. Sözlük silme ve eşleşmeyeni atmada onay/gerekçe
sözleşmede zorunludur. Excel bağlantısı yalnız filtre şemasından geçen alanları taşır; kişisel ya da
bilinmeyen URL parametresi eklenmez. Bu alanlar ekranın onay penceresi ile sunucu doğrulamasını bağlar.

