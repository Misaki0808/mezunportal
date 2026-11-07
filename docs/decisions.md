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
