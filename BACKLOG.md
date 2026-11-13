# BACKLOG.md — Güncel durum, açık işler ve kararlar

Son güncelleme: **2026-11-13**. Tek durum belgesidir: güncel durum, açık kararlar, pilot kapıları,
teknik borç ve ertelenmiş işler. Tamamlanan madde silinir; geçmiş Git'tedir. Çalışma günlüğü
tutulmaz. Faz içindeki adımlar faz planındadır (`docs/fazN-plan.md`); kararların gerekçesi
`docs/decisions.md`'dedir.

## Güncel durum

Faz 0 (iskelet, veritabanı, yerel ortam, tasarım sistemi, ekip araçları), Faz 1 (çekirdek, tamamlayıcılar ve SSS ekranları dahil) ve
Faz 2'nin (fırsatlar, mevcut veriden değer, rehberlik, tanınma; `docs/faz2-plan.md`) onaylanmış kod kapsamı main'dedir; bilinçli sapmalar planın §12 kapanış notundadır. Canlı ortam
yoktur ve bilinçli ertelenmiştir: geliştirme, test ve ekran doğrulaması yerelde, birleştirme kapıları yerelde; CI az ve öz (≤ 5 dk, K-14
kararı, `docs/engineering.md` "CI"). Kullanıcı denemesinin rehberi `docs/engineering.md` “Faz 2 deneme rehberi”dir; tamamlanan işler ve bilinçli sapmalar faz planlarında, gerekçeler `docs/decisions.md`'dedir.

Kullanıcıyı, hocayı ve PM'i bekleyen her şey tek listededir: aşağıdaki "Açık ürün kararları". Hiçbiri kodla çözülemez ve
hiçbiri geliştirmeyi durdurmaz; her biri ilgili işe gelince sorulur.

### Yakın hedef

Kullanıcının Faz 2 deneme turu: `docs/engineering.md` "Faz 2 deneme rehberi" ve kapanış paketindeki telefon listesi (70 kutu, Git dışı
`pm-handoff/faz2-kapanis/`). R2'nin provası (13 Kas, `f063d21` derlemesi, Chromium 390 px) 60 kutuyu geçirdi, 0 kaldı; 10 kutu gerçek cihaz
ister: "Gerçek iPhone'da bak" bölümünün 6 kutusu, QR'ı telefon kamerasıyla okutma, ekran klavyesi, ana ekrana ekleme ve telefona ağ adresiyle
açma adımı. Bulgular PM'de karta bölünür ya da bu belgeye borç olarak yazılır. Hesap isteyen işler ile canlıya alım ve pilot kararları
kullanıcı gündeme getirince ele alınır. Faz 3 pilottan sonra konuşulur.

### Bilinen kısıtlar

