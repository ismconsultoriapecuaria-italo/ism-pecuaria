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
- Proprietário e administrativo lançam tudo. ISM e proprietário editam qualquer lançamento (romaneios de entrada, pesagem, venda e morte, caixa, fábrica, cocho), em `js/edicao.js`; administrativo edita romaneios, fábrica e cocho, mas não o caixa (migração 003).
- Duas etapas: ISM decide por pessoa com `dispensar_duas_etapas(cliente, nome)` (migração 004). Josiane (Barramas) está dispensada desde 23/10/2026.
- Ações a mais por pessoa: `liberar_acao(cliente, nome, acao)` grava em `membros.extras` (migração 006); no app vira `USER.x`, somado em `can()`. Josiane (Barramas) edita o caixa (`fin_editar`) desde 24/10/2026.
- Caixa: centro → subcentro → item em listas em cascata (planilha de caixa `D.k` + lançamentos já feitos), com "Outro (digitar)" para item novo. Fornecedor e NF opcionais ficam em `extra` (`forn`, `nf`), também na importação (colunas Fornecedor e Nota fiscal).
- Cocho → caixa (migração 007, regime de competência): kg do cocho × preço da dieta vigente na data do trato vira um lançamento por mês e por dieta (Despesa · REBANHO CORTE · NUTRIÇÃO · <dieta>, `origem='cocho'`, `chave='cocho-AAAA-MM-<dieta>'`, data = 1º dia do mês), refeito por gatilho a cada trato e a cada preço. Compras de insumos não entram como despesa. Preços no painel (`precos_supl`), só a ISM muda (`definir_preco_dieta`, card "Preço das dietas" no Suplemento). Tratos antes do primeiro preço não geram despesa.
- Fazenda Demonstração (migração 005, `recriar_demonstracao()`): cópia da Barramas com nomes trocados e dinheiro ×0,9; módulo `demonstracao` liga a faixa amarela e o "Ver o app como" (só para ISM) no menu Conta. Nunca mostrar a Barramas a outros clientes.
- Vaqueiro vê preço por cabeça e valor da @, não vê totais de venda.
- Serviços gerais: cocho, fábrica, atividades operacionais; sem rebanho.
- Atividades: estratégico só ISM/Proprietário; tático também Administrativo/Gerente; operacional todos. Quem não gerencia só muda a situação das próprias.
- Categoria por peso: <300 Bezerro, <400 Garrote, <480 Boi magro, ≥480 Boi gordo. @ = peso ÷ 30.

## Testes
- `tests/testar_acesso.py`: regras de acesso no Postgres (precisa de `tests/supabase_simulado.sql` + migrations + `tests/dados_teste.sql`).
- `tests/servidor_simulado.py` + `tests/testar_app.py`: app real no Chromium contra imitação do Supabase (código MFA de teste: 123456). Prepare com `tests/preparar_banco_e2e.sh`.
- Ao mudar o app, aumente `app/js/versao.js` (renova o cache do service worker).
