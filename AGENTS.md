# AGENTS.md — MezunPortal çalışma sözleşmesi

Bu dosya repoda çalışan bütün kod ajanları için kök talimattır. Alt dizinde daha özel bir
`AGENTS.md` yoksa bütün repo için geçerlidir. Son doğrulama: **2026-11-07**.

MezunPortal, İstanbul Üniversitesi öğrencileri, mezunları ve akademisyenleri için
doğrulanmış, staj odaklı kariyer platformudur (bitirme projesi; pilot bölüm YBS). Ürünün
amacı `README.md`'de, güncel durum ve açık işler `BACKLOG.md`'dedir.

## 1. Doğruluk sırası

Bir çelişkide şu sıra kullanılır:

1. **“Ne var?” sorusunda:** çalışan kod, testler, Prisma şeması ve migration'lar
2. **“Ne olmalı?” sorusunda:** kullanıcının/hocanın yazılı kararı (kartta tırnak içinde) →
   aktif faz planı (`docs/fazN-plan.md`) → `README.md` (ürün çerçevesi)
3. Bu dosyadaki güvenlik ve çalışma kuralları
4. `BACKLOG.md` — güncel durum, açık işler ve açık kararlar
5. Konuya özel `docs/` belgesi

Kod henüz yokken (Faz 0 başı) plan ve belgeler yön verir. Kod ile plan çeliştiğinde rol
tahmin etmez; `PM KARAR BEKLİYOR` ile bildirir. Tamamlanmış işlerin kaynağı Git geçmişidir.

## 2. Göreve göre belge oku

Bütün Markdown dosyalarını topluca okuma. Önce bu dosyayı, görev kartını ve ilgili kodu
incele; yalnız ihtiyaç duyulan belgeyi aç.

| Görev | Ek kaynak |
|---|---|
| Güncel durum / sıradaki iş / açık karar | `BACKLOG.md`, aktif `docs/fazN-plan.md` |
| Ürün kapsamı veya iş kuralı | `README.md` |
| Mimari, akışlar (kimlik, CV, randevu, SSS, puan, işler), dış servisler | `docs/architecture.md` |
| Veri modeli, migration, değişmezler | `docs/data.md`, `prisma/schema.prisma` |
| Yetki, KVKK, dosya, yapay zekâ güvenliği, log | `docs/security.md` |
| Stack, sürüm tuzakları, test, yerel ortam, env, telefon testi, commit/PR | `docs/engineering.md`, `.env.example` |
| Arayüz tasarımı, mobil, erişilebilirlik, arayüz terimleri | `docs/design.md` |
| Bir kararın gerekçesi | `docs/decisions.md` |
| Hukuki metin taslakları | `docs/legal-drafts.md` |
| Faz kapanışı (rapor, plan↔yapılan, telefon testi) | `faz-kapanis` skill'i (`.agents/skills/faz-kapanis/SKILL.md`) |

## 3. Değişiklik kuralları

- Önce mevcut davranışı kod ve testten doğrula; belge metninden özellik varmış gibi sonuç
  çıkarma.
- Kullanıcının kirli çalışma ağacını ve ilgisiz dosyalarını koru.
- Yeni bağımlılık, dış servis, environment değişkeni ya da veri silen/değiştiren migration için
  kapsamı ve riski açıkça yaz; açık yetki yoksa onay iste. Ücret ya da hesap gerektiren şey
  her zaman kullanıcıya gider.
- Yeni env eklenirse `.env.example`, env doğrulaması (`src/lib/env.ts`) ve `docs/engineering.md`
  “Yerel ortam” birlikte güncellenir.
- Prisma'da ekleyici migration tercih edilir. Şema yalnız `prisma migrate dev` (yerel) ve
  `prisma migrate deploy` (canlı) ile değişir.
- **Kod tanımlayıcıları İngilizce**; arayüz metni Türkçe ve yalnız `messages/tr.json`'da;
  belgeler, commit ve PR Türkçe.
- Sır, jeton, parola, CV içeriği, belge, LLM girdi/çıktısı ve kişisel veri loglanmaz, repoya
  yazılmaz.
- Kullanıcıya dönen hata kararlı bir `errorCode` taşır (`src/lib/errors.ts` yardımcıları); kod
  `messages/tr.json` `errors.codes` altına eklenir. Bekçi testi: kayıt ↔ metin eşleşmesi.
- Kimlik, rol ve yetki istemci girdisinden güvenilir kabul edilmez; her sunucu eylemi ve rota
  önce yetkiyi kontrol eder (`src/server/permissions`).
- Kapsam dışı ürünler hiçbir kartla yapılmaz: canlı sohbet/websocket, chatbot, ayrı mobil
  uygulama, konaklama, dönemlik mentorluk programı, şirket puanlama, LinkedIn kazıma.

## 4. Frontend ve metin

- Next.js App Router; tek dil Türkçe, URL'de dil öneki yok (next-intl).
- Yeni kullanıcı metni `messages/tr.json`'a eklenir; bileşende sabit metin yok.
- Hata ekrana ham `err.message` ile basılmaz; `errorCode` → metin kataloğu üzerinden gösterilir.
- Mobil öncelikli: 360 px'ten başlanır; ayrıntı `docs/design.md`.
- Tasarım token'larının kanonik kaynağı `src/app/globals.css`'tir; bileşenler
  `src/components/ui`'den gelir.

## 5. Doğrulama

Değişiklik riskine göre en dar ilgili kapıdan başlayıp gerektiğinde genişlet:

```bash
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm messages:check
pnpm prisma validate
pnpm build
pnpm test:e2e        # çekirdek akış testleri; CI'da yalnız main'e birleşmede
```

Şema değiştiyse önce `pnpm prisma generate`. Beklenmedik yerde kırmızı görürsen kovalamadan önce
kök `pnpm typecheck` koş (üretilmiş Prisma istemcisi tuzağı, `docs/engineering.md`). Koşmayan
kapıyı açıkça söyle.

## 6. Dokümantasyon disiplini

- **Yeni `.md` dosyası açılmaz** (yeni fazın planı `docs/fazN-plan.md` hariç). Belge sayısı
  bilinçli olarak az tutulur; yeni bilgi mevcut belgedeki doğru bölüme yazılır. Yeni dosya
  gerçekten gerekiyorsa `PM KARAR BEKLİYOR`.
- `BACKLOG.md` “Güncel durum”a oturum günlüğü veya commit kronolojisi eklenmez; yalnız güncel
  gerçek ve yakın hedef tutulur. Tamamlanan madde silinir; geçmiş Git'tedir.
- Bir PR “neden” içeren bir karar getiriyorsa (kütüphane seçimi, kural değişikliği, kapsamdan
  çıkarma) aynı PR'da `docs/decisions.md`'ye kısa kayıt eklenir.
- Şema, route, env listesini belgeye kopyalama; kanonik dosyaya yönlendir. Belge yalnız
  dayanıklı kavramı ve kritik istisnayı açıklar.
- Faz planı faz kapanınca silinmez; kapanış notu eklenir ve “tamamlandı” işaretlenir (bitirme
  raporunun kaynağıdır). Kalıcı kural ilgili ana belgeye taşınır.
- Bir belgeyi değiştirince iç bağlantıları ve geçersiz dosya adlarını `rg` ile tara.