- Ücretli servis açılmaz. CV için seçilen Gemini ücretsiz katmanının adaptörü yazılmadı (`LLM_PROVIDER` yalnız `fake` kabul eder; prod'da `fake` reddedilir): anahtar ve aktarım rızası metninin onayı gelince yazılır, o zamana kadar canlıda CV ayrıştırma kapalı, elle giriş açıktır.
- Öğrenci e-posta alanı doğrulandı (kullanıcının kendi hesabıyla); personel alanı, YBS fakültesi ve program dili teyit bekliyor (K-06, geçici değerler `prisma/seed-data.ts`'te).
- CI az ve öz (K-14 kararı, ≤ 5 dk: tür, kalite, hızlı birim); veritabanı testleri, build ve e2e yerel PM birleştirme kapısındadır.

## Açık ürün kararları

Tek liste: kullanıcıya "benim kararımı bekleyen ne var" sorulduğunda bakılacak yer. Önce **Kullanıcı** (hesap, para, repo, elle iş),
sonra **Hoca** (kullanıcı üzerinden sorulur), sonra **PM**. Hepsi birden değil, ilgili işe gelince sorulur. Karar verilince madde silinir ve
gerekçe `docs/decisions.md`'ye yazılır. Ücretli servis hiçbir satırda yoktur.

### Kullanıcı

| No | Ne gerekiyor | Ne zaman | Neyi engelliyor |
|---|---|---|---|
| K-15 | Commit'lerde kişisel Gmail adresin görünüyor ve repo herkese açık: sonraki commit'ler için GitHub'ın gizli adresini kullanmak mı, böyle kalmak mı? | Bir cümle, istediğin an; karar verilene kadar yeni commit'ler de aynı adresle gider, geçmiş commit'ler değişmez | Yeni commit yapılandırması |
| K-06 | Teyit: personel e-posta alanı (`istanbul.edu.tr`), YBS'nin fakültesi (İktisat Fakültesi) ve program dili (Türkçe mi İngilizce mi). Yanlışsa yalnız `prisma/seed-data.ts` değişir | Gerçek kullanıcı kaydından önce; personel alanı akademisyen doğrulamasını belirler | P1-02'nin canlı kabulü |
| K-02 | Canlı sunucu ve dağıtım aracı: üniversite sunucusu (hocaya sor) ya da ücretsiz bir seçenek | Pilota geçmeye karar verince | PILOT-DEPLOY |
| K-05 | Canlı e-posta (SMTP): üniversite SMTP'si; olmazsa ücretsiz katmanlı bir servis | K-02 ile birlikte | Gerçek e-posta teslimi |
| K-04 | Gemini ücretsiz katman API anahtarını `korunan/gemini.env`'e koy (kimseye yazma); gerçek sağlayıcıya gönderim ayrıca yurt dışı aktarım rızası metninin onayına bağlı | Gerçek CV/LinkedIn ayrıştırmayı denemek istediğinde | TD-009 doğruluk ölçümü |
| E4 | Google Cloud projesi, OAuth onay ekranı ve takvim izni; anahtarlar `korunan/google.env`'e; sonra `CALENDAR_PROVIDER=google` ve `/yonetim/google` | Gerçek takvim daveti ve Meet linki denemek istediğinde; yapılmazsa mentor linki elle ekler | P1-10 kabulü |
| E3 | LinkedIn'de şirket sayfası + uygulama ("Sign In with LinkedIn using OpenID Connect"); client id ve secret `korunan/`'a | LinkedIn ile giriş istendiğinde; yapılmazsa e-posta bağlantısıyla giriş çalışır, LinkedIn düğmesi sebebiyle birlikte devre dışı görünür | P1-02 kabulü (LinkedIn yolu) |
| Platform hesabı | Kurumsal kimlik: platformun adı ve LinkedIn kurum sayfası, canlı alan adı | Acelesiz; ödül paylaşımından (P2-01) ve canlı adresten önce | P2-01 paylaşımı, canlı alan adı |

### Hoca (kullanıcı üzerinden)

| No | Ne gerekiyor | Ne zaman | Neyi engelliyor |
|---|---|---|---|
| K-03 | Veri sorumlusu kim (üniversite, bölüm ya da kullanıcı) ve sistem/bölüm yöneticileri kimler; cevabı aynen yazmak yeter | Pilot ve canlıdan önce | PILOT-LEGAL (metinlerin boş alanları), gerçek yönetici atamaları |
| K-12 | Pilot: kimler, ne zaman, başarı ölçütleri (Faz 2 taslağı `docs/faz2-plan.md` §1'de) | Pilot tarihi konuşulurken | Pilot kararı, başarı ölçütleri kutusu |
| PILOT-LEGAL | Hukuki metinlerin hocanın onayı ve üniversite KVKK birimi ya da bir hukukçu tarafından okunması | Canlıya almadan önce; taslak hâli pilot ve deneme için yeterli | Canlı açılış |

### PM

Açık PM kararı yok.

## Pilot öncesi kapılar

- [ ] **PILOT-LEGAL** Hukuki metinler `docs/legal-drafts.md`'de yedi taslak bölümdür (§1-§7: aydınlatma, yurt dışı aktarım rızası, kullanım
  şartları, staj arayan görünürlüğü, Yılın Mezunu doğrulaması, Ayın mezunu rızası, Faz 2 ekleri); hepsi `taslak-1` ve "hoca / hukuk onayı
  bekliyor". Veri sorumlusu, sağlayıcı adı ve hukuk görüşü alanları köşeli parantezle boştur (K-03, K-04, K-05); kod aynı sürümü kullanır
  (`src/contracts/privacy.ts`) ve ekranda metin taslak diye işaretlidir. Biter: alanlar dolar, hoca onaylar, üniversite KVKK birimi ya da bir
  hukukçu okur, onaylı sürüm köke taşınır ve sürüm numarası artar (kullanıcılar yeniden onay verir). Önkoşul K-03.
- [ ] **PILOT-TEST** Test planı iki belgededir: `docs/engineering.md` "Faz 2 deneme rehberi" ve telefon listesi (70 kutu, Git dışı); `docs/faz1-plan.md`'ya
  ayrı bölüm yazılmadı. R2 provası geçti (60 geçti, 0 kaldı, 10 gerçek cihaz bekliyor, bkz. "Yakın hedef"). Biter: kullanıcı turu bir kez koşar,
  bulgular kapanır ya da borç yazılır. Canlıda ayrıca P1-18 kabul adımları koşulur (PILOT-DEPLOY).
- [ ] **PILOT-DEPLOY** Kod tarafı hazır: çok aşamalı `Dockerfile` (web ve worker aynı imajdan), açılışta `migrate deploy` (seed yok),
  `/api/health` (durum, ortam, commit, DB), `scripts/backup.sh` ve `scripts/restore.sh`, toplu davet, prod'da test girişi ve `/ui-ornekleri` 404, yerel imaj
  provası `docker-compose.image.yml`; rehber `docs/engineering.md` "Canlıya alım". Kalan: sunucu (K-02), canlı SMTP (K-05), gerçek yönetici ve
  kurum verisi (K-03), TD-021 (güvenilir proxy; kapanmadan canlıya alınmaz), başarı ölçütleri kutusu (K-12; `/yonetim/kullanim` ekranı var, kutu
  kodda yok). Canlı kabul: `/api/health` `env: "prod"` ve `sha` dağıtılan commit, yedek geri yüklenip doğrulanır, davet edilen gerçek kullanıcı
  (kullanıcının kendisi) uçtan uca kayıt olur, seed verisi girmemiş. Bu adımdan sonra veri değiştiren migration ve dağıtım PR başına kullanıcı onayı ister.
- [ ] **PILOT-ROZET** Kod hazır: `FOUNDING_MEMBER_UNTIL` boşken kurucu üye etiketi sürer (`.env.example`, `src/lib/env.ts`, `src/server/services/points.ts`; K-10).
  Biter: pilot bitince canlı ortamda tarih doldurulur (pilot tarihi K-12 ile belli olur).

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
  bütünlüğünü gösterir, LLM doğruluğunu değil. Gerçek adaptör yok (K-04: Gemini ücretsiz katman anahtarı bekleniyor).
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

- [ ] **TD-024** · P2 · `profile-content.db.test` yük altında bir kez 15 sn zaman aşımına düştü
  Ne: dosya normalde 3–5 sn, bir kapıda 50 sn; yeniden koşuda 3,1 sn yeşil (yük ya da veritabanı beklemesi).
  Neden borç: izleniyor, kök neden bilinmiyor.
  Kapanış ölçütü: bir daha düşerse kök neden kartı açılır; düşmeden bir faz geçerse silinir.
- [ ] **TD-027** · P2 · pg "Calling client.query() when the client is already executing a query" uyarısı (pg@9'da hataya döner)
  Ne: Prisma 7.10.1 + `@prisma/adapter-pg` 7.10.1 + pg 8.23.1 ile `src/server/permissions/actor.ts:17` içindeki çok ilişkili actor okuması ve bazı eşzamanlı sorgular tek istemciye üst üste sorgu gönderiyor. `scripts/td027-probe.ts` kayıtlı yeniden üretimdir; komut ve seçenekler `docs/decisions.md`'de.
  Neden borç: uyarı pg@9'da hataya dönüşebilir; ilişkileri sırayla okumak bir yolu düzeltir ama uygulamadaki tüm kaynakları kapatmaz. Yukarı akış kaydı: https://github.com/prisma/orm/issues/29407.
  Kapanış ölçütü: gerçek düzeltmeyle kayıtlı yeniden üretim ve uygulamanın dev/e2e sunucuları uyarısız çalışır; e2e `--no-deprecation` istisnası kaldırılır, ilgili sonuç eşitliği ve kapılar geçer.

### Bilinçli kabul edilen sınırlar

- Canlı ortam yok; dağıtım ve yedek P1-18'e kadar sınanmaz.
- e-Devlet mezun belgesi elle doğrulanır (otomatik doğrulama için açık API yok).
- Bölüm bilgisi beyandır; e-posta alan adı yalnız üniversiteyi doğrular.

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
