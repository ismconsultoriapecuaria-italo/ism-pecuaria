#!/bin/sh
# Reinicia o servidor simulado (porta 8790) usando o banco indicado
cd "$(dirname "$0")/.." && . tests/pg_local.sh
kill $(ps aux | grep '[s]ervidor_simulado.py 8790' | awk '{print $2}') 2>/dev/null
nohup python3 tests/servidor_simulado.py 8790 ${1:-e2e} > ${LOG:-/tmp/claude-0/-home-claude/412815ac-f85b-5792-88f1-05654d9effae/scratchpad/srv.log} 2>&1 &
sleep 1
