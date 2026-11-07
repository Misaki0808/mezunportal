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

