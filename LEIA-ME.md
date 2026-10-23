# ISM Pecuária

App de gestão de fazendas de recria e engorda da ISM Consultoria Pecuária. Funciona no celular Android como aplicativo instalado (PWA), sem precisar da Play Store, e continua funcionando sem internet.

- **Nuvem:** Supabase. É um banco Postgres com login, e fica em São Paulo.
- **Site do app:** GitHub Pages, que é gratuito.
- **No aparelho:** os dados ficam guardados e cifrados. Os lançamentos feitos sem sinal sobem sozinhos quando a internet volta.

## O que tem aqui

| Pasta | O que é |
|---|---|
| `app/` | O app que vai para o celular: telas, login, sincronização, ícones |
| `supabase/migrations/` | Estrutura do banco (`001`) e regras de acesso por perfil (`002`) |
| `supabase/carga/` | Dados da Fazenda Barramas que estavam no protótipo (`barramas.sql`) e ligação das pessoas (`usuarios_barramas.sql`) |
| `tests/` | Testes automáticos das regras de acesso e do app no navegador |
| `ferramentas/` | Scripts usados para gerar o app e a carga a partir do protótipo |
| `.github/workflows/` | Publicação automática no GitHub Pages e testes a cada envio |

## Passo a passo para colocar no ar

### 1. Criar o banco no Supabase (uns 15 minutos)

1. Crie uma conta em https://supabase.com e clique em **New project**.
   - **Name:** `ism-pecuaria`.
   - **Region:** **South America (São Paulo)**.
   - Crie uma senha forte para o banco e guarde num lugar seguro.
2. Recomendado: plano **Pro** (US$ 25 por mês). Ele traz backup diário e não pausa o projeto. O plano grátis pausa o projeto depois de uma semana sem uso.
3. No menu, abra **SQL Editor > New query**. Cole e rode (**Run**), um de cada vez e nesta ordem:
   1. `supabase/migrations/001_estrutura.sql`
   2. `supabase/migrations/002_regras_de_acesso.sql`
   3. As 8 partes da carga da Barramas, em ordem: `supabase/carga/partes/barramas_01.sql` até `barramas_08.sql`. O arquivo único `barramas.sql` tem o mesmo conteúdo, para quem usa o terminal.
4. Em **Authentication > Sign In / Providers > Email**:
   - Deixe **Email** ligado.
   - Desligue **Confirm email**: os logins usam e-mails internos, que ninguém vai abrir.
5. Em **Authentication > Multi-Factor**, deixe **TOTP** ligado. Ele já vem ligado.

### 2. Criar as pessoas

1. Em **Authentication > Users > Add user > Create new user**, crie cada pessoa abaixo.
   - Use o e-mail da tabela e uma senha provisória (pelo menos 8 caracteres).
   - Marque **Auto Confirm User**.

   | Pessoa | Login no app | E-mail no Supabase |
   |---|---|---|
   | Italo | `italo` | italo@ismpecuaria.app |
   | Wilmington | `wilmington` | wilmington@ismpecuaria.app |
   | Josiane | `josiane` | josiane@ismpecuaria.app |
   | Genisval | `genisval` | genisval@ismpecuaria.app |
   | Alessandro | `alessandro` | alessandro@ismpecuaria.app |
   | Wemerson | `wemerson` | wemerson@ismpecuaria.app |
   | Wemerson (Bebê) | `wemerson.bebe` | wemerson.bebe@ismpecuaria.app |
   | Francisco | `francisco` | francisco@ismpecuaria.app |

2. Rode no SQL Editor o arquivo `supabase/carga/usuarios_barramas.sql`. É ele que liga cada pessoa ao perfil dela.

> No app, a pessoa digita só o login (ex.: `genisval`); o app completa o e-mail sozinho. Cada um pode trocar a própria senha no botão **Conta**.

### 3. Ligar o app ao banco

1. No Supabase, abra **Project Settings > API** e copie dois valores:
   - a **Project URL**;
   - a chave **anon public**.
2. Abra `app/js/config.js` e cole esses valores no lugar de `SEU-PROJETO` e `COLE-AQUI`.

A chave anon pode ficar no app sem problema: quem protege os dados são as regras de acesso do banco. Já a chave **service_role** nunca deve ir para o app.

### 4. Publicar no GitHub Pages (uns 10 minutos)

