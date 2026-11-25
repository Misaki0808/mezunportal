# BACKLOG.md — Güncel durum, açık işler ve kararlar

Son güncelleme: **2026-11-20**. Tek durum belgesidir: güncel durum, açık kararlar, pilot kapıları,
teknik borç ve ertelenmiş işler. Tamamlanan madde silinir; geçmiş Git'tedir. Çalışma günlüğü
tutulmaz. Faz içindeki adımlar faz planındadır (`docs/fazN-plan.md`); kararların gerekçesi
`docs/decisions.md`'dedir.

## Güncel durum

Faz 0 (iskelet, veritabanı, yerel ortam, tasarım sistemi, ekip araçları), Faz 1 (çekirdek, tamamlayıcılar ve SSS ekranları dahil) ve
Faz 2'nin (fırsatlar, mevcut veriden değer, rehberlik, tanınma; `docs/faz2-plan.md`) onaylanmış kod kapsamı main'dedir; bilinçli sapmalar planın §12 kapanış notundadır. Canlı ortam
yoktur ve bilinçli ertelenmiştir: geliştirme, test ve ekran doğrulaması yerelde, birleştirme kapıları yerelde; CI az ve öz (≤ 5 dk, K-14
kararı, `docs/engineering.md` "CI"). Kullanıcı denemesinin rehberi `docs/engineering.md` “Faz 2 deneme rehberi”dir; tamamlanan işler ve bilinçli sapmalar faz planlarında, gerekçeler `docs/decisions.md`'dedir.

Yerel demo, Yılın Mezunu için örnek ödül dönemi ve kazananı içerir (`prisma/seed-awards.ts`); gerçek kullanıcı denemesi henüz yapılmadı.

Kullanıcıyı, hocayı ve PM'i bekleyen her şey tek listededir: aşağıdaki "Açık ürün kararları". Hiçbiri kodla çözülemez ve
hiçbiri geliştirmeyi durdurmaz; her biri ilgili işe gelince sorulur.

### Yakın hedef

Kullanıcının Faz 2 deneme turu: `docs/engineering.md` "Faz 2 deneme rehberi" ve kapanış paketindeki telefon listesi (84 kutu, Git dışı
`pm-handoff/faz2-kapanis/`). Masaüstü Chromium 390 px ve Android emülatör provalarında ilk 70 kutunun 64'ü geçti, 6'sı gerçek cihaz bekliyor;
"0. İlk giriş" bölümündeki 12 kutunun tamamı gerçek e-posta bağlantısıyla geçti. Yerel demo duman turunda beş rolün menüleri ve kritik yolları açıldı; bu prova gerçek cihaz denemesinin yerini tutmaz. Gerçek cihazda telefona ağ adresiyle açma, QR'ı telefon kamerasıyla
okutma, ana ekrana ekleme, iPhone çentik ve güvenli alan, iPhone ekran klavyesi, Safari'de Tab ve mezun belgesi ile CV inceleme PDF'inin Safari'de satır içi açılması (K-16) denenir. Bulgular PM'de karta bölünür ya da bu
belgeye borç olarak yazılır. Hesap isteyen işler ile canlıya alım ve pilot kararları kullanıcı gündeme getirince ele alınır. Faz 3 pilottan sonra konuşulur.

### Bilinen kısıtlar

- Ücretli servis açılmaz. CV için OpenAI uyumlu adaptör ve ücretsiz yerel Ollama yolu hazırdır; canlı sağlayıcı seçimi ve uzak aktarım kararı K-04 kapsamındadır.
- CI az ve öz (K-14 kararı, ≤ 5 dk: tür, kalite, hızlı birim); veritabanı testleri, build ve e2e yerel PM birleştirme kapısındadır.

## Açık ürün kararları

Tek liste: kullanıcıya "benim kararımı bekleyen ne var" sorulduğunda bakılacak yer. Önce **Kullanıcı** (hesap, para, repo, elle iş),
sonra **Hoca** (kullanıcı üzerinden sorulur), sonra **PM**. Hepsi birden değil, ilgili işe gelince sorulur. Karar verilince madde silinir ve
gerekçe `docs/decisions.md`'ye yazılır. Ücretli servis hiçbir satırda yoktur.

