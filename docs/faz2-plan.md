# Faz 2 planı — Fırsatlar, mevcut veriden değer, rehberlik ve tanınma (TASLAK)

Durum: **TASLAK, PM incelemesinde** · Yazıldı: 2026-11-08 · Kaynak: `BACKLOG.md` “Ertelenmiş — Faz 2” (P2-01…P2-13),
`README.md` “Kapsam”, `docs/faz1-plan.md` D-tablosu, `docs/architecture.md`, `docs/data.md`, koddaki mevcut modeller.

Bu belge Faz 2'nin **tek hedefini** ve ona giden **on dört adımı** tanımlar. `docs/faz1-plan.md` ile aynı çalışma
biçimi geçerlidir: rol önce `AGENTS.md`'yi ve kartındaki kaynakları okur; bağımlılığı karşılanan adımlar paralel yürüyebilir.
Kullanıcı kararı (8 Kas 2026): Faz 1 kodu bitince Faz 2'ye başlanabilir; Faz 2 bitince kullanıcı komple test ve deneme düzenleme
aşamasına geçer. Faz 2'nin sonu bu nedenle **“kullanıcı testine hazır”** demektir, canlıya alım Faz 1 P1-18'dedir.

**Bölünme (Faz 1'dekiyle aynı):** “Sözleşme → Servis ∥ Ekran” yazan adımda PM üç kart yazar: önce şema + `src/contracts`
sözleşme PR'ı (varsayılan W1), birleşince servis (W1) ve ekran (W2) aynı anda. Kabul satırının tamamı kartlara dağılır;
hiçbir kabul düşmez.

**Her adımın gizli kabul satırları (Faz 1'den devralınır):** kalite kapıları yeşil; ekranlı adımda “ekranda nasıl denenir” satırları
ve 390/1440 görseli; kural değişikliğinde mutasyon; yetkili eylemde negatif test; yeni şema ekleyici migration + geri alma
satırı + migration bekçisi; yeni kullanıcı metni yalnız `messages/tr.json`; yeni hata kodu `errors.codes`; kullanım olayı
(`Event`) kişisel veri içermeden; seed yeni modellerle büyür.

**Faz 2'ye özgü ek kabul satırları:**

1. **UI/UX birinci sınıftır** (kullanıcı: “işlev önemli ama UI UX daha önemli”). Her ekranlı adım yeni marka paletiyle
   (İris + Mercan, koyu tema; `docs/design.md`) ve **yalnız** `src/components/ui` bileşenleriyle yapılır; telefon (360/390)
   önce; boş, yükleniyor, hata ve devre dışı durumları tasarlanmış; küçük geçişler `prefers-reduced-motion`'a saygılı; kontrast
   AA (`src/lib/contrast.test.ts`). Ekran PR'ında önce/sonra ya da yeni ekran görüntüsü (`pnpm evidence`, 390 + 1440) zorunludur.
2. **Gizlilik önce:** başkasına ait veri gösteren her yeni liste, **k-anonimlik eşiği** (varsayılan k = 3) ya da açık rıza ister;
   anonim deneyimin yazarı hiçbir türev çıktıdan (şirket sayfası, soru bankası, takvim) çıkarılamaz (sızıntı testi).
3. **Puan eklemeleri PM kararıdır:** her yeni `PointAction` değeri ve gecikmesi `docs/architecture.md` tablosuna ve `PointRule`
   seed'ine yazılır, şüphe taraması (`rules/pointsSuspicion`) yeni eylemi kapsar, `points.backfill` yeni eylemi
   idempotent yeniden hesaplar.
4. **Dış servis yeni eklenmez** (LinkedIn rozeti hariç, o da yalnız bir bağlantıdır ve kullanıcı onayı ister, P2-01).
   LLM kullanılmaz (D8 yalnız CV için geçerlidir; Faz 2 özellikleri kural ve küme farkıyla çalışır).

## 1. Hedef

Platformun “bir kez doldurulan profil” olmaktan çıkıp **geri çağıran bir kariyer ağına** dönüştüğü sürüm: mezunlar öğrencilere
ilan ve referans açabilir (P2-03…P2-06); öğrenci, mevcut deneyim verisinden şirket, mülakat ve başvuru dönemi bilgisini
okuyabilir (P2-09…P2-11); hedef pozisyon için eksik becerisini ve işe yarayan dersleri görebilir (P2-07, P2-08); katkı
veren mezunlar tanınır ve topluluk etkinlikleriyle ağ canlı kalır (P2-01, P2-02, P2-12, P2-13). Her özellik mevcut doğrulanmış
üyelik, görünürlük, moderasyon, puan ve bildirim altyapısını **yeniden kullanır**; yeni dış servis veya yeni yetki modeli getirmez.

Faz 2'nin başarı ölçütleri (K-12 pilot ölçütleriyle birlikte hocayla belirlenir): yayınlanan ilan sayısı ve ilana tıklayan
öğrenci oranı, eşleştirme bildiriminden ilana geçiş, ters aramada rızalı öğrenci sayısı, şirket sayfası ve soru bankası
görüntülenmesi, etkinlik katılımı. Küçük ama gerçek kullanım büyük hedeften değerlidir.

## 2. Verilmiş kararlar (tekrar sorma)

Faz 1'in D1–D17 kararları **aynen geçerlidir** (`docs/faz1-plan.md` §2). Faz 2 için ek olarak:

| # | Karar | Değer |
|---|---|---|
| D18 | Marka ve arayüz | Palet “İris + Mercan”, İÜ renkleri kullanılmaz (kullanıcı kararı); koyu tema; Plus Jakarta Sans + Inter; UI/UX işlevden önemlidir, ürün/UX kararını PM verir (D15) |
| D19 | İlan | Yalnız doğrulanmış mezun yazar; moderasyonlu (bölüm yöneticisi); son başvuru tarihli, süresi dolan ilan kendiliğinden kapanır; başvuru platform dışında (dış bağlantı ya da mezunla iletişim talebi) |
| D20 | Ters yönlü arama | Yalnız öğrencinin **açık rızasıyla** ve her an geri alınabilir; iletişim bilgisi ve ad yalnız onaylı iletişim talebiyle açılır (D7) |
| D21 | Şirket | Şirket sayfaları **puansız** (D17); yalnız mevcut yayınlanmış deneyim, sözlük ve açık görünürlüklü pozisyon verisinden türetilir |
| D22 | Ödül | Yılın Mezunu ve ayın mezunu puanla **otomatik** verilmez; puan yalnız aday listesini sıralar, kararı bölüm yöneticisi verir (`docs/architecture.md` “Puan motoru”) |
| D23 | Rehber özellikleri | Beceri açığı ve ders rehberi yapay zekâsız, açık kuralla ve k-anonim sayımla çalışır |
| D24 | Dış hesap | LinkedIn “Add to Profile” yalnız bağlantıdır (API/kazıma yok); kurum sayfası ve metinleri kullanıcıdan gelir (E maddesi) |

## 3. Dalga sırası ve bağımlılık

PM önerisi dört dalga; dalga içi adımlar bağımlılığı karşılandıkça paralel yürür.

| Dalga | Adımlar | Neden bu sırada |
|---|---|---|
| A · Fırsatlar | P2-04 → P2-05 → P2-06 → P2-03 | Kullanıcıya en görünür değer; ilan, eşleştirme ve ters aramanın ortak parçaları (moderasyon, etiket eşleme, bildirim) bir kez kurulur |
| B · Mevcut veriden değer | P2-09 → P2-10 → P2-11 | Yeni veri girişi istemez; Faz 1'de toplanan deneyimlerden türetilir, pilotta hemen değer gösterir |
| C · Rehber | P2-07 → P2-08 | Profil etiketleri ve mezun pozisyonlarına dayanır; küme farkı ve sayımdır |
| D · Tanınma ve topluluk | P2-01 → P2-02 → P2-12 → P2-13 | Puan, katılım ve ilan verisi biriktikten sonra anlam kazanır; aylık özet diğer dalgaların çıktısını toplar |

Genel bağımlılık: P2-04 ← Faz 1 tamamı (P1-16 puan, P1-12 bildirim, P1-07 moderasyon); P2-05 ← P2-04; P2-06 ← P2-04 ve
KVKK rıza metni; P2-03 ← P2-04 (referans, ilana ya da mezuna bağlanır); P2-10 ← P2-09 (şirket çözümleme); P2-11 ← P2-09;
P2-07 ← P2-09 ve profil etiketleri; P2-02 ← P2-01; P2-13 ← P2-05 ve P2-12; P2-14 ← hepsi.

## 4. Adımlar — Dalga A · Fırsatlar

### P2-04 · Mezun staj ilanları · Sözleşme (W1) → Servis (W1) ∥ Ekran (W2) · H3
**İş:** doğrulanmış mezunun staj/iş ilanı yazması: kurum (sözlük `Company` ya da serbest ad), pozisyon, bölüm hedefi (bir ya
da birkaç bölüm), konum/uzaktan, açıklama, **son başvuru tarihi**, başvuru yolu (yalnız `https` bağlantısı ya da “mezunla
iletişim talebi”, D7). Yeni `JobPosting` (`DRAFT → PENDING → PUBLISHED | REJECTED`, süre dolunca `EXPIRED`, yazar kapatınca
`CLOSED`); moderasyon bölüm yöneticisindedir ve deneyim moderasyonuyla aynı kalıbı kullanır (`MODERATION_*` işlem kaydı,
kapsam kontrolü, gerekçeli ret, kuyruk). `postings.expire` günlük pg-boss işi (İstanbul saati) son tarihi geçeni kapatır.
Görünürlük K-07: arayanın üniversitesindeki bölümlere hedeflenmiş yayınlanmış ilanlar. Arama deneyimdekiyle aynı altyapıyı
kullanır (üretilmiş `tsvector` + `pg_trgm`, migration bekçisinin izin listesine eklenir). İlan şikâyeti: `ReportTargetType`
genişler. Hız sınırı: yazar başına ayda en çok 5 yeni ilan. Puan: yeni `PointAction` `JOB_POSTING_PUBLISHED` (yazar; yayında,
ilan başına bir kez; değer ve gecikme **PM kararı**).
**Ekran:** ilan listesi (süzgeçler: bölüm, kurum, konum, kalan gün; “son günler” vurgusu), ilan detayı (tek birincil eylem
“Başvur” ya da “İletişim iste”), mezun için “İlan ver” formu (adım adım, taslak kaydı, önizleme), “İlanlarım” ve durum
rozetleri, yönetimde ilan kuyruğu.
**Testler:** yazar yalnız `ALUMNI` ve etkin üyelikli (öğrenci/akademisyen 403); başka bölümün yöneticisi karar veremez;
süresi geçmiş ilan listede yok ve başvuru bağlantısı sunucuda da kapalı; `javascript:`/`data:`/`http:` bağlantı reddedilir;
yayında ad/e-posta alanı sızmaz (D7); aylık sınır; puan yalnız yayında ve bir kez, ret/kapatmada geri alınır; `expire` işi
idempotent; arama sonucu yalnız arayanın üniversitesinden; mutasyon (tarih sınırı, kapsam, bağlantı denetimi); Playwright:
mezun ilan verir → yönetici yayımlar → öğrenci bulur.
**Kabul:** yukarıdakiler; ilan yalnız moderasyondan sonra görünür; son tarih geçince kendiliğinden kapanır.
**📝 PM kararı:** ilan puanı değeri/gecikmesi; en uzun ilan süresi (öneri: 90 gün). **Açık soru:** ilan yalnız mezuna mı açık, yoksa
mentor olan akademisyen de verebilir mi? (öneri: yalnız mezun, D19.)
**Bağımlılık:** Faz 1 tamamı.

### P2-05 · İlan eşleştirme bildirimi · Servis + kural (W1) ∥ Ekran (W2) · H2
**İş:** ilan yayınlandığında profili uyan öğrencilere (hedef bölüm, ilgi/beceri/hedef etiketleri — `Tag` + `ProfileTag`, giriş
yılından hesaplanan sınıf) bildirim. Saf `rules/jobMatch` (etiket kesişimi + bölüm + dönem; eşik `JOB_MATCH_THRESHOLDS`
sabiti, tablo-güdümlü test). Bildirim outbox ile (`stageNotification`, yeni `NotificationType` `JOB_MATCH`, kullanıcı
kapatabilir: `NotificationPreference`). **Sıklık sınırı:** kullanıcı başına günde en çok bir e-posta (aynı gün birden çok
ilan tek özet), haftada en çok 3; uygulama içi bildirim listesi sınırsız ama gruplu. İlan sahibi eşleşen öğrencileri **görmez**,
yalnız “N kişiye ulaştı” sayısını görür.
**Ekran:** bildirim tercihlerinde “İlan eşleşmeleri” anahtarı; ana sayfa panosunda “Sana uyan ilanlar” (en çok 3, boşsa
profil etiketine yönlendiren boş durum); ilan kartında “Neden sana uygun?” (eşleşen etiketler, kimlik yok).
**Testler:** eşleşme kuralı tablo-güdümlü; kapalı tercih e-posta üretmez; günlük/haftalık sınır; sahibi eşleşen listeyi alamaz
(sızıntı testi); iptal/süre dolan ilan için bildirim gitmez; outbox aynı işlemde yazılır; mutasyon (eşik, sınır).
**Kabul:** yukarıdakiler; bildirimde kişisel veri yok.
**Bağımlılık:** P2-04; P1-12 bildirim altyapısı.

### P2-06 · Ters yönlü arama (“staj arıyorum”) · Sözleşme (W1) → Servis (W1) ∥ Ekran (W2) · H3
**İş:** öğrenci açık rızayla “staj arıyorum” görünürlüğünü açar (sürümlü yeni `Consent` belgesi `JOB_SEEKER_VISIBILITY`;
kapatınca görünürlük hemen kalkar). Profilde yeni alan(lar): `seekingInternship`, hedef dönem, ilgi alanları (mevcut etiketler).
İşe alım yapan mezun (etkin ilan sahibi ya da “işe alım yapıyorum” beyanı, öneri: **yalnız yayında ilanı olan mezun**) arama
yapar: bölüm, etiket, dönem süzgeci. **Sonuç kartında yalnız** bölüm, giriş yılından sınıf, etiketler ve başlık satırı görünür;
ad, fotoğraf, e-posta, telefon görünmez — mezun “İletişim iste” (D7 `ContactRequest`) ile öğrenciden izin ister, kabulde
görünürlük kuralları işler. Öğrenci “profilin kaç kez görüntülendi” sayısını görür (kim bakmış görünmez). Hız sınırı: mezun
başına günde 50 aranan kart, ayda 20 iletişim talebi. Her arama `Event` (sayım, kişisel veri yok).
**Ekran:** öğrencide ayarlar → “İş arayanlara görün” anahtarı + açık rıza metni, anlamlı önizleme (“mezunlar seni böyle görür”);
mezunda “Aday bul” (süzgeç + kart listesi + iletişim iste); öğrencide görüntülenme sayacı.
**Testler:** rıza yokken ya da geri alındıktan sonra hiçbir arama yanıtında öğrenci yok (sızıntı testi, JSON'da ad/e-posta/
kimlik/fotoğraf yok); yalnız `ALUMNI` + etkin ilanı olan arar (diğerleri 403); sonuçta yalnız aynı üniversite (K-07); rıza
geri alınınca bekleyen iletişim talepleri kapanır; hesap silinince arama kayıtları yok; hız sınırları; mutasyon (rıza kapısı,
alan beyaz listesi); Playwright: rıza ver → mezun bul → iletişim iste → kabul.
**Kabul:** yukarıdakiler; hukuki metin güncellemesi onaylı.
**⏸ Onay noktası:** KVKK rıza metni ve aydınlatma eki (`docs/legal-drafts.md` taslağı W1 yazar; hoca/hukuki onay kullanıcıda).
**Açık soru:** aday arayabilmek için “yayında ilanı olan mezun” şartı yeterli mi, yoksa herhangi bir doğrulanmış mezun mu?
**Bağımlılık:** P2-04; P1-03 rıza ve iletişim altyapısı.

### P2-03 · Referans akışı · Sözleşme (W1) → Servis (W1) ∥ Ekran (W2) · H3
**İş:** mezun, öğrenciye **referans verdiğini** beyan eder; kanıt zinciri: mezun beyanı → öğrenci doğrulaması → bölüm yöneticisi
onayı (üç taraf, dosya/ekran görüntüsü yüklenmez, KVKK). İkinci aşama “referansla kabul”: öğrenci kabul edildiğini beyan eder
→ mezun doğrular → yönetici onaylar. Yeni `ReferralClaim` (`PROPOSED → STUDENT_CONFIRMED → APPROVED | REJECTED`, ikinci aşama
için `ACCEPTED_*` durumları, gerekçeli ret, isteğe bağlı ilana bağlantı). Puan: `REFERRAL_GIVEN` ve `REFERRAL_ACCEPTED`
(**gecikmeli**; yalnız yönetici onayında; iptal edilebilir). Aynı mezun–öğrenci ikilisine ayda bir referans (görüşme tavanıyla
aynı kalıp), azalan çarpan, şüphe taraması yeni kuralla genişler (aynı öğrenciye tekrarlı referans, kısa sürede çok referans).
**Ekran:** mezunda “Referans verdim” formu (öğrenci seç, ilan/kurum, not), öğrencide “Bekleyen referanslar” (onayla/reddet),
yönetici kuyruğu (iki tarafın beyanı yan yana, kanıt notu), profilde “Referans verdi: N” rozeti.
**Testler:** beyan tek başına puan üretmez (üç onay şartı); öğrenci reddederse süreç kapanır; yönetici başka bölümün talebini
göremez; aynı ikili aynı ay ikinci referans çarpan 0; puan gecikmeli ve iptalde geri alınır; geriye dönük hesaplama idempotent;
mutasyon (onay sırası, ikili tavan); Playwright: üçlü onay.
**Kabul:** yukarıdakiler.
**📝 PM kararı:** referans puanları (mimari tablo “referans” sırasını yüz yüze görüşmenin üstüne koyar: öneri ≥ 20) ve gecikme süresi.
**Bağımlılık:** P2-04 (ilana bağlanabilmesi için); P1-16 puan motoru.

## 5. Adımlar — Dalga B · Mevcut veriden değer

### P2-09 · Şirket sayfaları (puansız) · Servis (W1) ∥ Ekran (W2) · H2
**İş:** `/sirketler/[slug]`: sözlükle eşleşmiş `Company` için **türetilmiş** özet — yayınlanmış deneyimler (anonim olanlar
yazarsız), çalışan/geçmiş çalışan mezun sayısı (yalnız görünürlüğü `MEMBERS` olan ve k ≥ 3 ise sayı), başvuru dönemi dağılımı,
mülakat soruları (P2-10), o şirkette çalışan **mentorlar** (açık `MentorProfile`, mevcut dizin kartı). **Puanlama, yıldız, “öneriyor
musun” yoktur** (D17/D21). Şirket arama (`pg_trgm` takma adlı). Yönetici sözlük aracına “şirket birleştir” (aynı şirketin iki kaydı;
deneyim ve pozisyon bağlantıları taşınır, işlem kaydıyla) eklenir.
**Ekran:** şirket sayfası (üstte ad/sektör, sekmeler: Deneyimler · Mülakat · Başvuru dönemi · Mentorlar), şirket arama ve
“popüler şirketler” (en çok deneyimli, k ≥ 3), boş durum: “Bu şirket için henüz deneyim yok — ilk paylaşan sen ol” (tek eylem).
**Testler:** k < 3 olan dağılım/sayı hiçbir yanıtta yok; anonim deneyimin yazarı sayfanın hiçbir parçasından çıkarılamaz
(sızıntı testi); K-07 üniversite görünürlüğü; birleştirme idempotent ve geri alınamaz uyarısı; puan/oy alanı yok (şema testi);
mutasyon (k eşiği, görünürlük).
**Kabul:** yukarıdakiler.
**Bağımlılık:** Faz 1 (P1-07 deneyim, sözlük, P1-10 mentor dizini).

### P2-10 · Mülakat soru bankası · Servis + kural (W1) ∥ Ekran (W2) · H2
**İş:** yayınlanmış deneyimlerdeki `interviewQuestions` ve süreç adımlarından **şirket/pozisyona göre** soru bankası.
Yinelenenler `rules/questionDedupe` ile (katlama + `pg_trgm` benzerliği) gruplanır, “kaç deneyimde geçti” sayılır; soru metni
kimlik içeremez (ad/e-posta biçimi, SSS kimlik denetiminin aynı kuralı, `analyzeIdentity`). Kaynak deneyim geri alınır ya da
yazar hesabı silinirse soru türev çıktıdan düşer (sorgu anında türetme; ayrı tablo yalnız performans gerektirirse).
**Ekran:** `/mulakat-sorulari` (şirket, pozisyon, sektör süzgeci, arama), soru kartı (“3 deneyimde geçti”), şirket sayfasında sekme;
“kaydet/çalış” (öğrenci kendi listesi) **yalnız ek yükü azsa**, aksi halde sonraki faz.
**Testler:** anonim deneyimin sorusu yazarsız; geri alınan/silinen deneyim sorusu çıkar; yinelenen sorular tek karta birleşir;
k-anonimlik (tek deneyimli şirket yalnız “az sayıda” notuyla, yazar tanınmasın); mutasyon (yinelenen eşiği).
**Kabul:** yukarıdakiler.
**Açık soru:** soru bankası türetilmiş sorguyla mı (öneri, basit) yoksa ayrı `InterviewQuestion` tablosuyla mı kurulsun?
**Bağımlılık:** P2-09 (şirket çözümleme).

### P2-11 · Staj başvuru takvimi · Sözleşme (W1) → Servis (W1) ∥ Ekran (W2) · H2
**İş:** deneyimlerden “bu şirkete/sektöre hangi aylarda başvurulmuş” takvimi ve hatırlatma. Deneyim formuna isteğe bağlı
`appliedMonth` (ekleyici migration; eski deneyimlerde boş, dönem sezonu `termSeason` yedek). Takvim yalnız k ≥ 3 deneyim olan
şirket/sektör için aylık dağılımı gösterir. **Takip:** öğrenci şirketi/sektörü takip eder (`CompanyFollow`); pg-boss aylık iş
(`TZ=Europe/Istanbul`), takip edilen şirketin tipik başvuru ayı başladığında outbox hatırlatması (`NotificationType`
`APPLICATION_WINDOW`, kapatılabilir). Kayıt yok ise yanlış umut verilmez: “Henüz yeterli veri yok”.
**Ekran:** takvim (12 aylık ısı çubuğu, 360'ta yatay kaydırmasız), şirket sayfasında sekme, “Takip et” düğmesi, bildirim
tercihi satırı.
**Testler:** k < 3 dağılım yok; hatırlatma yalnız takip edene ve ay başında; kapalı tercih e-posta üretmez; eski deneyim (ay boş)
sezon yedeğiyle sayılır; zaman dilimi (ay sınırı İstanbul); mutasyon (k, ay sınırı).
**Kabul:** yukarıdakiler.
**Bağımlılık:** P2-09; P1-12.

## 6. Adımlar — Dalga C · Rehber

### P2-07 · Beceri açığı analizi · Servis + kural (W1) ∥ Ekran (W2) · H2
**İş:** öğrencinin **hedef pozisyonu** (profil `GOAL` etiketi ya da seçilen `Title`) için, o pozisyondaki doğrulanmış mezunların
(görünürlüğü uygun, k ≥ 5) becerilerinin sıklığı ile öğrencinin becerileri arasındaki **küme farkı** (yapay zekâ yok, D23):
“Bu pozisyondaki mezunların %72'si SQL biliyor; sende yok.” Beceri kaynağı: `Tag(SKILL)` + `ProfileTag` ve CV'den uygulanmış
beceriler (Faz 1). Saf `rules/skillGap` (eşik: en az k mezun; ilk 10 eksik; yaygınlık yüzdesi). Her eksik beceri için “Bu beceri
için mentor bul” (mezun dizinine süzgeçle) ve ilgili SSS/deneyim bağlantısı.
**Ekran:** profilden “Hedefime ne kadar yakınım?” kartı (ilerleme çubuğu + eksik beceri listesi + tek eylem), hedef seçimi,
yetersiz veri boş durumu (“Bu pozisyon için henüz yeterli mezun verisi yok”).
**Testler:** k altında analiz yok; kimse tek tek tanınmaz (yanıtta kullanıcı kimliği yok); yüzde hesabı tablo-güdümlü; görünmez
profil sayıma girmez; öğrencinin becerisi eşleşme normalizasyonuyla (sözlük) karşılaştırılır; mutasyon (eşik, küme farkı).
**Kabul:** yukarıdakiler.
**Bağımlılık:** P2-09 (pozisyon/sektör çözümleme); P1-04–P1-06 profil ve etiketler.

### P2-08 · Seçmeli ders rehberi · Sözleşme (W1) → Servis (W1) ∥ Ekran (W2) · H2
**İş:** mezunun “işimde işe yarayan dersler” işareti: yönetimin yönettiği `Course` sözlüğü (bölüm bazlı, seed'e YBS müfredatı)
ve `AlumniCourseMark` (mezun, ders, en çok 5 işaret). Öğrenci ders sayfasında “N mezun işinde işe yaradığını söyledi”, hangi
sektörlerde (k ≥ 3). Kimlik gösterilmez. Ders sözlüğü yönetici ekranından bakım alır (işlem kaydı).
**Ekran:** mezun profilinde “Hangi dersler işine yaradı?” seçici; öğrencide “Seçmeli ders rehberi” (ders kartı + mezun sayısı + sektör
çipleri); yönetimde ders sözlüğü.
**Testler:** k altında sayı gösterilmez; mezun silinince işaretleri düşer; en çok 5 işaret sınırı; ders yalnız kendi bölümüne bağlı
mezundan işaret alır; mutasyon (sınır, k).
**Kabul:** yukarıdakiler.
**⏸ Onay noktası:** YBS ders listesi kaynağı (hoca/bölümden resmî müfredat). **Açık soru:** yalnız seçmeli mi, zorunlu dersler de mi?
**Bağımlılık:** Faz 1 profil; bölüm sözlüğü.

## 7. Adımlar — Dalga D · Tanınma ve topluluk

### P2-01 · Yılın Mezunu ve LinkedIn rozeti · Sözleşme (W1) → Servis (W1) ∥ Ekran (W2) · H3 (dış servis: yalnız bağlantı)
**İş:** her yıl bölüm bazında **aday listesi** (yıl içindeki katkı puanı, yayınlanmış deneyim, görüşme sayısı; şüphe işaretli
kayıtlar ve açık `SuspicionFlag`'li adaylar listeye girmez), **karar bölüm yöneticisindedir** (puan otomatik vermez, D22; gerekçe
ve işlem kaydı). Yeni `Award` (tür `YEAR_ALUMNI`, bölüm, yıl, kullanıcı, doğrulama kodu). Ödüllü mezun, ödülünün herkese açık
yayınlanmasına **açık rıza** verir ya da vermez (rızasız kayıt yalnız platform içinde kalır). **Herkese açık doğrulama sayfası**
`/dogrula/[kod]` (giriş gerektirmez; yalnız ad, ödül, bölüm, yıl, kurum; rastgele ve tahmin edilemez kod, hız sınırlı, arama
motoruna kapalı). LinkedIn “Add to Profile”: ödül adı, kurum adı, tarih ve doğrulama adresi parametreli **bağlantı** (API/kazıma
yok, D24) + hazır paylaşım metni düğmesi; mezuniyet töreninde açıklanabilir.
**Ekran:** yönetimde aday listesi (puan kırılımı, şüphe uyarısı, “Seç” gerekçe formu), mezunda ödül kartı (kutlama ekranı,
küçük hareket, reduced-motion saygılı) + “LinkedIn'e ekle” + “Doğrulama bağlantısını kopyala”, doğrulama sayfası (kamuya açık,
kurumsal ve sade).
**Testler:** şüpheli aday listede yok; yalnız kendi bölümünün yöneticisi karar verir; rızasız ödül doğrulama sayfasında 404;
kod tahmin edilemez ve hız sınırlı; sayfada ad dışında kişisel veri yok; hesap silinince kayıt ve sayfa kalkar; LinkedIn
bağlantısı yalnız beyaz listeli alanlardan üretilir (kod enjeksiyonu yok); mutasyon (aday süzgeci, rıza kapısı).
**Kabul:** yukarıdakiler.
**⏸ Onay noktası (kullanıcı):** LinkedIn kurum sayfası/şirket kimliği ve ödül adı metni (E maddesi; ücretli hesap gerekmez ama
doğrulanmış kurum sayfası kullanıcıdadır); rıza metni (KVKK taslak eki).
**Açık soru:** aday havuzu yalnız son bir yıl mı, tüm zamanlar mı?
**Bağımlılık:** P1-16 puan motoru, P2-04/P2-03 puanları (isteğe bağlı: onlar olmadan da çalışır).

### P2-02 · Ayın mezunu · Servis (W1) ∥ Ekran (W2) · H2
**İş:** ana sayfada kısa **kariyer hikâyesi** kartı; rozet yok. Mezun hikâyesini yazar ve yayın rızası verir (moderasyonlu metin,
deneyim moderasyonu kalıbı, kimlik denetimi hariç: kendi adıyla yayınlanır); bölüm yöneticisi ayın mezununu seçer (puanla
sıralanan adaylar ya da elle). Ay değişince kart otomatik döner (zamanlı iş, İstanbul saati); arşiv sayfası.
**Ekran:** ana sayfada büyük hikâye kartı (fotoğraf/baş harf, alıntı, “Hikâyeyi oku”), hikâye sayfası, mezunda “Hikâyeni paylaş”
daveti, yönetimde seçim.
**Testler:** rızasız ya da yayın rızası geri alınmış hikâye görünmez; yalnız moderasyondan geçen metin; bir ayda bir seçim;
rıza geri alınınca ana sayfadan kalkar; ay sınırı İstanbul; mutasyon.
**Kabul:** yukarıdakiler.
**Bağımlılık:** P2-01 (ödül/rıza altyapısı, aday sıralaması).

### P2-12 · Etkinlik modülü · Sözleşme (W1) → Servis (W1) ∥ Ekran (W2) · H3
**İş:** yönetici onaylı kampüs/topluluk etkinliği (adı mevcut kullanım olayı `Event` ile çakışmamak için `CampusEvent`): başlık,
zaman, yer, hedef bölüm kapsamı, kontenjan, açıklama; kayıt (RSVP) ve **katılım doğrulama**: etkinlik sırasında yönetici ekranında
dönen QR / **kısa ömürlü geçici kod** (örn. 6 hane, 2 dk, yalnız etkinlik penceresinde); katılımcı kodu girer ya da QR'ı okutur
→ `EventAttendance` (etkinlik+kullanıcı benzersiz). Puan: yeni `PointAction` `EVENT_ATTENDED` (**gecikmeli**; değer PM kararı).
Şüphe taraması yeni kuralla genişler (aynı saniyede toplu giriş, aynı cihaz/ağdan çok katılım yok sayılmaz ama işaretlenir;
coğrafi doğrulama yoktur — bilinen sınır, belgelenir). Hız sınırı: kod denemesi kullanıcı başına dakikada 5.
**Ekran:** etkinlik listesi ve detayı (takvime ekle, “Katılıyorum”), yönetimde etkinlik oluştur/onayla ve “Katılım ekranı” (büyük
QR + geri sayım, katılımcı sayacı), katılımda “Kodu gir” alanı ve başarı geri bildirimi.
**Testler:** pencere dışı ve süresi geçmiş kod reddedilir; aynı kişi iki kez katılamaz; kapsam dışı bölümün etkinliği listede yok;
puan gecikmeli, iptalde geri alınır; kod deneme sınırı; yönetici başka bölümün etkinliğini yönetemez; mutasyon (pencere, tekrar).
**Kabul:** yukarıdakiler; QR 390'da okunur.
**📝 PM kararı:** katılım puanı ve gecikmesi.
**Bağımlılık:** P1-16, P1-12.

### P2-13 · Aylık özet e-postası · Servis + kural (W1) ∥ Ekran (W2) · H2
**İş:** her ay başında kişiselleştirilmiş özet (pg-boss cron, İstanbul saati): bölümündeki yeni deneyimler, sana uyan ilanlar
(P2-05 eşleşmesi), katkı puanın ve bekleyen puanların özeti, yaklaşan etkinlikler (P2-12), takip ettiğin şirketlerin başvuru
dönemi (P2-11). Saf `rules/digest` (içerik seçimi, boş bölümü atlama, hiçbir şey yoksa **e-posta gönderme**). Outbox ile; yeni
`NotificationType` `MONTHLY_DIGEST`; tek tıkla abonelikten çıkma (imzalı bağlantı, giriş gerektirmez, `StillThere` kalıbı); ayda
en çok bir. Yönetici ekranında özetin **önizlemesi** (gerçek kullanıcıya göndermeden).
**Ekran:** bildirim tercihlerinde “Aylık özet” anahtarı, uygulama içinde “Bu ayın özeti” sayfası (e-postanın aynısı), önizleme
(yönetim).
**Testler:** boş özet gönderilmez; kapalı tercih e-posta üretmez; imzalı abonelikten çıkma yalnız o kullanıcıyı etkiler ve tekrar
kullanılabilir; e-postada kişisel veri yalnız alıcının kendisine ait; ay sınırı İstanbul; aynı ay ikinci özet yok (idempotent
anahtar); mutasyon.
**Kabul:** yukarıdakiler; Mailpit'te her bölüm denenir.
**Bağımlılık:** P2-05, P2-11, P2-12 (yoksa ilgili bölüm atlanır; kural önce hazırlanır).

## 8. Adımlar — Kapanış

### P2-14 · Faz 2 sertleştirme ve kullanıcı testine hazırlık · W1 + W2 · H3
**İş:** Faz 2 özelliklerinin uçtan uca çekirdek akış testleri (`pnpm test:e2e`): ilan → eşleşme → ters arama → referans →
şirket sayfası; yeni puan eylemleri için `points.backfill` ve şüphe taraması doğrulaması; performans (yeni indeksler, arama
planları, k-anonim sayımların maliyeti); erişilebilirlik turu (klavye, ekran okuyucu adı, kontrast, her iki tema); migration
zinciri (temiz veritabanında sırayla uygulanır, geri alma satırları); seed Faz 2 verisiyle (örnek ilanlar, etkinlik, ders
sözlüğü, şirket verisi) **kullanıcının hızlı deneyebileceği** biçimde büyür; `docs/security.md` ve `docs/data.md` yeni
görünürlük/rıza kuralları; `docs/legal-drafts.md` yeni rıza metinleri; kullanıcı için “deneme rehberi” (hangi test hesabıyla
hangi akışın nasıl denendiği; yeni `.md` açılmaz, `docs/engineering.md` “Telefon testi” bölümüne eklenir).
**Testler:** Faz 1 çekirdek akışları hâlâ yeşil; yeni akışların Playwright testleri; her iki tema ekran görüntüleri.
**Kabul:** `faz-kapanis` skill'i paketi; plan↔yapılan; kullanıcının test turu için bulgu listesi şablonu hazır.
**Bağımlılık:** P2-01…P2-13.

## 9. Kullanıcı / PM onayı gerektirenler (özet)

| Madde | Kim | Neden | Bekleyen adım |
|---|---|---|---|
| LinkedIn “Add to Profile”: kurum sayfası, ödül adı | Kullanıcı | Dış hesap/kurum sayfası (E maddesi) | P2-01 |
| Ters arama ve ödül yayını rıza metinleri | Kullanıcı + hoca | KVKK (özel rıza), `docs/legal-drafts.md` | P2-06, P2-01, P2-02 |
| İlan, referans, etkinlik puan değerleri ve gecikmeleri | PM | Puan ekonomisi dengesi (`PointRule` seed) | P2-04, P2-03, P2-12 |
| YBS ders listesi kaynağı | Hoca/bölüm | Resmî müfredat | P2-08 |
| Canlı SMTP hacmi (özet + eşleşme e-postaları) | Kullanıcı | K-05; ücretsiz katman sınırları | P2-05, P2-13 |
| Aday arama yetkisi (hangi mezun arayabilir) | PM | KVKK etkisi, kötüye kullanım riski | P2-06 |

## 10. Faz düzeyinde kabul

- Bütün adımların kabulü karşılanmış, çekirdek akış testleri (Faz 1 + Faz 2) main'de yeşil.
- Faz kapanış paketi üretilmiş (`faz-kapanis` skill'i): kapılar yeniden, plan↔yapılan, hocaya rapor, teknik rapor.
- Hem açık hem koyu temada ekranlar gözden geçirilmiş, kontrast testi yeşil.
- Kullanıcının komple test ve deneme turuna hazırlık (P2-14) tamamlanmış; bulgu listesi şablonu hazır.
- `BACKLOG.md` ve `docs/decisions.md` güncel.

## 11. Kapsam dışı

Canlı sohbet/websocket · chatbot · ayrı mobil uygulama · konaklama · dönemlik mentorluk programı · **şirket puanlama** ·
**LinkedIn kazıma** (D17). Faz 2'de ayrıca: platform içi **başvuru gönderme/özgeçmiş iletme** (başvuru dış bağlantı ya da mezunla
iletişimle yapılır), ücretli ya da öne çıkarılmış ilan, yapay zekâ ile ilan/aday eşleştirme (D23), diğer fakülte ve üniversitelere
açılma (Faz 3), kariyer yolu haritası ve doğal dille arama (Faz 3 fikirleri).