1. Crie uma conta em https://github.com.
2. Crie um repositório **privado** chamado `ism-pecuaria`.
3. Envie esta pasta inteira. O jeito mais simples é arrastar os arquivos em **Add file > Upload files**. Quem usa o Git pode fazer `git push` (a pasta já é um repositório Git).
4. No repositório, abra **Settings > Pages > Source** e escolha **GitHub Actions**.
5. A cada envio, o app é publicado sozinho em `https://SEU-USUARIO.github.io/ism-pecuaria/`.

GitHub Pages em repositório privado exige o plano GitHub Pro (US$ 4 por mês). Com repositório público é grátis. Os dados continuam protegidos mesmo assim: no repositório só fica o código, os dados ficam no Supabase.

### 5. Instalar nos celulares Android

1. Abra o endereço do app no **Chrome**.
2. Toque no menu **⋮** e depois em **Instalar app** (ou **Adicionar à tela inicial**).
3. Entre uma vez com internet. Isso baixa os dados da fazenda para o aparelho. Depois disso, o app abre e lança sem sinal.

No **tablet compartilhado** da fazenda, marque **Aparelho compartilhado** na tela de entrada:

- o app pede a senha toda vez que alguém entra;
- o app sai sozinho depois de 15 minutos parado;
- quem já entrou uma vez naquele tablet consegue entrar mesmo sem internet.

## Perfis e o que cada um faz

As regras ficam no banco: mesmo que alguém mexa no app, o banco recusa o que o perfil não pode.

| Perfil | Financeiro | Rebanho e manejo | Suplemento | Atividades |
|---|---|---|---|---|
| ISM | vê, lança e corrige | tudo, importa planilhas | tudo | todas |
| Proprietário | vê e lança (não corrige) | tudo, corrige romaneios | tudo | todas |
| Administrativo | vê e lança (não corrige) | tudo, corrige romaneios | tudo | tática e operacional |
| Gerente | — | lança, vê totais | tudo | tática e operacional |
| Vaqueiro | — | lança e vê; vê preço por cabeça e valor da @, **não vê totais de venda** | cocho e fábrica | operacional |
| Serviços gerais / Fábrica de ração | — | — | cocho e fábrica | operacional |

Outras regras:

- **Verificação em duas etapas.** ISM, Proprietário e Administrativo precisam de um aplicativo autenticador, como o Google Authenticator. O app mostra o QR na primeira entrada. Para desligar essa exigência, rode:
  ```sql
  update config set valor = 'nao' where chave = 'exigir_mfa';
  ```
- **Nada é apagado de verdade.** Uma exclusão só marca o registro, e tudo que muda vai para a tabela `auditoria`, com quem mudou, quando, e o antes e o depois.

### Bloquear ou liberar alguém

Rode no SQL Editor:

```sql
select bloquear_usuario('Fazenda Barramas', 'Genisval');          -- bloqueia
select bloquear_usuario('Fazenda Barramas', 'Genisval', false);   -- libera de novo
```

Na próxima vez que a pessoa abrir o app com internet, o acesso é cortado e os dados daquela fazenda são apagados do aparelho dela.

### Novo cliente

1. Crie o cliente:
   ```sql
   insert into clientes (nome, tipo, modulos) values ('Fazenda Nova', 'fazenda', '{rebanho,suplemento,atividades}');
   ```
   - `modulos` define o **pacote**. As opções são `financeiro`, `rebanho`, `suplemento`, `atividades` e `mapa`; as abas aparecem conforme o que estiver na lista.
   - `tipo` pode ser `fazenda` ou `corretor`.
2. Crie as pessoas em **Authentication** e rode `vincular_usuario` para cada uma:
   ```sql
   select vincular_usuario('fulano@ismpecuaria.app', 'Fazenda Nova', 'Fulano', 'Vaqueiro', '{Vaqueiro}');
   ```
3. Logo, mapa e painel do caixa são opcionais. Ficam na tabela `painel`, com as chaves `marca`, `mapa`, `D`, `V` e `SUP`; para ver o formato, olhe a Barramas.

## Atualizar o app

1. Altere os arquivos em `app/`.
2. Aumente o número em `app/js/versao.js`.
3. Envie para o GitHub. Os celulares pegam a versão nova na próxima vez que abrirem o app com internet.

## Testes

