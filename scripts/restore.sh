#!/bin/sh
# Yalnız boş hedefe geri yükler; var olan tablo veya dosyayı silmez.
set -eu
umask 077
: "${RESTORE_DATABASE_URL:?RESTORE_DATABASE_URL gerekli}"
: "${RESTORE_STORAGE_PATH:?RESTORE_STORAGE_PATH gerekli}"
backup_dir=${1:?Kullanım: restore.sh YEDEK_DIZINI}
[ -f "$backup_dir/SHA256SUMS" ] || { echo 'Yedek özeti bulunamadı' >&2; exit 1; }
if command -v sha256sum >/dev/null 2>&1; then
  (cd "$backup_dir" && sha256sum -c SHA256SUMS >/dev/null)
else
  (cd "$backup_dir" && shasum -a 256 -c SHA256SUMS >/dev/null)
fi
[ "${DATABASE_URL:-}" != "$RESTORE_DATABASE_URL" ] || { echo 'Kaynak ve hedef veritabanı aynı' >&2; exit 1; }
[ ! -e "$RESTORE_STORAGE_PATH" ] || { echo 'Hedef dosya yolu zaten var' >&2; exit 1; }
count=$(node "$(dirname "$0")/postgres-connection.mjs" target psql -Atqc "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%' AND c.relkind IN ('r','p','v','m','S','f')")
[ "$count" = 0 ] || { echo 'Hedef veritabanı boş değil' >&2; exit 1; }
# Arşiv yolu kaçışları ve sembolik bağlar kabul edilmez.
tar -tzf "$backup_dir/files.tar.gz" | awk '/^\// || /(^|\/)\.\.($|\/)/ { bad=1 } END { exit bad }'
tar -tvzf "$backup_dir/files.tar.gz" | awk 'substr($0,1,1) == "l" || substr($0,1,1) == "h" { bad=1 } END { exit bad }'
# pg_restore'un boş search_path ayarı, arama sütunlarının iç içe SQL fonksiyonlarında public'i
# gizler. Kendi güvenilir yedeğimizin SQL çıktısında yalnız ilk kurulum ayarından sonra ekle.
restore_sql=$(mktemp "${TMPDIR:-/tmp}/mezunportal-restore.XXXXXX")
restore_patched=$(mktemp "${TMPDIR:-/tmp}/mezunportal-restore.XXXXXX")
trap 'rm -f "$restore_sql" "$restore_patched"' EXIT HUP INT TERM
pg_restore --no-owner --no-acl -f - "$backup_dir/database.dump" > "$restore_sql"
awk '{ print; if (!done && index($0, "SELECT pg_catalog.set_config(")) { print "SET search_path = public, pg_catalog;"; done=1 } } END { if (!done) exit 1 }' "$restore_sql" > "$restore_patched"
mkdir -m 700 "$RESTORE_STORAGE_PATH"
node "$(dirname "$0")/postgres-connection.mjs" target psql -v ON_ERROR_STOP=1 -q < "$restore_patched"
tar -C "$RESTORE_STORAGE_PATH" -xzf "$backup_dir/files.tar.gz" --no-same-owner