### Kullanıcı

| No | Ne gerekiyor | Ne zaman | Neyi engelliyor |
|---|---|---|---|
| K-15 | Commit'lerde kişisel Gmail adresin görünüyor ve repo herkese açık: sonraki commit'ler için GitHub'ın gizli adresini kullanmak mı, böyle kalmak mı? | Bir cümle, istediğin an; karar verilene kadar yeni commit'ler de aynı adresle gider, geçmiş commit'ler değişmez | Yeni commit yapılandırması |
| K-02 | Canlı sunucu ve dağıtım aracı: üniversite sunucusu (hocaya sor) ya da ücretsiz bir seçenek | Pilota geçmeye karar verince | PILOT-DEPLOY |
| K-05 | Canlı e-posta (SMTP): üniversite SMTP'si; olmazsa ücretsiz katmanlı bir servis | K-02 ile birlikte | Gerçek e-posta teslimi |
| K-04 | Canlı CV sağlayıcısını ve uzak aktarım koşullarını seç; gerekiyorsa anahtarı yalnız `korunan/` altında tut | Canlı sağlayıcı kullanılmadan önce | TD-009 doğruluk ölçümü |
| E4 | Google Cloud projesi, OAuth onay ekranı ve takvim izni; anahtarlar `korunan/google.env`'e; sonra `CALENDAR_PROVIDER=google` ve `/yonetim/google` | Gerçek takvim daveti ve Meet linki denemek istediğinde; yapılmazsa mentor linki elle ekler | P1-10 kabulü |
| E3 | LinkedIn ile giriş **ertelendi** (kullanıcı kararı, `docs/decisions.md` 15 Kas): açık katman iş geçmişi, okul ve yetenek vermiyor; uygulama ve anahtar istenmez. Kod duruyor, anahtar yoksa düğme gizli | Kullanıcı LinkedIn ile girişi yeniden isterse (şirket sayfası + "Sign In with LinkedIn using OpenID Connect" uygulaması, anahtarlar `korunan/`'a) | Hiçbir şeyi; giriş e-posta bağlantısıyla çalışır |
| Platform hesabı | Kurumsal kimlik: platformun adı ve LinkedIn kurum sayfası, canlı alan adı | Acelesiz; ödül paylaşımından (P2-01) ve canlı adresten önce | P2-01 paylaşımı, canlı alan adı |
| K-16 | Satır içi PDF için Safari denemesi: mezun belgesi ve CV inceleme PDF'i iPhone Safari'de sayfa içinde açılıyor mu; yanıt başlığında `sandbox` kısıtı olup olmayacağı buna bağlı. Playwright WebKit PDF'i hiçbir politikada satır içi göstermediği için ölçülemedi | Gerçek cihaz turunda (bkz. "Yakın hedef") | Satır içi PDF yanıt başlığındaki `sandbox` kararı |
| K-17 | TD-021 için canlı vekilin istemci IP'sini nasıl ilettiği: kaç vekil var, hangi başlığı yazıyor (nginx varsayılanı istemcinin değerini ilk değer olarak bırakır). Seçim dağıtım topolojisine bağlı, kodla önceden seçilemez | K-02 ile birlikte | TD-021, PILOT-DEPLOY |

### Hoca (kullanıcı üzerinden)

| No | Ne gerekiyor | Ne zaman | Neyi engelliyor |
|---|---|---|---|
| K-03 | Veri sorumlusu **karar verildi**: şimdilik proje sahibi, gerçek kişi (`docs/decisions.md`). İletişim ve başvuru adresi yazıldı (platform hesabı, `docs/legal-drafts.md` §1). Kalan: gerçek sistem/bölüm yöneticileri kimler; cevabı aynen yazmak yeter | Pilot ve canlıdan önce | Gerçek yönetici atamaları |
| K-12 | Pilot zamanı **belli**: finaller bittikten sonraki ~1 aylık tatil (`docs/decisions.md`). Kalan: pilot kimlerle yapılacak ve başarı ölçütleri (Faz 2 taslağı `docs/faz2-plan.md` §1'de) | Tatil başlamadan önce | Pilot kararı, başarı ölçütleri kutusu |
| PILOT-LEGAL | Hukuki metinlerin hocanın onayı ve üniversite KVKK birimi ya da bir hukukçu tarafından okunması | Canlıya almadan önce; taslak hâli pilot ve deneme için yeterli | Canlı açılış |

### PM

| No | Ne gerekiyor | Ne zaman | Neyi engelliyor |
|---|---|---|---|
| PM-01 | "Oturumlarım" ekranı: hesap ayarlarında açık oturumları gösteren ve kapatan ekran yok (kodda oturum listeleme ya da tek oturumu kapatma kullanımı yok). Yapılsın mı; yapılırsa ne gösterilsin (cihaz, son kullanım) ve "diğerlerini kapat" olsun mu? | Kullanıcı denemesinden sonra; denemede ihtiyaç çıkarsa öne alınır | Hiçbir şeyi |
| PM-02 | Puan kazanıldığında ve Yılın Mezunu ödülü sonuçlandığında uygulama içi bildirim: bildirim türleri arasında puan ya da ödül yok (`NotificationType`), puan ve ödül servisleri bildirim üretmiyor. Eklensin mi; eklenirse tercih ekranına yeni tür olarak mı gelsin? | Ödül paylaşımı (P2-01) kararıyla birlikte | Hiçbir şeyi |

## Pilot öncesi kapılar

- [ ] **PILOT-LEGAL** Hukuki metinler `docs/legal-drafts.md`'de yedi taslak bölümdür (§1-§7: aydınlatma, yurt dışı aktarım rızası, kullanım
  şartları, staj arayan görünürlüğü, Yılın Mezunu doğrulaması, Ayın mezunu rızası, Faz 2 ekleri); hepsi `taslak-1` ve "hoca / hukuk onayı
  bekliyor". Veri sorumlusunun adı ve iletişim adresi yazıldı (proje sahibi ve platform hesabı, K-03); sağlayıcı adı ve hukuk görüşü alanları köşeli parantezle boştur (K-04, K-05); kod aynı sürümü kullanır
  (`src/contracts/privacy.ts`) ve ekranda metin taslak diye işaretlidir. Biter: alanlar dolar, hoca onaylar, üniversite KVKK birimi ya da bir
  hukukçu okur, onaylı sürüm köke taşınır ve sürüm numarası artar (kullanıcılar yeniden onay verir). Hukuk okumasına sorulacaklar: veri sorumlusu gerçek kişi olduğu için sicil/bildirim yükümlülüğü ve üniversiteyle ilişkinin metinde nasıl anlatılacağı.
- [ ] **PILOT-TEST** Test planı iki belgededir: `docs/engineering.md` "Faz 2 deneme rehberi" ve telefon listesi (84 kutu, Git dışı); `docs/faz1-plan.md`'ya
  ayrı bölüm yazılmadı. Ön provalar ve gerçek cihazda bekleyen adımlar için bkz. "Yakın hedef". Biter: kullanıcı turu bir kez koşar, bulgular kapanır
  ya da borç yazılır. Canlıda ayrıca P1-18 kabul adımları koşulur (PILOT-DEPLOY).
- [ ] **PILOT-DEPLOY** Kod tarafı hazır: çok aşamalı `Dockerfile` (web ve worker aynı imajdan), açılışta `migrate deploy` (seed yok),
  `/api/health` (durum, ortam, commit, DB), `scripts/backup.sh` ve `scripts/restore.sh`, toplu davet, prod'da test girişi ve `/ui-ornekleri` 404, yerel imaj
  provası `docker-compose.image.yml`; rehber `docs/engineering.md` "Canlıya alım". Kalan: sunucu (K-02), canlı SMTP (K-05), gerçek yönetici ve
  kurum verisi (K-03), TD-021 (güvenilir proxy; kapanmadan canlıya alınmaz), başarı ölçütleri kutusu (K-12; `/yonetim/kullanim` ekranı var, kutu
  kodda yok). Canlı kabul: `/api/health` `env: "prod"` ve `sha` dağıtılan commit, yedek geri yüklenip doğrulanır, davet edilen gerçek kullanıcı
  (kullanıcının kendisi) uçtan uca kayıt olur, seed verisi girmemiş. Bu adımdan sonra veri değiştiren migration ve dağıtım PR başına kullanıcı onayı ister.
- [ ] **PILOT-ROZET** Kod hazır: `FOUNDING_MEMBER_UNTIL` boşken kurucu üye etiketi sürer (`.env.example`, `src/lib/env.ts`, `src/server/services/points.ts`; K-10).
  Biter: pilot bitince canlı ortamda tarih doldurulur (pilot finaller sonrası ~1 aylık tatilde, K-12; kesin tarih gelince).

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

- [ ] **TD-009** · P1 · CV ayrıştırma doğruluğu kapsamlı gerçek model ölçümü bekliyor
  Ne: OpenAI uyumlu adaptör ve 5 sentetik CV için ölçüm düzeneği (`src/test/cv-accuracy.ts`) hazır. Yerel qwen2.5:7b ile iki basit sentetik PDF üzerinde alan bulunması ölçüldü; bu ölçüm yanlış eklenen alanları veya beş örneğin tamamını kapsamıyor.
  Neden borç: P1-05 kabulündeki kapsamlı doğruluk ve canlı sağlayıcı seçimi (K-04) henüz doğrulanmadı.
  Kapanış ölçütü: seçilen gerçek sağlayıcıyla aynı 5 örneğin doğru, eksik ve yanlış eklenen alanları ölçülür; sonuç tablosu ve veri politikası kaynakla doğrulanır.
- [ ] **TD-013** · P2 · `UserSkill` tablosu artık kullanılmıyor
  Ne: beceriler `Tag(SKILL)` + `ProfileTag`'e taşındı (P1-06); eski `UserSkill` tablosu ekleyici politikası gereği
  yerinde duruyor (hesap silme hâlâ eski satırları siler).
  Neden borç: ölü tablo ve yanıltıcı model.
  Kapanış ölçütü: daraltma migration'ı tabloyu kaldırır (geri alma adımıyla), `Skill` sözlüğü yalnız eşleme için kalır.
- [ ] **TD-021** · P1 · Canlıya alımda (K-02) güvenilir proxy ayarı
  Ne: `getRequestContext` şu anda istemcinin değiştirebildiği X-Forwarded-For değerini kullanır; IP kotası
  yalnız tamamlayıcı korumadır. Bu durum bütün kamuya açık hız sınırlarını etkiler.
  Neden borç: istemci XFF değiştirerek kotayı aşabilir; canlıda kaynak IP platform tarafından doğrulanmalıdır.
  Ölçüm (kart 531, üretim derlemesi): sabit XFF ile 201. istekte IP sınırı çalışır, XFF değiştirilince sınır hemen sıfırlanır,
  XFF yoksa IP sınırı hiç yoktur (Better Auth GET sınırı da öyle); adres başına saatte 5 bağlantı sınırı bundan bağımsız korunur,
  yani tek adrese bombardıman yoktur ama farklı adreslere giriş e-postası sınırsız gönderilebilir. Vekil XFF'i EKLİYORSA
  (nginx varsayılanı) “ilk değer” tam olarak istemcinin değeridir; güvenilir atlama sayısı ya da vekilin yazdığı tek başlık gerekir.
  Kapanış ölçütü: güvenilir proxy istemci başlıklarını ezer; `getRequestContext` yalnız platformun eklediği
  son hop'u kullanır, istemcinin XFF'sine güvenmez. Node doğrudan dışarı açılmaz; bütün kamuya açık
  kotalarda sahte başlık, eşzamanlı sınır ve pencere yenilenmesi testleri geçer.

- [ ] **TD-027** · P2 · pg "Calling client.query() when the client is already executing a query" uyarısı (pg@9'da hataya döner)
  Ne: Prisma 7.10.1 + `@prisma/adapter-pg` 7.10.1 + pg 8.23.1 ile işlemde tek Prisma sorgusunun birden fazla ilişkisi hâlâ tek pg istemcisine eşzamanlı sorgu gönderebilir. Aktör ve yönetim kullanıcı/atama yolları ayrıldı; işlem istemcisindeki açık paralel okumalar sıralandı. `scripts/td027-probe.ts relations` kalan yukarı akış davranışının kayıtlı yeniden üretimidir; komut ve ölçüm `docs/decisions.md`'de.
  Neden borç: uyarı pg@9'da hataya dönüşebilir; bütün ilişkili sorguların veya Prisma adaptörünün kesin çözümü henüz doğrulanmadı. Yukarı akış kaydı: https://github.com/prisma/orm/issues/29407.
  Kapanış ölçütü: kayıtlı ilişkili sorgu yeniden üretimi ve uygulamanın dev/e2e sunucuları uyarısız çalışır; e2e `--no-deprecation` istisnası kaldırılır, ilgili sonuç eşitliği ve kapılar geçer.

- [ ] **TD-029** · P2 · Profil bağlantıları birim testi yük altında ara sıra kırmızı
  Ne: `src/components/profile/profile.test.tsx` "bağlantılar: http ve izinsiz alan adı…" yalnız tam takım koşusunda ve işlemci çekişmesi altında
  ara sıra düşer: adres alanı `htt` değerinde kalır, `submit()` yazılan adresin ilk üç karakterini görür; test tek başına koşunca yeşildir.
  Kök bulunamadı: bileşende değeri önceden okuma yaması ve `waitFor` eklemek etkisiz, testin içine eşzamanlı günlük koymak sorunu gizliyor
  (Git dışı ölçüm notu: `pm-handoff/515_R1_profil-dalga.sonuc.md`). Gerçek tarayıcıda aynı yarışın olup olmadığı ölçülmedi.
  Neden borç: birleştirme kapısında sahte kırmızı; kapıyı baştan koşturur.
  Kapanış ölçütü: kök bulunur ya da test `type` ile `click` arasında sağlamlaştırılır; eylem gecikmeli tarama düzeneğinde (8 koşu) kırmızı görülmez.

### Bilinçli kabul edilen sınırlar

- Canlı ortam yok; imaj ve yedek geri yükleme yerelde sınandı, canlı kabul PILOT-DEPLOY kapsamında bekliyor.
- e-Devlet mezun belgesi elle doğrulanır (otomatik doğrulama için açık API yok).
- Bölüm bilgisi beyandır; e-posta alan adı yalnız üniversiteyi doğrular.

### Bakım kuralı

Reviewer'ın kapsam dışı bulduğu ama engel olmayan borç PM'ye gider; PM onaylarsa bir sonraki
PR'da bu bölüme yazılır. Faz kapanışında kayıtsız kalmış borçlar bu bölüme işlenir.

## Faz 3 fikirleri (aktif iş değil)

Kariyer yolu haritası · diğer fakültelere ve üniversitelere açılma. Doğal dille arama yerine yapılandırılmış mezun ve sektör filtreleri kullanılır.

- Mülakat tüyolarında pozisyon süzgeci ve "kaydet/çalış" listesi (P2-10'dan ertelendi): deneyimde pozisyon alanı gerekir; anonim deneyimde yarı tanımlayıcı olma riski
  (`docs/decisions.md`) ve P1 form kapsamı yüzünden Faz 2'de yapılmadı.


## Sürekli kapılar

- Her faz sonunda `faz-kapanis` skill'i: kapılar yeniden, plan↔yapılan, telefon testi, hocaya
  rapor.
- Çekirdek akış testleri (`pnpm test:e2e`) main'de yeşil kalır.
