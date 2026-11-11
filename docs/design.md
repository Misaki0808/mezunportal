# Tasarım sistemi

Son güncelleme: **2026-11-07** (kod öncesi). Kanonik token kaynağı `src/app/globals.css`'tir; bu
belge görsel niyeti ve kullanım kurallarını açıklar, CSS değerini ikinci kez yönetmez.

## Yön

Sıcak, samimi, insancıl; akademik ve resmî olmayan bir ürün. Açık temada **krem** zemin, koyu temada **lacivert** zemin (kullanıcı onaylı, 10 Kasım: #0E1A38),
koyu metin, **İris** ana renk, **Mercan-pembe** vurgu, **Nane** destek; uyarı/hata renkleri yalnız anlam taşır. Köşeler yumuşak
(`--radius-*`), metin “sen” diliyle kısa ve içtendir. Kullanıcı çoğunlukla telefondan,
kısa aralıklarla girer: hızlı tarama, az metin, net tek eylem.

- Marka paleti **İris + Mercan** (kullanıcı kararı; İstanbul Üniversitesi renkleri kullanılmaz, `docs/decisions.md`).
- **AI izi yok** (kullanıcı kararı, 9 Kas): yıldız/ışıltı/✳ gibi süs simgesi, stok ya da yapay zekâ görseli kullanılmaz; yalnız anlam taşıyan sade
  simge kalır. Mercan, Claude turuncusundan (≈#D97757) uzak, pembeye yakın tutulur. `no-ai-traces.test.ts` bekçisidir.
- **Logo** `mezunportal.` (kullanıcı kararı, 3. tur): küçük harf, kep “o” harfinde (yatık), “mezun” koyu → “portal” İris (n–p yapışık, renk
  geçişi), nokta yuvarlak ve Mercan. Çizim dış hatlıdır (`BrandLogo`, `public/brand/*.svg`); küçük yerlerde (favicon, uygulama simgesi) ayrı
  sadeleştirilmiş simge, yalnız kepli “o” (`BrandMark`). Renkler `--brand-*` token'larıdır.
  Ana eylem, bağlantı, odak ve seçili durum İris (`primary`). Mercan (`accent`) **az** kullanılır: öne çıkan rozet/sayı,
  ikincil müjde; sayfada birincil eylem rengi olamaz. Nane = başarı/“müsait” (`success`).
- **Gradyan ve parlama yok:** arayüzde renk geçişi, bulanık ışıma (`blur`) ve nabız animasyonlu süs daireleri kullanılmaz
  ("AI izi", kullanıcı kararı). Tek renk geçişi logodaki n–p harfleridir. Çerçeve ve doluluk çubuğu düz İris'tir.
- **Mercan kuralı:** mercan zeminde metin koyudur (`on-accent`); beyaz metin AA değildir. Mercanı metin/ikon olarak
  beyaz üstünde kullanma — `accent-strong` (AA) kullan.
- **Koyu tema** `prefers-color-scheme` ile gelir; aynı token adları yeniden tanımlanır (`globals.css`), bileşende
  sabit renk yazılmaz (`text-white`, `#hex` yok; yalnız token). Koyu temada ana renk açılır, üstündeki metin koyudur.
- **Yazı tipi:** başlıklar (h1–h3) Plus Jakarta Sans, metin Inter; `next/font/google` ile derlemede indirilip kendinden
  barındırılır, `latin-ext` alt kümesi Türkçe harfler içindir (CSP `font-src 'self'` ile uyumlu).
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

### Ortak başlık ve renk dağılımı

- **Sayfa başlığı:** her sayfa `PageHeader` kullanır (üst etiket İris, `h1` Plus Jakarta Sans, açıklama ikincil metin; `h1` sınıfı sayfada yazılmaz).
- **Renk dağılımı:** İris ana eylem ve bağlantı; **Mercan** yalnız küçük vurgularda (`IconChip tone="accent"`, `Badge tone="accent"`); **Nane** başarı/veri/rapor
  çipleri. Kısayol ve yönetim kartlarında simge çipleri (`IconChip`) sırayla İris, Mercan, Nane kullanır; çip dekoratiftir, anlamı metin taşır.
- **Tanıtım sayfası** (`landing.css`) sabit `#hex` metin rengi kullanmaz; belirteç kullanır (kontrast testi).

### Kontrast tablosu (WCAG AA)

Kanonik koruma `src/lib/contrast.test.ts` (her çift her iki temada; normal metin ≥ 4.5, sınır ≥ 3). Seçilmiş çiftler:

| Çift | Kullanım | Açık | Koyu |
|---|---|---|---|
| `fg` / `bg` | Metin | 16.1 | 14.1 |
| `fg-muted` / `surface` | İkincil metin | 6.4 | 7.7 |
| `fg-subtle` / `surface-strong` | Soluk metin | 4.9 | 4.8 |
| `primary` / `bg` | Bağlantı / İris metin | 4.7 | 6.8 |
| `on-primary` / `primary` | Birincil düğme | 4.9 | 6.8 |
| `on-primary-soft` / `primary-soft` | Soft rozet | 10.1 | 7.4 |
| `on-accent` / `accent` | Mercan zemin | 6.6 | 7.8 |
| `accent-strong` / `bg` | Mercan metin | 6.3 | 6.8 |
| `on-accent-soft` / `accent-soft` | Mercan soft | 7.8 | 8.2 |
| `on-success-soft` / `success-soft` | Başarı rozeti | 7.1 | 9.9 |
| `success` / `bg` | Nane sınır/simge (3:1) | 3.2 | 8.5 |
| `on-warning-soft` / `warning-soft` | Uyarı | 8.7 | 10.2 |
| `on-danger` / `danger` | Yıkıcı düğme | 6.5 | 7.6 |
| `on-danger-soft` / `danger-soft` | Hata | 9.2 | 9.2 |
| `border-control` / `bg` | Kontrol sınırı (3:1) | 4.1 | 5.0 |

Bilinen sınırlar: `primary` metni `primary-soft` üstünde AA değildir (4.3 açık, 4.6 koyu) → soft zeminde `on-primary-soft` kullan (ghost düğmenin
hover'ında `primary-hover`, 5.8); `contrast.test.ts` bekçisi aynı sınıf dizgesinde `primary-soft` zemin + çıplak `text-primary`'yi yasaklar;
Mercan (`accent`) beyaz zeminde 3:1'in altındadır → sınır/ikon için `accent-strong`; Nane metin için değil, simge/sınır içindir
(metin `on-success-soft`).

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

## Bileşen envanteri

`src/components/ui` (tek giriş: `@/components/ui`): Button/IconButton, Input/Textarea/Select/Checkbox/
RadioGroup/Switch, Field (etiket satırı + “i” yardım; girişin altında ipucu, ardından hata), Card, Badge, Tag, Avatar, Modal/Sheet,
Tabs, Toast, Skeleton, EmptyState/ErrorState, Pagination, Stepper. Canlı örnekleri `/ui-ornekleri`
galerisindedir (yalnız `local`/`test`). Düzen `src/components/layout/app-shell.tsx`.

- **Modal / Sheet:** Modal masaüstünde ortada pencere, Sheet masaüstünde sağ yan panel; ikisi de
  mobilde alt sayfadır. Filtre ve ikincil işlem için Sheet.
- **Basınca görünüm:** `press-control` (kart/düğme küçülür) ve `press-row` (liste satırı: zemin
  rengi yok, yazı solar, satır büyür) `globals.css` yardımcı sınıflarıdır.
- **Bağlantıyı düğme gibi göstermek:** `buttonClasses()` (örn. `next/link` ile).
- **Devre dışı düğme** `disabledReason` olmadan derlenmez; **hata** `ErrorState`'te `errorCode`
  ile gösterilir, ham mesaj değil.

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
| İlan | Mezun ya da akademisyenin paylaştığı staj/iş duyurusu | “fırsat”, “iş fırsatı” |
| Çevrimiçi | Görüşme biçimi (karşısı: Yüz yüze) | “online”, “çevrim içi” |
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

Sen dili, kısa cümle, sıcak ama ciddi. Kalıp sözcük yok (“keşfet”, “kolayca”, “sorunsuz”, “tek tıkla”): yapılacak işi söyle (“Deneyimlere bak”). Emir kipine “lütfen” eklenmez. Kesme işareti düz ('). Resmî kurum dili (“işleminiz gerçekleştirilmiştir”) yok:
“Randevun onaylandı.”
