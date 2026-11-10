# Hukuki metin taslakları — HOCA / HUKUK ONAYI BEKLİYOR

Bu belge hukuki metinlerin **taslaklarını** tutar. Buradaki metinler yayınlanmış değildir ve
uygulamayı bağlamaz. Geliştirme sırasında arayüzdeki hukuki sayfalar bu taslakları gösterir;
pilottan önce (BACKLOG `PILOT-LEGAL`) hoca/üniversite onaylar, onaylı sürüm köke taşınır ve
sürüm numarası `Consent` kayıtlarına bağlanır.

| Bölüm | Ne | Bekleyen |
|---|---|---|
| §1 Aydınlatma metni | KVKK aydınlatma metni (m. 10) | K-03 veri sorumlusu |
| §2 Yurt dışı açık rıza | Yurt dışına aktarım açık rızası (CV ayrıştırma, takvim daveti) | K-04 LLM sağlayıcısı |
| §3 Kullanım şartları | Kullanım şartları (topluluk kuralları, puan, moderasyon) | Hoca görüşü |

Kurallar:

- Metin değişince sürüm artar; kullanıcı yeniden onaya yönlenir (`docs/security.md` KVKK).
- Köşeli parantezli alanlar `[…]` doldurulmadan metin yayına girmez.
- Ürün davranışıyla çelişen cümle yazılmaz; metin kodun yaptığını anlatır.

## §1 Aydınlatma metni

Sürüm: taslak-1 · Durum: **HOCA / HUKUK ONAYI BEKLİYOR**

### 1. Veri sorumlusu
[K-03: veri sorumlusunun unvanı ve iletişim bilgisi]

### 2. İşlenen kişisel veriler
- **Kimlik ve iletişim:** ad, soyad, e-posta, (isteğe bağlı) telefon, profil fotoğrafı.
- **Eğitim ve mesleki bilgi:** bölüm, giriş/mezuniyet yılı, eğitim ve iş geçmişi, beceriler,
  diller, sertifikalar, CV dosyası.
- **Doğrulama:** okul/kurum e-posta adresi; mezunlar için e-Devlet mezun belgesi (karar verildiği
  anda silinir).
- **Platform kullanımı:** deneyim paylaşımları, randevu ve görüşme kayıtları, SSS talepleri,
  katkı puanı, güvenilirlik göstergesi, işlem güvenliği kayıtları.

### 3. İşleme amaçları
Üyeliğin doğrulanması; profil oluşturma; öğrencilerin mentor ve deneyimlere erişimi; randevu
düzenlenmesi; moderasyon ve platform güvenliği; bölümün mezun takibi için **toplu ve kimliksiz**
raporlar; bildirim gönderimi.

### 4. Hukuki sebepler
[Her amaç için KVKK m. 5/2 ve m. 6 kapsamındaki sebepler — hukuk görüşüyle doldurulacak.]

### 5. Aktarım
- **Yurt dışı:** CV ayrıştırma için yapay zekâ sağlayıcısı [K-04]; randevu davetleri için Google
  Takvim; [K-05 canlıda e-posta sağlayıcısı yurt dışındaysa]. Yalnız ayrı açık rızanızla.
- **Platform içi:** iletişim bilgileriniz yalnız sizin onayladığınız kişilere; randevu onayında
  e-posta adresiniz karşı tarafa.

### 6. Saklama süreleri
Mezun belgesi: karar anında silinir. CV: son sürüm, siz silene ya da hesabınızı kapatana kadar.
E-posta gönderim kayıtları: 6 ay. Kullanım metrikleri: 24 ay sonra kimliksizleştirilir. Hesap
silindiğinde kişisel alanlar derhal silinir.

### 7. Çerezler
Yalnız oturumunuzun çalışması için zorunlu çerez kullanılır; analitik veya reklam çerezi yoktur.

### 8. Haklarınız (KVKK m. 11)
[Haklar listesi.] Verilerinizin bir kopyasını uygulamadan indirebilir, hesabınızı silebilirsiniz.
Başvuru: [K-03 başvuru adresi].

## §2 Yurt dışına aktarım açık rızası

Sürüm: taslak-1 · Durum: **HOCA / HUKUK ONAYI BEKLİYOR**

Bu rıza isteğe bağlıdır. Vermezseniz platformu kullanmaya devam edersiniz; yalnız aşağıdaki iki
özellik çalışmaz.

