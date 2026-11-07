---
name: faz-kapanis
description: MezunPortal'da bir faz (docs/fazN-plan.md) bittiğinde kapanış paketini üretir — main üzerinde kapıların yeniden koşulması ve review, plan↔yapılan karşılaştırması, kayıtsız kalmış borç/açık işlerin BACKLOG.md'ye işlenmesi, kullanıcı için telefon testi kontrol listesi, danışman hocaya rapor (PDF), teknik rapor (PDF) ve kısa mesaj özeti. Yalnız bir faz kapandığında ve kapanış paketi istendiğinde yüklenir.
---

# Faz kapanışı

Bir faz bittiğinde **her seferinde aynı paketi** üret. Bu skill ürün kodu yazmaz; tek repo
değişikliği kayıtsız kalmış borç/açık işlerin işlenmesi ve faz planına kapanış notudur.

Önce kökteki `AGENTS.md`'yi oku (özellikle §1 doğruluk sırası, §6 dokümantasyon disiplini).
Rol protokolünde bu paketi PM bir role kartla verir (varsayılan bir reviewer); rol kullanıcıya
soru sormaz, eksik bilgiyi `PM KARAR BEKLİYOR` ile ister.

## Çıktılar (hepsi `~/Desktop/mezunportal-faz<N>/`, **repoya girmez**)

| Dosya | İçerik |
|---|---|
| `faz<N>-hoca-raporu.pdf` (+ `.html`) | Danışman hocaya ara rapor — teknik olmayan okur; en fazla 6 sayfa |
| `faz<N>-teknik-rapor.pdf` (+ `.html`) | Teknik rapor — PM ve sonraki fazı alacak ajanlar; 4–6 sayfa; bitirme raporunun teknik bölümlerine kaynak |
| `faz<N>-telefon-testi.html` + `.md` | Kullanıcının telefonda yapacağı tur: adres, giriş hesabı, adım adım kontrol listesi (rollerin “ekranda nasıl denenir” satırlarından derlenir) |
| `faz<N>-ozet.txt` | Kısa mesaj özeti (hocaya ya da gruba gönderilebilir); sohbete de yazılır |
| docs PR'ı | Kayıtsız borç/açık işler + faz planına kapanış notu — **aç, merge etme** |

## Sormadan kullanılacak varsayılanlar

- Hoca raporu okuru teknik olmayan danışman hocadır; teknik rapor ayrı belgedir.
- Kapsam yalnız biten fazdır; sonraki faz için tek “Sırada ne var” bölümü.
- Borç ve ertelenen kalemler repoya da yazılır.
- Dil Türkçe.

## Usul

### 1. Fazın sınırını çiz
- `git fetch origin && git merge --ff-only origin/main`. Çalışma ağacı temiz değilse dur.
- Faz PR'larını belirle: önceki kapanıştan bugüne `git log --merges`. Ana adım PR'larını
  (commit gövdesindeki `P1-xx`) ve takip/düzeltme PR'larını ayır.
- PR başına boyut: `git diff --numstat "<merge>^1" "<merge>"` (dosya, +, −, test, migration).
- Plan kaynağı: `docs/fazN-plan.md`; durumlar PM'nin `DURUM.md`'sinde.

### 2. PR gövdelerini ve sonuç dosyalarını oku — hepsini
Her PR'dan ve rol sonuç dosyasından çıkar: “koşmadı / yapılmadı” beyanları, “bilinen sınır /
sonraki adım / not”, “ekranda nasıl denenir” satırları, PM kararları ve kullanıcının verdiği
kararlar (K maddeleri).

### 3. Kapıları main'de yeniden koş (log dosyasına)
```bash
pnpm install --frozen-lockfile
pnpm prisma generate
pnpm typecheck; echo "RC=$?"
pnpm lint; echo "RC=$?"
pnpm test; echo "RC=$?"
pnpm messages:check; echo "RC=$?"
pnpm build; echo "RC=$?"
pnpm test:e2e; echo "RC=$?"
```
Her adımın çıkış kodunu hemen yakala, özet satırlarını grep'le. Koşmayanı raporda **açıkça**
yaz.

### 4. Review
- Faz planındaki her adımın Kabul satırını koda ve kanıta karşı tek tek denetle.
- PR'ın iddia ettiği ama kanıtı olmayan şeyi işaretle.
- Kendi önceki kayıtlarında yanlış çıkanı adıyla düzelt.

### 5. Kayıtsız kalemleri repoya işle
PR'larda “not” olarak kalan her sınırı `BACKLOG.md` (“Teknik borç” dahil), `README.md`,
`docs/architecture.md` içinde ara; yoksa kaydet:
- Ürün işi / karar → `BACKLOG.md`.
- Teknik borç → `BACKLOG.md` “Teknik borç” yeni `TD-NNN` (kök neden, risk, neden şimdi çözülmediği,
  ölçülebilir kapanış koşulu).
- **Tamamlanan işi yazma.**
- Faz planının başına durum satırı: “**Tamamlandı** · <tarih> · kapanış paketi: <dosya adları>”.
  Plan silinmez; bitirme raporunun kaynağıdır.
- `BACKLOG.md` “Güncel durum” güncel duruma çekilir (günlük değil).
- Dal `docs/faz<N>-kapanis`; PR taslak açılır, **merge etme**.

