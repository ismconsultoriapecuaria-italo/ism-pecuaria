#!/bin/sh
# Recria o banco "e2e": estrutura + regras + carga da Barramas + usuários de teste (senha: senha123)
cd "$(dirname "$0")/.." && . tests/pg_local.sh
P="psql -v ON_ERROR_STOP=1 -q"
$P -d postgres -c "drop database if exists e2e with (force)" -c "create database e2e"
for f in tests/supabase_simulado.sql supabase/migrations/001_estrutura.sql supabase/migrations/002_regras_de_acesso.sql supabase/migrations/003_proprietario_edita_caixa.sql supabase/migrations/004_dispensa_duas_etapas.sql supabase/migrations/006_permissao_por_pessoa.sql supabase/carga/barramas.sql; do $P -d e2e -f $f || exit 1; done
$P -d e2e -c "insert into auth.users (email, encrypted_password) select e || '@ismpecuaria.app', crypt('senha123', gen_salt('bf')) from unnest(array['italo','wilmington','josiane','genisval','alessandro','wemerson','wemerson.bebe','francisco']) e"
$P -d e2e -f supabase/carga/usuarios_barramas.sql > /dev/null
$P -d e2e -c "select public.liberar_acao('Fazenda Barramas', 'Josiane', 'fin_editar')" > /dev/null
echo "banco e2e pronto"