### 1. CV'nin otomatik ayrıştırılması
Yüklediğiniz CV, profilinizi otomatik doldurmak için yurt dışında bulunan yapay zekâ hizmet
sağlayıcısına [K-04: sağlayıcı adı ve ülkesi] gönderilir. Sağlayıcı bu veriyi model eğitiminde
kullanmaz [sağlayıcı politikasıyla doğrulanacak]. Rıza vermezseniz profilinizi elle doldurursunuz.

### 2. Online randevu davetleri
Online randevu onaylandığında Meet bağlantılı takvim daveti için e-posta adresiniz Google LLC'ye
aktarılır. Rıza vermezseniz mentor görüşme bağlantısını kendisi paylaşır.

Rızanızı istediğiniz an gizlilik ayarlarından geri alabilirsiniz; geri alma ileriye dönük işler.

## §3 Kullanım şartları

Sürüm: taslak-1 · Durum: **HOCA / HUKUK ONAYI BEKLİYOR**

### 1. Platformun amacı
İÜ öğrencileri, mezunları ve akademisyenleri arasında staj ve kariyer deneyimi paylaşımı ve
mentorluk. [Platformu işleten: K-03]

### 2. Üyelik ve doğrulama
Tek kişi tek hesap. Doğrulama bilgileri gerçek olmalıdır; yanlış beyan hesabın askıya alınmasına
yol açar.

### 3. İçerik kuralları
- Deneyimler kişisel deneyimdir; şirketler hakkında hakaret, iftira, gizli bilgi ve kişisel veri
  içeremez.
- Paylaşımlar yayından önce moderasyondan geçer; moderatör düzenleyebilir veya reddedebilir.
- Şikâyet edilen içerik incelenir ve gerekirse kaldırılır.

### 4. Mentorluk ve randevular
Mentorlar gönüllüdür; kapasitelerini kendileri belirler. Katılamayacağın randevuyu iptal et;
katılım göstergesi mentorlara gösterilir.

### 5. Katkı puanı
Puan yalnız doğrulanmış katkılardan doğar. Puan elde etmek için sahte görüşme, sahte hesap veya
benzeri yollar yasaktır; tespit edilirse puanlar ve etiketler geri alınır, hesap askıya alınabilir.
Ödüller puanla otomatik değil, bölüm kararıyla verilir.

### 6. Sorumluluk
[Hoca/hukuk görüşü: platformun mentor tavsiyeleri ve staj sonuçları için sorumluluğu.]

### 7. Hesabın kapatılması
Hesabını istediğin an silebilirsin; sonuçları silme ekranında açıklanır.

## §4 Staj arayan olarak görünürlük açık rızası (P2-06) — TASLAK, onay bekliyor ⏸

> **Durum:** metin taslaktır; hoca/hukuki onayı kullanıcıdadır (D28; `PILOT-LEGAL`). Özellik bayraksızdır ama ekranda metin “taslak” işaretlidir. Sürüm
> `taslak-1` (`CURRENT_CONSENT_VERSIONS.JOB_SEEKER_VISIBILITY`); metin değişince sürüm artar.

### Rıza tercihiniz
Bu rıza **isteğe bağlıdır** ve istediğiniz an geri alınabilir. Vermezseniz platformu kullanmaya devam edersiniz; yalnız işe alım yapan mezunların sizi
bulması çalışmaz.

### 1. Neyi paylaşırsınız
“Staj arıyorum” dediğinizde, doğrulanmış ve işe alım yaptığını beyan eden **mezunlar** sizi bölümünüz, sınıfınız, seçtiğiniz ilgi alanları, hedef
dönemiz ve profilinizdeki başlık satırınızla bulabilir. **Adınız, fotoğrafınız, e-posta ve telefonunuz görünmez.** Başlık satırınıza kişisel veri
yazmamanızı öneririz; e-posta/telefon biçimindeki başlıklar gösterilmez.

### 2. İletişim
Bir mezun sizinle iletişime geçmek isterse size bir **talep** gönderir; talebi siz onaylayana kadar kimliğiniz mezuna açılmaz. Onayladığınızda yalnız
izin verdiğiniz alanlar paylaşılır; onayı istediğiniz an geri alabilirsiniz.

### 3. Geri alma ve sayaç
Rızanızı ya da görünürlüğü geri aldığınızda kartınız **hemen** aramalardan kalkar, bekleyen talepler kapanır ve kartınızın kimliği silinir. Kartınızın
kaç kez gösterildiğini görürsünüz; **kimin baktığı tutulmaz.**

