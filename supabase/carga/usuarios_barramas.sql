-- =====================================================================
-- Liga as pessoas da Fazenda Barramas aos perfis do app.
-- ANTES: crie cada pessoa em Authentication > Users > Add user > Create new user,
-- com o e-mail abaixo, uma senha provisória e "Auto Confirm User" marcado.
-- Depois rode este arquivo no SQL Editor.
-- =====================================================================
select public.vincular_usuario('italo@ismpecuaria.app',        'Fazenda Barramas', 'Italo',           'Consultor',       '{ISM}');
select public.vincular_usuario('wilmington@ismpecuaria.app',   'Fazenda Barramas', 'Wilmington',      'Proprietário',    '{Proprietário}');
select public.vincular_usuario('josiane@ismpecuaria.app',      'Fazenda Barramas', 'Josiane',         'Administrativo',  '{Administrativo}');
select public.vincular_usuario('genisval@ismpecuaria.app',     'Fazenda Barramas', 'Genisval',        'Vaqueiro',        '{Vaqueiro}');
select public.vincular_usuario('alessandro@ismpecuaria.app',   'Fazenda Barramas', 'Alessandro',      'Vaqueiro',        '{Vaqueiro}');
select public.vincular_usuario('wemerson@ismpecuaria.app',     'Fazenda Barramas', 'Wemerson',        'Tratorista',      '{Vaqueiro,Serviços gerais}');
select public.vincular_usuario('wemerson.bebe@ismpecuaria.app','Fazenda Barramas', 'Wemerson (Bebê)', 'Serviços gerais', '{Serviços gerais}');
select public.vincular_usuario('francisco@ismpecuaria.app',    'Fazenda Barramas', 'Francisco',       'Serviços gerais', '{Serviços gerais}');
