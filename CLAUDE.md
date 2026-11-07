# CLAUDE.md

Claude ile çalışırken önce kökteki **`AGENTS.md` dosyasını eksiksiz oku ve uygula**.
Bu dosya yalnız Claude giriş noktasıdır; proje kurallarını çoğaltmaz.

@AGENTS.md

## Başlangıç sırası

1. `AGENTS.md`
2. Rol çalışıyorsan: Git dışı `prompts/README.md` ve kendi rol dosyan, sonra görev kartın
3. Görev güncel durum veya planlama gerektiriyorsa `BACKLOG.md` ve aktif `docs/fazN-plan.md`
4. `AGENTS.md §2` tablosundaki yalnız konuya özel belge
5. Değiştirilecek kod, test ve config

## Claude'a özgü notlar

- Bütün Markdown dosyalarını topluca okuma; yalnız görevin gerektirdiği belgeyi aç.
- `.agents/skills/faz-kapanis/SKILL.md` yalnız bir faz bittiğinde kapanış paketi istendiğinde
  yüklenir.
- Alt ajan açılmaz (rol protokolü).
- Koddan doğrulanmayan `BACKLOG.md` kaydını veya plan tahminini güncel gerçek kabul etme.
- Oturum sonunda kalıcı sonucu doğru ana belgeye işle; çalışma günlüğü üretme.
