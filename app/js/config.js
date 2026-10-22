// Configuração do ISM Pecuária. Preencha com os dados do seu projeto Supabase
// (Project Settings > API). A chave "anon" é pública por natureza: quem protege
// os dados são as regras de acesso do banco.
window.ISM_CONFIG = {
  SUPABASE_URL: 'https://lnwhcarkcbbrtuydcnhd.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxud2hjYXJrY2JicnR1eWRjbmhkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI3MDM1NDgsImV4cCI6MjEwODI3OTU0OH0.fI3_SiNePj0C4oZ3YN-I-wD98n_iS7V831gjImN-F3s',
  // Logins sem "@" viram e-mail com este domínio (ex.: genisval -> genisval@ismpecuaria.app)
  DOMINIO_LOGIN: 'ismpecuaria.app',
  // Minutos parado até sair sozinho no modo "aparelho compartilhado"
  MINUTOS_INATIVO_COMPARTILHADO: 15,
  // Intervalo da sincronização automática, em segundos
  SEGUNDOS_SINCRONIA: 60
};