### Aydınlatma metnine ek (§1'e eklenecek)
- **Amaç:** doğrulanmış mezunların staj arayan öğrencileri bulması. **Hukuki sebep:** açık rıza (KVKK m. 5/1).
- **Alıcılar:** yalnız aynı üniversitedeki, doğrulanmış ve işe alım beyanı vermiş mezunlar; paylaşım beyaz listedir (bölüm, sınıf, ilgi alanı, dönem, başlık satırı).
- **Saklama:** görünürlük kapanınca kart kimliği silinir; rıza kaydı hukuki kanıt olarak kalır (append-only).
- **Kapsam dışı:** [K-03: veri sorumlusu bilgisi ve başvuru adresi eklenecek.]


## §5 Yılın Mezunu ödülünün kamuya açık doğrulaması (P2-01) — TASLAK, onay bekliyor ⏸

> Sürüm: `taslak-1`; metin değiştiğinde sürüm artırılır ve yayın için yeniden açık rıza istenir.

Ödülümü kamuya açık doğrulama sayfasında yayınlamayı seçersem adım, ödül adı, bölümüm,
akademik yıl ve kurumum giriş yapmayan kişiler tarafından da görülebilir. Yayın iznini vermek
isteğe bağlıdır; istediğim zaman Ödüllerim ekranından geri alabilirim. İzni geri aldığımda
kamuya açık doğrulama sayfası kapanır. Metin hoca/üniversite ve hukuk onayı bekleyen taslaktır.

## §6 Ayın mezunu hikâyesi yayın rızası (P2-02) — TASLAK, onay bekliyor ⏸

> Sürüm: `taslak-1`. Metin değiştiğinde sürüm artar ve yayın için yeni açık rıza istenir.

Hikâyemin incelendikten ve ayın mezunu seçildikten sonra adım ve bölümümle birlikte yalnız bölümümün doğrulanmış üyelerine gösterilmesini isteğe bağlı olarak kabul ediyorum. Rızamı istediğim an geri alabilirim; geri aldığımda hikâyem ana sayfadan ve arşivden kaldırılır. Metin kullanıcı, hoca ve hukuk onayı bekleyen taslaktır.

## §7 Faz 2 aydınlatma ekleri (P2-14) — TASLAK, onay bekliyor ⏸

> `§1` aydınlatma metnine eklenecek yeni işleme amaçları. Sürüm `taslak-1`; hoca/hukuk onayı ve veri sorumlusu bilgisi (K-03) tamamlanınca metin sabitlenir.

- **Mezun ilanları:** ilanı yazan doğrulanmış mezun/akademisyenin adı okuyuculara gösterilmez; başvuru ilandaki bağlantıdan ya da (seçilirse) iletişim talebiyle yapılır, ad yalnız talep onaylanınca
  paylaşılır. Amaç: staj/iş fırsatlarını doğrulanmış topluluğa duyurmak. Hukuki sebep: sözleşmenin kurulması/ifası ve meşru menfaat.
- **Referans:** mezunun öğrenciye referans olduğunu beyan etmesi, iki tarafın doğrulanmış ve önceden etkileşimi (onaylı iletişim talebi ya da tamamlanmış görüşme) olması şartıyla yönetici onayına
  gider; yalnız puan hesabı ve kötüye kullanım kontrolü için işlenir. Hukuki sebep: meşru menfaat.
- **Etkinlik katılımı:** katılım kodu/QR ile kaydedilen katılım, etkinlik puanı ve katılım listesi için işlenir; liste yalnız etkinliği yöneten yöneticiye açılır. Hukuki sebep: meşru menfaat, puan için açık davranış.
- **Aylık özet e-postası:** bölümün önceki aya ait toplu deneyim ve ilan özeti, kullanıcı bildirim tercihine göre gönderilir; her e-postada tek tıkla abonelikten çıkış bağlantısı vardır. Hukuki sebep: açık rıza (tercih).
- **Takvim ve Meet daveti:** online randevuda Google Takvim davetinin e-posta adresini işlemesi `§2` yurt dışına aktarım rızasına bağlıdır; rıza yoksa davet oluşturulmaz, mentor bağlantıyı elle ekler.
- **Şirket/soru bankası/başvuru takvimi:** yayınlanmış deneyimlerden türetilen toplu özetlerdir; üç farklı yazardan az olan gruplar gösterilmez, kişi bilgisi içermez.

