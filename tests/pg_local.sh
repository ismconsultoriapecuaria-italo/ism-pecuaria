#!/bin/sh
# Liga (se preciso) um Postgres 16 local para os testes. Uso: . tests/pg_local.sh
PGDIR=${PGDIR:-/tmp/claude-0/-home-claude/412815ac-f85b-5792-88f1-05654d9effae/scratchpad/pg}
export PGHOST=$PGDIR PGPORT=5433 PGUSER=postgres
chmod o+x /tmp/claude-0 2>/dev/null
if ! pg_isready -q 2>/dev/null; then
  su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D $PGDIR/data -o '-p 5433 -k $PGDIR' -l $PGDIR/log start" >/dev/null
  sleep 2
fi
