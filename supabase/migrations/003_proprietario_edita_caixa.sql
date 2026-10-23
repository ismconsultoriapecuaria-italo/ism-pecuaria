-- =====================================================================
-- ISM Pecuária · 003 · o proprietário também corrige lançamentos do caixa
-- (decisão de 22/10/2026: ISM e proprietário editam qualquer lançamento).
-- Rode uma vez no SQL Editor.
-- =====================================================================
insert into public.permissoes (acao, perfil) values ('fin_editar', 'Proprietário') on conflict do nothing;
