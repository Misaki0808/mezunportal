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
