# Faz 1 planı — Çekirdek ve tamamlayıcılar (bitirme kapsamı)

Durum: **Faz 0'dan sonra** · Yazıldı: 2026-11-07

Bu belge Faz 1'in **tek hedefini** ve ona giden **on sekiz adımı** tanımlar. Rol önce bunu, sonra
`AGENTS.md`'yi ve kartındaki kaynakları okur. Adımlar sırayla başlar; bağımlılığı karşılanan
adımlar paralel yürüyebilir. **Çekirdek (P1-01…P1-13) tamamlayıcılardan (P1-14…P1-18) önce
gelir.**

**Bölünme:** “Sözleşme → Servis ∥ Ekran” yazan adımda PM üç kart yazar: önce şema +
`src/contracts` sözleşme PR'ı (varsayılan W1), birleşince servis (W1) ve ekran (W2) aynı anda.
Kabul satırının tamamı kartlara dağılır; hiçbir kabul düşmez.

**Her adımın gizli kabul satırları:** kalite kapıları yeşil; ekranlı adımda “ekranda nasıl
denenir” satırları (görsel kontrol PM'in tarayıcı turunda; plan adımını ekran doğrulaması
kapatır); kural değişikliğinde mutasyon; yetkili eylemde negatif
test; çekirdek adımda bir Playwright akış testi; seed yeni modellerle büyür.

## 1. Hedef

Bir İÜ YBS öğrencisinin doğrulanıp profilini CV'siyle doldurabildiği, staj deneyimlerini arayıp
okuyabildiği, mentor bulup Meet linkli randevu alabildiği; mezunun deneyim paylaşıp kapasitesini
kendi belirleyerek mentorluk yaptığı; bölüm yöneticisinin doğrulama, moderasyon ve raporu
yürüttüğü; katkıların hileye dayanıklı biçimde puanlandığı ve pilota hazır, canlıya alınmış bir
platform.

## 2. Verilmiş kararlar (tekrar sorma)

| # | Karar | Değer |
|---|---|---|
| D1 | Giriş | E-posta bağlantısı (parolasız) + LinkedIn ile giriş (ad, e-posta, fotoğraf); iş geçmişi LinkedIn'den alınmaz |
| D2 | Doğrulama | Öğrenci/akademisyen alan adıyla; mezun e-Devlet belgesiyle, bölüm yöneticisi elle; belge karar anında silinir |
| D3 | Roller | `STUDENT`, `ALUMNI`, `ACADEMIC`; mentorluk = etkin `MentorProfile`; yönetici kapsamlı (`SYSTEM`/`FACULTY`/`DEPARTMENT`); çoklu rol; rol geçişinde geçmiş korunur |
| D4 | Sınıf | Saklanmaz; giriş yılı + düzeltme değerinden hesaplanır |
| D5 | Askıya alma | Better Auth admin eklentisinin ban'ı (oturumlar düşer); impersonation kapalı |
| D6 | İşlem kaydı | Bütün yönetici eylemleri `AdminAuditLog`'a |
| D7 | İletişim | Telefon/e-posta varsayılan gizli; talep–onay ile açılır; randevu onayında e-posta paylaşılır |
| D8 | CV | Yalnız PDF; doğrudan LLM; kullanıcı onaylamadan uygulanmaz; LLM çıktısı yetki belirlemez; kullanıcı başına günlük sınır; uygulama içi bütçe sayacı yok |
| D9 | Deneyim | Tür bazlı yönlendirici şablon; anonim seçeneği; yayın yalnız moderasyonla |
| D10 | Mentorluk | Kapasite ve süre mentorda; slot bazlı; online ya da yüz yüze; Meet linki platform hesabıyla; dönemlik mentorluk yok |
| D11 | Randevu zaman aşımı | 72 saat ya da başlangıçtan 12 saat önce, erken olan |
| D12 | SSS | Talep → mentor cevapları → moderatör en iyi cevabı seçip yayımlar / reddeder / mentorluğa yönlendirir |
| D13 | Puan | `docs/architecture.md` tablosu; iki taraf onayı; ikiliye ayda bir; azalan çarpan; gecikme yalnız yüksek puanlıda; geriye dönük hesaplama |
| D14 | Ödül | Kurucu üye etiketi platform içi; LinkedIn rozeti yalnız Yılın Mezunu (Faz 2) |
| D15 | Onay kapısı | Canlıya alıma kadar H3'te PR başına kullanıcı onayı yok; ücret/hesap gerektiren her şey kullanıcıya; ürün/UX kararını PM verir |
| D16 | Telefon testi | Faz içinde yok; faz sonunda kullanıcı, aynı Wi-Fi üzerinden |
| D17 | Kapsam dışı | Canlı sohbet, chatbot, ayrı mobil uygulama, konaklama, dönemlik mentorluk, şirket puanlama, LinkedIn kazıma |

