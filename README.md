# MezunPortal

İstanbul Üniversitesi öğrencilerinin staj ve kariyer yolculuğunu, o yoldan geçmiş mezunların,
üst sınıfların ve akademisyenlerin deneyimiyle yapılandıran kapalı ve doğrulanmış platform.
Bitirme projesidir; pilot bölüm Yönetim Bilişim Sistemleri. Mobil uyumlu web uygulaması.
Çalışma adı “MezunPortal”dır; ad kararı `docs/decisions.md`'dedir (K-01: repo adı `mezunportal`).

Bu belge ürünün amacını ve dayanıklı iş kurallarını tanımlar (ürün çerçevesi). Güncel durum ve
açık işler `BACKLOG.md`'de, iş sırası faz planlarında (`docs/fazN-plan.md`), ajan kuralları
`AGENTS.md`'dedir. Son güncelleme: **2026-11-07**.

## 1. Problem ve amaç

İÜ'de mezun portalı yoktur. Bir öğrencinin staja nasıl girileceğini, hangi şirketin zorunlu
olmayan stajı nasıl yürüttüğünü, mülakatta ne sorulduğunu öğrenmesinin düzenli bir yolu yoktur;
bu bilgi tek tek kişilerde dağınık durur. Mezun portalları genelde öğrenci ilgisi görmediği için
söner. MezunPortal bu yüzden **staj odaklı** kurulur: öğrencinin gelmek için gerçek bir sebebi
(başka yerde olmayan yapılandırılmış staj bilgisi ve ulaşılabilir mentorlar), mezunun katkı
vermek için bir karşılığı (tanınma, kapasiteyi kendi belirlemesi) olur.

**LinkedIn grubundan farkı** (her ürün kararı buna hizmet eder):

- **Bulunabilirlik:** kişiler ve deneyimler şirket, sektör, unvan, deneyim türü, başvuru kanalı
  gibi alanlarla aranır. LinkedIn grubunda üyeler yalnız isimle aranır, paylaşımlar akışta
  kaybolur.
- **Kontrollü iletişim:** iletişim bilgisi talep–onay ile açılır; mentorluk kapasiteli ve slot
  bazlıdır, mezunu yormaz.
- **Kurumsal doğrulama ve veri sahipliği:** üyelik okul e-postası ya da mezun belgesiyle
  doğrulanır. Veri bölümündür; mezun takibi ve raporlar bu veriden çıkar.

## 2. Kullanıcılar

- **Öğrenci:** okul e-postasıyla doğrulanır; deneyim okur ve yazar, mentor bulur, randevu, CV
  incelemesi ve SSS talebi gönderir.
- **Mezun:** e-Devlet mezun belgesiyle doğrulanır; deneyim paylaşır, isterse mentor olur.
- **Akademisyen:** kurumsal e-postayla doğrulanır; özellikle akademik kariyer ve yüksek lisans
  için mentor olabilir.
- **Üst sınıf öğrenci:** eşiği geçerse (K-08) mentor olabilir; yeni bölümde en deneyimli
  kişiler onlardır.
- **Yöneticiler:** bölüm, fakülte ve sistem kapsamında moderasyon, doğrulama ve rapor yürütür.
  Kişisel veriye yalnız görev ekranında ve maskeli erişir.

## 3. Ürün ilkeleri

1. **Mezunu yorma.** Mentor kapasitesini ve süresini kendisi belirler, istediği an “müsait
   değilim” der. Tekrarlanan sorular SSS'ye dönüşür.
2. **İletişim kontrollüdür.** Telefon ve e-posta varsayılan olarak gizlidir; talep ve onayla
   açılır, geri alınabilir. Randevu onayında e-posta adresinin paylaşılacağı önceden söylenir.
3. **Doğrulanmamış kişi içeri giremez.** Doğrulanana kadar yalnız kendi profilini düzenler.
4. **Yapılandırılmış veri akıştan iyidir.** Deneyimler serbest metin değil, yönlendirici
   şablonla yazılır; aranabilir ve raporlanabilir olması bundandır.
5. **Mobil önceliklidir.** Kullanım çoğunlukla telefondan olur; her ekran 360 px'te tasarlanır.
6. **Puan katkıyı ödüllendirir, hileyi değil.** Puan yalnız doğrulanmış olaydan doğar; büyük
   ödüller elle verilir.