### 6. Plan ↔ yapılan karşılaştırması
Üç blok, dört işaret (✓ yapıldı · ◐ kısmen/bilinçli sapma · → bilinçli ertelendi · ✗ yapılmadı):
1. Faz planındaki adımlar — madde madde.
2. Yol boyunca eklenenler (inceleme bulguları, düzeltmeler, yeni kararlar).
3. Bilinçli ertelenenler — her biri nereye ertelendiğiyle.
Altına tek cümlelik sayım. Sapmayı gizleme: “plandan sapma: … çünkü …”.

### 7. Telefon testi kontrol listesi
`docs/engineering.md` “Telefon testi” adımları + bu fazın kullanıcıya görünen akışları:
- Başta: bilgisayarda `pnpm db:reset && pnpm db:seed && pnpm dev:lan`; telefonda açılacak adres.
- Her akış için: hangi test hesabıyla girilecek (yalnız rol adı; bilgiler `korunan/`'da), adımlar,
  beklenen sonuç, işaretlenecek kutu.
- Mobil kontroller: yatay kaydırma, klavye açıkken form, alt gezinme, “ana ekrana ekle”.
- Sonda: “Bulduğun sorunları PM'ye yaz” satırı. Bulgular PM'de kart olur ya da `BACKLOG.md`'ye
  gider.

### 8. Hoca raporu — en fazla 6 sayfa, bölüm = sayfa
Okur teknik değil. Dosya yolu, fonksiyon adı, kod terimi yok.
1. **Özet** — fazın bir paragraf hikâyesi; 4–6 rakam kutusu (tamamlanan adım, test sayısı,
   ekran sayısı…); “Kullanıcı ne görecek?”
2. **Ne yapıldı** — adım başına 2–3 cümle, kullanıcı gözünden.
3. **Verilen kararlar** — konu / karar / neden tablosu (`docs/decisions.md`'den).
4. **Ekranlar** — 4–6 ekran görüntüsü (mobil ağırlıklı, kanıt klasöründen), altında tek cümle.
5. **Doğrulama ve açık konular** — kapı sonuçları, telefon testi durumu, **“Yapılmayanlar —
   açıkça”** (zorunlu başlık), hocadan beklenen kararlar.
6. **Plan ↔ yapılan ve sırada ne var** — §6 tablosu + sonraki fazın ilk adımları.

### 9. Teknik rapor — 4–6 sayfa
1. PR envanteri + bugünkü kapılar (koşmayanlar kırmızı).
2. Veri modeli ve kural değişiklikleri — kavram düzeyinde, kanonik dosyaya yönlendirerek.
3. Modül haritası (klasör → ne değişti).
4. Testler ve kanıtlar: birim, sızıntı, mutasyon, çekirdek akış testleri, PM tarayıcı turu
   kayıtları (`pm-handoff/TARAYICI-TURU-*.md`).
5. Açık işler ve borç (`dosya:satır` ile).
6. Sonraki faza giriş noktaları ve **korunacak değişmezler**.

### 10. PDF üretimi
Raporu tek dosya HTML olarak yaz (her bölüm bir `<section class="page">`, `@page` A4, sayfa
sonu her bölümden önce). Headless Chrome ile PDF:
```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu \
  --no-pdf-header-footer --user-data-dir=/tmp/chr --print-to-pdf="<ad>.pdf" "file://<ad>.html"
```
Denetim: **sayfa sayısı = bölüm sayısı**. Taşan bölüm varsa önce tabloyu daralt, sonra hücreyi
kısalt, en son paragraf sil. En yoğun 2 sayfayı görsel olarak kontrol et.

### 11. Kısa mesaj özeti
Okuyan kişi raporu açmadan neyin değiştiğini ve neyin açık kaldığını anlamalı. Düz, konuşur gibi
Türkçe; her madde somut bir olgu. Başlıklı gruplar: *Kullanıcı tarafında ne değişti* ·
*Rakamlar* · *Açık kalanlar* · *Hocadan beklenenler* · *Sırada*. Slogan, emoji dizisi, kutlama
tonu yok. Son satır: eklerin adı ve sayfa sayısı.

### 12. Kapanış mesajı (PM'ye)
Dosya yolları · docs PR linki · kapı sonuçları tek satır · repoya yazılan kayıtlar · dürüstlük
notları · telefon testi listesinin yolu · sıradaki adım önerisi.

## Dürüstlük kontrol listesi — rapor çıkmadan önce
- [ ] Koşmayan her test “koşmadı” diye yazılı.
- [ ] Her sayı bir komut çıktısına ya da PR'a dayanıyor; tahmin yok.
- [ ] Plandan sapmalar ◐ ile ve gerekçesiyle işaretli.
- [ ] Telefon testi henüz yapılmadıysa raporda “bekliyor” yazıyor; yapılmış gibi sunulmadı.
- [ ] Ekran görüntülerinde gerçek kişi verisi yok (yalnız seed).

## Bilinen tuzaklar
- Ekran görüntüleri PM turlarından gelir (`pm-handoff/kanit/tur-*`); rapora kopyalanırken boyut
  küçültülür. Güncel değilse kapanışta bir tur yapılır.
- `pnpm test:e2e` geliştirme sunucusu ister; başka worktree'nin sunucusunu kullanma, kendi
  `.env.local` portunu kullan.
- Headless Chrome PDF'i yazdıktan sonra asılı kalabilir; çıkış koduna değil dosya boyutuna ve
  `pdfinfo`'ya bak.