## 3. Adımlar — Çekirdek

### P1-01 · Kurum, üyelik, yetki ve işlem kaydı · W1 · H3
**İş:** `Membership`, `AdminGrant`, `MentorProfile`, `AdminAuditLog` (`docs/data.md`);
`src/server/permissions` (`requireUser`, `requireVerifiedMember`, `requireMentor`,
`requireAdmin(scope)`, `canModerate(departmentId)` …); kapsam çözümleme (bölüm → fakülte →
üniversite); çoklu rol; rol geçişi servisi; `recordAdminAction` yardımcısı; sınıf hesaplama kuralı
(D4); seed'e rol başına test kullanıcıları.
**Testler:** `docs/security.md` matrisi tablo-güdümlü; negatifler (başka bölümün yöneticisi,
doğrulanmamış mezun, askıdaki/silinmiş kullanıcı); rol geçişinden sonra içerik ve puan
kullanıcıda; sınıf hesabı (hazırlık, uzatma).
**Kabul:** yalnız servis; ekran payı yok. Matris testleri yeşil, mutasyon kanıtlı.
**Bağımlılık:** Faz 0.

### P1-02 · Kimlik doğrulama ve doğrulama akışları · Sözleşme → Servis (W1) ∥ Ekran (W2) · H3
**Servis:** Better Auth (Prisma adaptörü, magic link, LinkedIn, admin eklentisi — impersonation
kapalı); hesap bağlama; e-posta değiştirme; alan adı kuralları (D2, K-06); e-posta adaptörü +
`email.send` giden kutusu (pg-boss ilk kez burada kurulur); mezun belgesi yükleme (PDF ≤ 5 MB) →
bölüm yöneticisi kuyruğu → onay/ret (dosya karar anında silinir, işlem kaydı yazılır);
doğrulanmamış kullanıcının sınırları; test girişi (yalnız `local`/`test`); giriş hız sınırı;
kayıtlı/kayıtsız e-postaya aynı yanıt.
**Ekran:** giriş (iki yöntem), “e-postanı kontrol et”, mezun belgesi yükleme ve durum, doğrulama
bekliyor, e-posta değiştirme, çıkış; yönetimde mezun belgesi onay kuyruğu (görüntüle, onayla,
gerekçeyle reddet).
**Testler:** üç kullanıcı türü uçtan uca (bağlantı Mailpit'ten); `APP_ENV=prod`'da test girişi
yok (test + mutasyon); doğrulanmamış kullanıcının dizine erişimi sunucuda reddedilir; kayıtsız
e-postada yanıt kayıtlıyla aynı; onay/ret sonrası belge depoda yok; Playwright: öğrenci girişi.
**Kabul:** yukarıdakiler + LinkedIn girişi çalışır (E: LinkedIn uygulaması + doğrulanmış şirket
sayfası).
**Bağımlılık:** P1-01; K-06.

### P1-03 · KVKK ve kontrollü iletişim · Sözleşme → Servis (W1) ∥ Ekran (W2) · H3
**Servis:** `Consent` (sürümlü: aydınlatma, kullanım şartları, yurt dışına aktarım); kayıtta
zorunlu onaylar, sürüm değişince yeniden onay; `FieldVisibility` + `rules/visibility`;
`ContactRequest` (talep → onay/ret → görünür → geri alma; hız sınırı); hesap silme (K-09); JSON
veri dökümü; log maskeleme yardımcıları.
**Ekran:** onay adımları; hukuki metin sayfaları (`docs/legal-drafts.md` taslaklarından); gizlilik
ayarları (alan başına seviye); iletişim talebi gönder / gelen talepler; hesabı sil (sonuçları
açıklayan onay); verilerimi indir.
**Testler:** gizli alan hiçbir sunucu yanıtında yok (yanıt JSON'unda e-posta/telefon arayan
sızıntı testi); talep onayında alan görünür, geri alınca kaybolur; silinen hesapla giriş yok,
kişisel alanlar boş, dosyalar yok; yeni rıza sürümünde yeniden onaya yönlenme; Playwright:
iletişim talebi.
**Kabul:** yukarıdakiler.
**⏸ Onay noktası:** K-03 (veri sorumlusu, hocaya). **📝 PM kararı:** K-09 (silmede yayınlanmış deneyimler).
**Bağımlılık:** P1-02.

### P1-04 · İlk giriş akışı ve profil tamamlama · Sözleşme + `rules/profileCompletion` (W1) → Ekran (W2) · H2
**İş:** adım adım akış: rol ve bölüm beyanı (giriş yılı ya da mezuniyet yılı), ilgi alanları ve
hedefler (sabit etiket listesi, seed), mentor olma isteği (eşik K-08), görünürlük tercihleri, CV
yükleme daveti (P1-06'ya kadar gizli); profil tamamlama yüzdesi + eksik adımlar.
**Testler:** yüzde kuralı birim testli; eşiği geçmeyen öğrenciye mentorluk sunulmaz ve sunucu da
reddeder; yarıda bırakılan akış kaldığı adımdan sürer; Playwright: ilk giriş akışı.
**Kabul:** yeni kullanıcı akışı 390'da bitirir.
**📝 PM kararı:** K-08.
**Bağımlılık:** P1-03.

### P1-05 · CV ayrıştırma hattı · W1 · H3 (dış servis, bağımlılık)
**İş:** `docs/architecture.md` “CV ayrıştırma hattı” ve “Dış servisler” §2: depolama adaptörü;
PDF doğrulama (boyut, sayfa, sihirli bayt); LLM adaptörü + sahtesi (K-04); `ParsedCv` Zod şeması;
`cv.parse` işi; sözlük eşleme + `UnmatchedValue`; `rules/cvDiff` (yeni/değişen/çakışan; elle
düzeltilen korunur); uygulama işlemi; staj → deneyim daveti; saklama kuralları (açık incelemeye
bağlı dosya hariç); kullanıcı başına günlük sınır; yurt dışı rızası ön koşulu; prompt injection
kuralları (`docs/security.md`).
**Testler:** elle düzeltilmiş alan yeni CV ile sessizce ezilmez; rıza yoksa ayrıştırma başlamaz;
günlük sınır aşılınca ret; LLM hata/zaman aşımında `FAILED` + anlaşılır kod; görünmez metinle
“yönetici yap” talimatı içeren sahte CV hiçbir yetki/rol/başka kullanıcı verisi üretmez;
uygulamadan sonra ayrıştırma çıktısı boş, bağlı olmayan eski dosyalar silinmiş.
**Kabul:** sahte kişilerden 5 örnek CV (biri LinkedIn PDF dışa aktarımı, biri taranmış) için alan
doğruluğu tablosu sonuç dosyasında. Ekran payı P1-06'da.
**⏸ Onay noktası:** K-04; E: LLM API anahtarı + sağlayıcıda aylık harcama sınırı.
**Bağımlılık:** P1-03.

### P1-06 · Profil ve CV onay ekranları · W2 (sözleşme P1-05'ten) · H2
**İş:** kendi profilim (eğitim, pozisyon, beceri, dil, sertifika, sosyal medya linkleri, LinkedIn
adresi; görüntüle/düzenle); başkasının profili (görünürlük süzgeçli); CV yükle → işleniyor →
onay ekranı (kalem kalem kabul/düzelt, çakışmalar ayrı); LinkedIn PDF yönergesi (“i”); son
güncelleme tarihi; tamamlama göstergesi.
**Testler:** sosyal linkler yalnız `https` ve izinli alan adları; CV hatasında elle düzenlemeye
yönlenme; Playwright: CV yükle → onayla.
**Kabul:** onay ekranı 390'da kalem kalem kullanılabilir; başkasının profilinde gizli alan yok
(sunucu yanıtı dahil).
**Bağımlılık:** P1-05.

### P1-07 · Deneyimler ve moderasyon · Sözleşme → Servis (W1) ∥ Ekran (W2) · H2
**İş:** `Experience` ve `Report`; tür bazlı şablon (`docs/data.md` alanları); taslak; anonim
seçeneği; moderasyona gönder → yayın/ret (gerekçe, işlem kaydı); CV davetinden ön doldurma;
şikâyet (hız sınırlı); deneyimlerim; deneyim detayı; moderasyon kuyruğu (bölüm yöneticisi).
**Testler:** anonim deneyimde yazar kimliği hiçbir yanıtta yok; yayın yalnız moderasyonla;
moderatör yalnız kendi kapsamını görür; görünürlük kapsamı K-07'ye uyar; Playwright: deneyim yaz →
moderasyon → yayın.
**Kabul:** tür değişince alanlar değişir; şikâyet kuyruğa düşer.
**📝 PM kararı:** K-07.
**Bağımlılık:** P1-04.

### P1-08 · Arama ve filtreleme · Servis (W1: üretilmiş sütun, indeks, `repositories/search`) ∥ Ekran (W2) · H2
**İş:** `docs/architecture.md` “Arama”: Türkçe tam metin + `pg_trgm`; metin + tür, şirket, sektör,
başvuru kanalı, dönem, ücret filtreleri; sonuç kartları; sayfalama; filtreler URL'de; boş sonuçta
yönlendirme.
**Testler:** “staj/stajı/STAJ”, “İstanbul/ISTANBUL/istanbul” ve küçük yazım hataları eşleşir;
1.000 sahte deneyimle tipik sorgu yerelde < 300 ms (ölçüm); Playwright: filtreli arama.
**Kabul:** mobilde filtre paneli alt sayfa; paylaşılan bağlantı aynı sonuçları açar.
**Bağımlılık:** P1-07.

### P1-09 · Mentor dizini ve benzer yol önerisi · Servis + `rules/similarity` (W1) ∥ Ekran (W2) · H2
**İş:** dizin filtreleri (mentor türü, sektör, şirket, unvan, deneyim türü, görüşme biçimi, yalnız
müsait olanlar); mentor kartı (başlık, şirket/unvan, konular, müsaitlik, kapasite doluluğu);
profilden randevu / CV incelemesi / iletişim talebi girişleri; “Sana benzer yol izleyenler”:
etiket ve sektör örtüşmesiyle en fazla 5 öneri, gerekçe etiketiyle.
**Testler:** filtre kombinasyonları; “müsait değilim” modundaki ve kapasitesi dolan mentor
“yalnız müsait olanlar”da çıkmaz; öneri kuralı birim testli; Playwright: mentor bul.
**Kabul:** öneri gerekçesi görünür.
**Bağımlılık:** P1-06, P1-08.

### P1-10 · Randevu motoru ve Google Meet · Sözleşme → Servis (W1) ∥ Ekran (W2) · H3 (dış servis)
**Servis:** `docs/architecture.md` “Randevu ve Google Meet” ve “Dış servisler” §3: kapasite,
süre, haftalık müsaitlik, müsait değilim; slot üretimi; talep → onay/ret; zaman aşımı (D11);
exclusion constraint; takvim adaptörü + sahtesi; onayda Meet linki ve davet; hata yolunda elle
link; yüz yüze yer notu; iptal ve etkinlik silme; hatırlatma (onay 24 saatten geç geldiyse onayla
birlikte); e-posta paylaşım bilgilendirmesi; talep hız sınırı.
**Ekran:** mentor ayarları (mobilde gün listesi olarak müsaitlik); randevu al (slot seçici, biçim,
not); randevularım (gelen/giden, durum rozetleri); randevu detayı (Meet linki, `.ics`).
**Testler:** eşzamanlı iki talepten biri reddedilir; kapasite dolunca onay engellenir ve düğme
sebebini yazar; başlangıca 12 saatten az kalan talep `EXPIRED` olur; takvim hatası taklidinde
randevu onaylı kalır ve mentor link ekleyebilir; Playwright: talep → onay.
**Kabul:** iki test kullanıcısıyla yerelde talep → onay → iki tarafa bildirim (Mailpit), gerçek
takvim daveti ve Meet linki; OAuth uygulamasının “In production” olduğu doğrulanmış.
**⏸ Onay noktası:** E: Google Cloud projesi, platform hesabı, yenileme jetonu.
**Bağımlılık:** P1-09.

### P1-11 · Yönetim paneli · Sözleşme (W1) → Ekran + servis (W2); askıya alma/rol payı W1 · H3
**İş:** kapsama göre panel (bölüm/fakülte/sistem); kullanıcılar (ara, rol düzelt, askıya al /
kaldır — gerekçeli, D5); şikâyet kuyruğu; sözlük yönetimi ve eşleşmeyen değerler (sistem);
yönetici atama (sistem); işlem kaydı görüntüleme (sistem); mezun istihdam raporu (sektör, unvan,
şirket dağılımı; toplu) ve Excel dışa aktarma.
**Testler:** yönetici yalnız kendi kapsamını görür; askıya alınanın oturumu düşer ve giriş
yapamaz; her yıkıcı eylem işlem kaydı yazar; Excel'de kart izin vermediği kişisel veri yok;
Playwright: askıya alma.
**Kabul:** telefon/e-posta maskeli; yıkıcı eylemde onay penceresi ve gerekçe; Excel Türkçe
karakterlerle açılır.
**Bağımlılık:** P1-07.

### P1-12 · Bildirimler ve hatırlatmalar · Servis/işler (W1) ∥ Şablonlar + tercih ekranı (W2) · H2
**İş:** bildirim türleri kataloğu; `NotificationPreference` ve tercih ekranı; e-posta şablonları
(randevu, moderasyon sonucu, mezun onayı, iletişim talebi, CV daveti); işler:
`profile.freshness` (6 ay), `alumni.stillThere` (yılda bir; imzalı, süreli, tek kullanımlık
evet/hayır bağlantısı), `student.emailMigration`, `files.purge`.
**Testler:** tercihten kapatılan bildirim gitmez; ikinci tıklama etkisiz; süresi geçmiş bağlantı
reddedilir; iş tekrarında çift e-posta yok.
**Kabul:** her şablon Mailpit'te görüntülenmiş.
**Bağımlılık:** P1-10.

### P1-13 · Kullanım metrikleri · Servis (W1: `Event`) ∥ Panel (W2) · H2
**İş:** `docs/architecture.md` “Kullanım metrikleri” olay türleri; olay yazımı; panel (rol ve bölüm
kırılımlı); Excel'e toplu aktarım.
**Testler:** `props` alanında kişisel veri yok; panel sayıları seed ile elle sayılanla aynı;
kapsam dışı bölüm görünmez.
**Kabul:** yukarıdakiler.
**Bağımlılık:** P1-11.

## 4. Adımlar — Tamamlayıcılar

### P1-14 · Görüşme sonrası form ve güvenilirlik · Servis + kural (W1) ∥ Ekran (W2) · H2
**İş:** bitişten 1 saat sonra iki tarafa form (gerçekleşti mi, faydalı mı, not); mentor “katılım
olmadı” işaretler; `COMPLETED` / `NO_SHOW`; öğrenci güvenilirlik göstergesi — öğrenci kendininkini
ve nedenini, mentor talep kartında görür.
**Testler:** iki taraf “gerçekleşti” demeden görüşme gerçekleşmiş sayılmaz; form iki kez
gönderilemez; gösterge kuralı birim testli.
**Kabul:** yukarıdakiler.
**Bağımlılık:** P1-12.

### P1-15 · CV inceleme talebi · Sözleşme (W1) → Servis + Ekran (W2) · H2
**İş:** öğrenci son CV'sini not ile bir mentora gönderir; mentor açık/kapalı ve aylık sınır
belirler; yazılı yorum; “faydalı” işareti; 14 günde yanıtlanmazsa `EXPIRED`.
**Testler:** talep kapanınca mentor CV dosyasına erişemez (403); açık talep sürerken öğrenci yeni CV
uygularsa talebe bağlı dosya silinmez, talep kapanınca silinir; sınır dolunca düğme sebebini yazar.
**Kabul:** yukarıdakiler.
**Bağımlılık:** P1-14.

### P1-16 · Puan motoru ve hile önleme · W1 (ekran payı W2'ye ayrı kart) · H3
**İş:** `docs/architecture.md` “Puan motoru”nun tamamı: `PointRule` (seed: başlangıç tablosu),
`PointEntry`, olaylardan puan yazımı (deneyim, görüşme, CV incelemesi; SSS P1-17'de bağlanır),
iki taraf şartı, ikili tavanı, azalan çarpan, gecikmeli puan + `points.finalize`, şüphe taraması +
`SuspicionFlag`, iptal ve geri alma (işlem kaydıyla), **geriye dönük hesaplama
(`points.backfill`)**, kurucu üye etiketi (K-10). Ekran: profilde katkı puanı ve geçmişi; sistem
yöneticisi için kural ve şüphe ekranı.
**Testler:** aynı ay ikinci görüşme 0; 180 gün içinde 0,5 / 0,25; gecikmeli puan süre dolmadan
`PENDING`; iptalde rozet geri alınır; aynı olay iki kez işlenince tek kayıt; backfill iki kez
çalışınca sonuç değişmez; şüphe kuralları sahte senaryolarla tetiklenir.
**Kabul:** yukarıdakiler.
**📝 PM kararı:** K-10, K-11.
**Bağımlılık:** P1-15.

### P1-17 · SSS akışı · Sözleşme (W1) → Servis + Ekran (W2) · H2
**İş:** `docs/architecture.md` “SSS akışı”: “SSS talebi gönder” (hız sınırlı); yazarken benzer SSS
önerisi; mentor cevapları; moderatör seçer ve düzenleyerek yayımlar / gerekçeyle reddeder /
mentorluğa yönlendirir; SSS sayfası ve araması; puan bağlantısı.
**Testler:** yayında isimler görünmez; puanlar yalnız yayında (seçilen 5, katılım 1, soran 2);
benzer SSS varken gönderimden önce gösterilir; Playwright: talep → yayın.
**Kabul:** yönlendirilen öğrenci mentor dizinine bağlantı görür.
**Bağımlılık:** P1-16.

### P1-18 · Canlıya alım ve pilot hazırlığı · W2 (altyapı) + W1 (veri) + kullanıcı · H3
**İş:** sunucu ve dağıtım aracı (K-02); çok aşamalı Dockerfile, başlangıçta `prisma migrate
deploy`, worker süreci, kalıcı dosya hacmi, `/api/health`'e derleme commit'i, sağlık kontrolü;
canlı ortam (ayrı veritabanı, sırlar, gerçek SMTP K-05); yedek ve geri yükleme denemesi;
`docs/engineering.md` “Canlıya alım” bölümü; gerçek kurum verisi ve yönetici atamaları (K-03);
hukuki metinlerin onaylı hali (PILOT-LEGAL); toplu davet (yönetici e-posta listesi yükler);
başarı ölçütleri kutusu (K-12); manuel test planı yazılır ve koşulur (PILOT-TEST).
**Testler:** canlıda test girişi ve `/ui-ornekleri` 404; yedek geri yüklenip doğrulanır.
**Kabul:** canlıda `/api/health` `env: "prod"` ve `sha` dağıtılan commit; davet edilen bir gerçek
kullanıcı (kullanıcının kendisi) uçtan uca kayıt olur; seed verisi canlıya girmemiş. Bu adımdan
sonra veri değiştiren H3 migration'ı ve dağıtım işlemi PR başına kullanıcı onayı ister.
**⏸ Onay noktası:** K-02, K-03, K-05, K-12; hoca onayı.
**Bağımlılık:** P1-17.

## 5. Faz düzeyinde kabul

- Bütün adımların kabulü karşılanmış, çekirdek akış testleri main'de yeşil.
- Faz kapanış paketi üretilmiş (`faz-kapanis` skill'i): kapılar yeniden, plan↔yapılan, hocaya
  rapor, teknik rapor.
- Kullanıcının telefon testi turu tamamlanmış, bulgular kapatılmış ya da `BACKLOG.md`'ye
  yazılmış.
- `BACKLOG.md` ve `docs/decisions.md` güncel.

## 6. Kapsam dışı

`BACKLOG.md` “Ertelenmiş — Faz 2” ve D17. Faz 2 planı Faz 1 kapanınca yazılır.
