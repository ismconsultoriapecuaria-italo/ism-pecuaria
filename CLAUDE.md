# ISM Pecuária — guia para o Claude Code

App PWA (Android) de gestão de fazendas da ISM Consultoria Pecuária. Desenvolvedor: Italo (ISM). Fale sempre em português do Brasil, nunca mande nada em inglês para o usuário.

## Arquitetura
- `app/` é estático, sem build e sem dependências npm. Publicado no GitHub Pages (`.github/workflows/publicar.yml`).
  - `js/config.js`: URL e chave anon do Supabase.
  - `js/cofre.js`: IndexedDB cifrado (AES-GCM, chave não exportável) + resumo PBKDF2 da senha para entrar sem internet.
  - `js/nuvem.js`: Supabase Auth/REST via fetch (login, MFA TOTP, PostgREST). PATCH pede `return=representation` e trata 0 linhas como recusa (RLS).
  - `js/sinc.js`: fila de envio, recebimento incremental por `atualizado_em`, e tradução documento das telas ⇄ tabelas. Expõe `Sinc.db` com a mesma interface `collection().onSnapshot` / `doc().set/delete` do protótipo.
  - `js/ponte.js`: `window.claude.use('db'|'downloads')` para as telas.
  - `js/entrada.js`: login, duas etapas, escolha de fazenda, perfis/permissões (tabela `permissoes` → nomes usados nas telas), modo aparelho compartilhado, menu Conta. Carrega `js/telas.js` só depois.
  - `js/telas.js`: telas vindas do protótipo aprovado (financeiro, manejo/romaneios, rebanho, suplemento, atividades, mapa, importação). Variáveis globais: `A` (animais), `R` (romaneios), `C` (coleções), `USER`, `can()`.
- `supabase/migrations/001_estrutura.sql` e `002_regras_de_acesso.sql`: tabelas, RLS por perfil (`pode(cliente, acao)`), MFA (aal2) para ISM/Proprietário/Administrativo, auditoria, exclusão lógica, valor de venda em `vendas_valor` (vaqueiro não lê).
- Multi-cliente: `clientes.modulos` = pacote de abas; marca/mapa/caixa por cliente na tabela `painel`.

## Regras de negócio (decididas com o usuário)
- Só a ISM cria e bloqueia usuários (via dashboard + `vincular_usuario` / `bloquear_usuario`).
- Proprietário e administrativo lançam tudo; caixa só a ISM corrige. Corrigir romaneio: ISM, administrativo, proprietário.
- Vaqueiro vê preço por cabeça e valor da @, não vê totais de venda.
- Serviços gerais: cocho, fábrica, atividades operacionais; sem rebanho.
- Atividades: estratégico só ISM/Proprietário; tático também Administrativo/Gerente; operacional todos. Quem não gerencia só muda a situação das próprias.
- Categoria por peso: <300 Bezerro, <400 Garrote, <480 Boi magro, ≥480 Boi gordo. @ = peso ÷ 30.

## Testes
- `tests/testar_acesso.py`: regras de acesso no Postgres (precisa de `tests/supabase_simulado.sql` + migrations + `tests/dados_teste.sql`).
- `tests/servidor_simulado.py` + `tests/testar_app.py`: app real no Chromium contra imitação do Supabase (código MFA de teste: 123456). Prepare com `tests/preparar_banco_e2e.sh`.
- Ao mudar o app, aumente `app/js/versao.js` (renova o cache do service worker).
