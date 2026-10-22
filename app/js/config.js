// Configuração do ISM Pecuária. Preencha com os dados do seu projeto Supabase
// (Project Settings > API). A chave "anon" é pública por natureza: quem protege
// os dados são as regras de acesso do banco.
window.ISM_CONFIG = {
  SUPABASE_URL: 'https://SEU-PROJETO.supabase.co',
  SUPABASE_ANON_KEY: 'COLE-AQUI-A-CHAVE-ANON',
  // Logins sem "@" viram e-mail com este domínio (ex.: genisval -> genisval@ismpecuaria.app)
  DOMINIO_LOGIN: 'ismpecuaria.app',
  // Minutos parado até sair sozinho no modo "aparelho compartilhado"
  MINUTOS_INATIVO_COMPARTILHADO: 15,
  // Intervalo da sincronização automática, em segundos
  SEGUNDOS_SINCRONIA: 60
};
