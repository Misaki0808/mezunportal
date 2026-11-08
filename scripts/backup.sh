#!/bin/sh
# Durdurulmuş web/worker için tutarlı PostgreSQL + dosya yedeği. Var olan yedeğin üstüne yazmaz.
set -eu
umask 077
: "${DATABASE_URL:?DATABASE_URL gerekli}"
: "${STORAGE_LOCAL_PATH:?STORAGE_LOCAL_PATH gerekli}"
backup_dir=${1:?Kullanım: backup.sh YENI_YEDEK_DIZINI}
[ ! -e "$backup_dir" ] || { echo 'Yedek dizini zaten var' >&2; exit 1; }
[ -d "$STORAGE_LOCAL_PATH" ] || { echo 'Dosya hacmi bulunamadı' >&2; exit 1; }
mkdir -m 700 "$backup_dir"
trap 'rm -f "$backup_dir/database.dump.partial" "$backup_dir/files.tar.gz.partial"' EXIT HUP INT TERM
node "$(dirname "$0")/postgres-connection.mjs" source pg_dump --format=custom --no-owner --no-acl > "$backup_dir/database.dump.partial"
tar -C "$STORAGE_LOCAL_PATH" -czf "$backup_dir/files.tar.gz.partial" .
mv "$backup_dir/database.dump.partial" "$backup_dir/database.dump"
mv "$backup_dir/files.tar.gz.partial" "$backup_dir/files.tar.gz"
if command -v sha256sum >/dev/null 2>&1; then
  (cd "$backup_dir" && sha256sum database.dump files.tar.gz > SHA256SUMS)
else
  (cd "$backup_dir" && shasum -a 256 database.dump files.tar.gz > SHA256SUMS)
fi
trap - EXIT HUP INT TERM