7. **Kişisel veri en az düzeyde tutulur.** Belge karar anında, eski CV yeni CV uygulanınca
   silinir; metriklerde kişisel veri yoktur.
8. **Yapay zekâ yardımcıdır, karar verici değildir.** CV ayrıştırma önerir, kullanıcı onaylar;
   yapay zekâ çıktısı yetki ya da rol belirlemez.

## 4. Kapsam

### Faz 1 (bitirme kapsamı) — `docs/faz1-plan.md`

**Çekirdek:** kurum/üyelik/yetki · kimlik doğrulama (e-posta bağlantısı, LinkedIn ile giriş,
mezun belgesi) · KVKK ve kontrollü iletişim · ilk giriş akışı ve profil tamamlama · yapay zekâ
ile CV ayrıştırma · profil ekranları · deneyimler ve moderasyon · arama · mentor dizini ve benzer
yol önerisi · randevu ve Google Meet · yönetim paneli · bildirimler ve hatırlatmalar · kullanım
metrikleri.

**Tamamlayıcılar:** görüşme sonrası form ve güvenilirlik göstergesi · CV inceleme talebi · puan
motoru ve hile önleme · SSS akışı · canlıya alım ve pilot hazırlığı.

### Faz 2 (tamamlandı) — `docs/faz2-plan.md`

Yılın Mezunu ve LinkedIn rozeti · ayın mezunu · referans akışı · mezun staj ilanları ve ilan
eşleştirme · ters yönlü arama · beceri açığı analizi · seçmeli ders rehberi · şirket sayfaları
(puansız) · mülakat soru bankası · staj başvuru takvimi · etkinlik modülü · aylık özet e-postası. Kapanış notu ve plan↔yapılan tablosu planın §12'sindedir; kullanıcı deneme turu `docs/engineering.md` “Faz 2 deneme rehberi”.

### Faz 3 (fikir)

Kariyer yolu haritası · doğal dille arama · diğer fakültelere ve üniversitelere açılma (mimari
baştan üniversite → fakülte → bölüm yapısındadır).

### Kapsam dışı (kararlaştırıldı)

Canlı sohbet · chatbot · ayrı mobil uygulama · konaklama · dönemlik mentorluk programı · şirket
puanlama · LinkedIn kazıma.

## 5. Başarı

Pilotun başarı ölçütleri hocayla birlikte belirlenir (K-12). Varsayılan çerçeve: hedef kitlenin
(YBS mezunları ve staj yapmış öğrenciler) büyük çoğunluğunun aktif katılımı, gerçekleşen görüşme
ve yayınlanan deneyim sayısı, randevu taleplerine yanıt süresi. Küçük ama gerçek kullanım,
büyük hedeften daha değerlidir.

## 6. Yerel geliştirme

Gereksinimler: Node.js 22+, pnpm, Docker. Canlı ortam yoktur; her şey yerelde çalışır. Ayrıntı
`docs/engineering.md` “Yerel ortam”.

```bash
pnpm install --frozen-lockfile
docker compose up -d             # PostgreSQL + Mailpit
sh scripts/worktree-env.sh       # bu çalışma kopyasına ayrı veritabanı + port + .env.local
pnpm db:reset && pnpm db:seed    # şema + sahte örnek veri
pnpm dev:all                     # web + iş kuyruğu worker'ı
```

Mailpit (bütün e-postalar buraya düşer): `http://localhost:8025` · Telefondan test (aynı Wi-Fi):
`pnpm dev:lan`.

## 7. Belgeler

`AGENTS.md` (kurallar) · `BACKLOG.md` (durum, kararlar, borç) · `docs/faz0-plan.md`,
`docs/faz1-plan.md` (plan) · `docs/architecture.md` (mimari, akışlar, dış servisler) ·
`docs/data.md` (veri modeli) · `docs/security.md` (yetki, KVKK) · `docs/engineering.md` (stack,
yerel ortam, test, Git/PR) · `docs/design.md` (tasarım, terimler) · `docs/decisions.md` (karar
gerekçeleri) · `docs/legal-drafts.md` (hukuki taslaklar).
