# Tasarım sistemi

Son güncelleme: **2026-11-07** (kod öncesi). Kanonik token kaynağı `src/app/globals.css`'tir; bu
belge görsel niyeti ve kullanım kurallarını açıklar, CSS değerini ikinci kez yönetmez.

## Yön

Güven veren, sakin, akademik ama resmî olmayan bir ürün. Açık yüzey, koyu nötr metin, tek marka
rengi ve yalnız anlam taşıyan başarı/uyarı/hata renkleri. Kullanıcı çoğunlukla telefondan,
kısa aralıklarla girer: hızlı tarama, az metin, net tek eylem.

- Tek marka rengi `--primary`; rastgele ikinci vurgu, neon, gereksiz gradyan yok.
- Panel ve formlar yoğun olabilir; giriş/tanıtım sayfası biraz daha anlatısal olabilir, ama aynı
  token ve bileşenleri kullanır.
- Gölge işlevseldir, hiyerarşinin yerine geçmez. Radius ölçeği kart/input/buton arasında tutarlı.
- Gerçek durumlar zorunludur: yükleniyor, boş, hata, devre dışı (sebebiyle), odak, yıkıcı onay.

## Mobil öncelik

- Tasarım 360 px'ten başlar; asgari kontrol genişlikleri 360/390, 768 ve 1440.
- Mobilde üst başlık + **alt gezinme** (4–5 sekme); ≥ 1024 px'te yan menü.
- Filtre ve ikincil işlemler mobilde **alt sayfa (sheet)**, masaüstünde yan panel/modal.
- Tablolar mobilde kayıpsız **kart listesine** döner; eylem veya sütun sessizce kaybolmaz.
- Dokunma hedefi ≥ 44 px; form alanlarında doğru `inputmode` ve `autocomplete`; klavye açıkken
  gönder düğmesi görünür kalır.
- Yatay kaydırma yok. Uzun metin “devamını göster” ile kısalır.
- Web app manifest ve ikon: kullanıcı “ana ekrana ekle” ile uygulama gibi açabilir.

## Bileşen kuralları

- Yalnız `src/components/ui` kullanılır; tek ekran için yeni Button, Modal, Select sistemi yazılmaz.
  Eksik bileşen `ORTAK DOSYA İSTEĞİ` ile istenir.
- Sayfa başına bir belirgin birincil eylem. Yıkıcı eylem kırmızıdır, onay ister ve sonucunu
  açıklar.
