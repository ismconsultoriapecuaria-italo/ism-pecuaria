#!/bin/sh
# Cópia de segurança cifrada do banco: logins (auth.users/identities, só dados) + tudo do app (esquema public).
# Uso: SUPABASE_DB_URL=... BACKUP_SENHA=... sh ferramentas/backup.sh <pasta-de-saída>
# Para restaurar, veja "Cópia de segurança" no LEIA-ME.md.
set -eu
SAIDA=${1:-.}
DATA=$(date -u +%Y-%m-%d)
ARQ="$SAIDA/ism-pecuaria-$DATA.sql.gz.gpg"
mkdir -p "$SAIDA"
{
  echo "-- ISM Pecuária · cópia de $DATA"
  pg_dump "$SUPABASE_DB_URL" --data-only --column-inserts --no-owner --no-privileges -t auth.users -t auth.identities
  pg_dump "$SUPABASE_DB_URL" --schema=public --no-owner --no-privileges --quote-all-identifiers | grep -v '^CREATE SCHEMA "public";$'
} | gzip -9 | gpg --batch --yes --pinentry-mode loopback --passphrase "$BACKUP_SENHA" --symmetric --cipher-algo AES256 -o "$ARQ"
echo "cópia gerada: $ARQ ($(du -h "$ARQ" | cut -f1))"