Os testes rodam sozinhos no GitHub a cada envio (aba **Actions**). Para rodar no seu computador, você precisa do Postgres 16 e do Python 3 (com Playwright, no teste do navegador):

```sh
sh tests/preparar_banco_e2e.sh                  # banco local com a Barramas
python3 tests/servidor_simulado.py 8790 e2e &   # imita o Supabase
python3 tests/testar_app.py e2e                 # abre o app no navegador e testa 36 situações
```

Também dá para testar só as regras de acesso: são 53 casos, perfil por perfil, em `tests/testar_acesso.py`.

## Custos

| Item | Custo |
|---|---|
| Supabase Pro | US$ 25 por mês (backup diário de 7 dias incluso) |
| GitHub | grátis com repositório público; US$ 4 por mês para Pages em repositório privado |
| Domínio próprio (opcional, ex.: app.ismpecuaria.com.br) | cerca de R$ 40 por ano |
| Play Store (quando for expandir) | US$ 25, pagos uma vez |

## Arquivo grande demais no SQL Editor

Se o `barramas.sql` não couber no editor, tem duas saídas.

- **Pelo terminal.** Use a "connection string" de **Project Settings > Database**:
  ```sh
  psql "postgresql://postgres:SENHA@db.SEU-PROJETO.supabase.co:5432/postgres" -f supabase/carga/barramas.sql
  ```
- **Pelo app.** Entre como ISM, abra **Importar** e envie as planilhas de animais, pesagem e venda.

## Cópia de segurança semanal

Todo domingo de madrugada, o GitHub tira uma cópia completa do banco: as pessoas e os logins, mais todos os dados do app. A cópia é **cifrada com uma senha que só você tem** e fica guardada por 90 dias na aba **Actions > Copia de seguranca**. Sem a senha, o arquivo não serve para nada.

### Ligar a cópia (uma vez só)

1. **Pegue o endereço do banco.**
   - No Supabase, clique em **Connect** (no topo do projeto) e escolha **Session pooler**.
   - Copie o endereço, que é parecido com `postgresql://postgres.SEUPROJETO:[YOUR-PASSWORD]@aws-0-sa-east-1.pooler.supabase.com:5432/postgres`.
   - Troque `[YOUR-PASSWORD]` pela senha do banco, sem os colchetes.
2. **Cadastre o primeiro segredo no GitHub.**
   - No repositório, abra **Settings > Secrets and variables > Actions > New repository secret**.
   - Nome: `SUPABASE_DB_URL`. Valor: o endereço do passo 1.
3. **Cadastre o segundo segredo.**
   - Clique de novo em **New repository secret**.
   - Nome: `BACKUP_SENHA`. Valor: uma senha longa, inventada por você.
   - **Guarde essa senha fora do computador**, num papel ou num cofre de senhas. Sem ela, a cópia não abre.
4. **Teste.** Em **Actions > Copia de seguranca > Run workflow**, rode uma vez. Deve terminar em verde e mostrar um arquivo `copia-banco-…` para baixar.

### Restaurar (só em emergência)

1. Baixe a cópia do dia desejado em **Actions**.
2. Num computador com o Postgres instalado, rode:
   ```sh
   gpg -d ism-pecuaria-AAAA-MM-DD.sql.gz.gpg | gunzip > copia.sql
   psql "ENDERECO-DO-BANCO-NOVO" -f copia.sql
   ```
3. Funciona num projeto Supabase novo e vazio: entram as pessoas, os logins, as regras e os dados. Em caso de dúvida, peça ajuda ao Claude antes de rodar.

## Fazenda Demonstração (para apresentar a clientes)

- Rode uma vez no SQL Editor o arquivo `supabase/migrations/005_fazenda_demonstracao.sql`. Ele cria a "Fazenda Demonstração" com a operação da Barramas, mas com pessoas, fornecedores, compradores e lotes trocados e os valores em dinheiro 10% diferentes.
- No app, a ISM escolhe a fazenda ao entrar. Na demonstração aparece uma faixa amarela "dados fictícios". Em **Conta > Ver o app como**, dá para mostrar o app como proprietário, administrativo, vaqueiro ou serviços gerais.
- Para atualizar a demonstração com os dados mais recentes da Barramas: `select recriar_demonstracao();` (apaga o que foi lançado na demonstração e copia de novo).