- Form etiketi placeholder'a bırakılmaz; hata alanın altında ve alanla ilişkili.
- Uzun açıklama paragrafı yerine **“i” düğmesi** ve açılır bölüm.
- Devre dışı düğme sebebini yazar (“Bu ay kapasite doldu”).
- Durum rozetleri renk + metinle (renk tek sinyal değildir).
- **Basınca görünüm** (kullanıcı kararı, Sarraf'tan): kart ve düğme basınca yalnız hafifçe
  küçülür; liste satırı zemin rengi almaz, yazı hafif solar ve satır hafifçe büyür.
- Hareket bilgi taşımıyorsa azaltılır; `prefers-reduced-motion` korunur.

## Metin

Bütün metinler `messages/tr.json`'dadır; terimler aşağıdaki “Terimler” bölümüne uyar. Düğmeler emir
kipi. Kısa cümle, sen dili (“Profilini tamamla”), resmî kurum dili yok.

## Erişilebilirlik kapısı

- Normal metin WCAG AA 4.5:1; büyük metin ve arayüz sınırı 3:1.
- Görünür odak, mantıklı sekme sırası, modal odak tuzağı ve dönüşü, klavyeyle tamamlanabilir akış.
- Görsellerde alternatif metin; ikon düğmelerde erişilebilir ad.
- Async sonuç ve form hatası uygun canlı bölgeyle duyurulur.

## Tasarım görevi akışı

1. Var olan ekran ve bileşenleri incele.
2. `globals.css` ve bu belgedeki sınırlarla çöz.
3. 390, 768, 1440; klavye; uzun metin turu.
4. Yeni kalıcı desen doğduysa bileşen ve bu belge birlikte güncellenir.

## Terimler

Kullanıcıya görünen her metin (arayüz ve e-posta) aynı kavramı aynı kelimeyle söyler. Metinlerin
kendisi `messages/tr.json`'dadır; burada yalnız kelime seçimi tutulur. Kodda karşılıkları
İngilizcedir.

### Kişiler ve roller

| Terim | Anlamı | Kodda |
|---|---|---|
| Öğrenci | Doğrulanmış öğrenci üyeliği | `STUDENT` |
| Mezun | Belgesi onaylanmış mezun | `ALUMNI` |
| Akademisyen | Kurumsal e-postayla doğrulanmış öğretim elemanı | `ACADEMIC` |
| Mentor | Görüşme veren, CV inceleyen, SSS cevaplayan kişi (mezun, akademisyen ya da eşiği geçen üst sınıf) | `MentorProfile` |
| Üst sınıf | 3. sınıf ve üstü öğrenci (K-08) | — |
| Bölüm/Fakülte/Sistem yöneticisi | Kapsamlı yönetici yetkileri | `AdminGrant` |
| Kurucu üye | Pilot döneminde katkı verenlerin platform içi etiketi | `FOUNDING_MEMBER` |

### İçerik ve etkileşim

| Terim | Anlamı | Kullanma |
|---|---|---|
| Deneyim | Staj, Erasmus, yarışma vb. hakkında yapılandırılmış paylaşım | “gönderi”, “yorum” |
| Randevu | Talep edilmiş ya da onaylanmış görüşme planı | “toplantı” |
| Görüşme | Gerçekleşmiş randevu | “seans” |
| Müsait değilim | Mentorun geçici olarak talep almaması | “tatil modu” |
| SSS | Yayınlanmış soru-cevap | “forum” |
| SSS talebi | Öğrencinin SSS'ye önerdiği soru | — |
| CV incelemesi | Mentorun CV'ye yazılı yorumu | “CV değerlendirmesi” |
| İletişim talebi | E-posta/telefon gibi bilgilerin açılması için istek | “bağlantı isteği” |
| Katkı puanı | Katkılardan gelen puan | “skor”, “XP” |
| Güvenilirlik | Öğrencinin randevuya katılım göstergesi | “puan” |
| Moderasyon | Yayın öncesi yönetici incelemesi | “onay süreci” |
| Görünürlük | Bir alanı kimin görebildiği | “gizlilik seviyesi” |

### Durum adları

| Kodda | Ekranda |
|---|---|
| `DRAFT` / `IN_MODERATION` / `PUBLISHED` / `REJECTED` | Taslak / İncelemede / Yayında / Reddedildi |
| `REQUESTED` / `CONFIRMED` / `DECLINED` / `CANCELLED` / `EXPIRED` | Bekliyor / Onaylandı / Reddedildi / İptal edildi / Süresi doldu |
| `COMPLETED` / `NO_SHOW` | Gerçekleşti / Katılım olmadı |
| `PENDING` / `VERIFIED` (doğrulama) | Doğrulama bekliyor / Doğrulandı |

### Düğme ve eylem metinleri

Emir kipi, kısa: “Kaydet”, “Gönder”, “Randevu al”, “Onayla”, “Reddet”, “Yayımla”, “İptal et”,
“CV yükle”, “İletişim iste”, “Geri al”. Mastar (“Kaydetmek”) ve “Tamam” gibi belirsiz metin yok;
yıkıcı eylem ne olacağını söyler (“Hesabımı sil”).

### Ses

Sen dili, kısa cümle, sıcak ama ciddi. Resmî kurum dili (“işleminiz gerçekleştirilmiştir”) yok:
“Randevun onaylandı.”
