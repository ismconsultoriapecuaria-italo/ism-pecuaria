-- Pessoas e dados de exemplo para os testes de acesso
insert into auth.users (id, email) values
 ('00000000-0000-0000-0000-000000000001','italo@ism.app'),
 ('00000000-0000-0000-0000-000000000002','wilmington@barramas.ism'),
 ('00000000-0000-0000-0000-000000000003','josiane@barramas.ism'),
 ('00000000-0000-0000-0000-000000000004','genisval@barramas.ism'),
 ('00000000-0000-0000-0000-000000000005','francisco@barramas.ism'),
 ('00000000-0000-0000-0000-000000000006','wemerson@barramas.ism'),
 ('00000000-0000-0000-0000-000000000009','estranho@outra.ism');
insert into public.clientes (id, nome, modulos) values
 ('10000000-0000-0000-0000-000000000001','Fazenda Barramas','{financeiro,rebanho,suplemento,atividades,mapa}'),
 ('10000000-0000-0000-0000-000000000002','Fazenda Outra','{rebanho}');
select public.vincular_usuario('italo@ism.app','Fazenda Barramas','Italo','Consultor','{ISM}');
select public.vincular_usuario('wilmington@barramas.ism','Fazenda Barramas','Wilmington','Proprietário','{Proprietário}');
select public.vincular_usuario('josiane@barramas.ism','Fazenda Barramas','Josiane','Administrativo','{Administrativo}');
select public.vincular_usuario('genisval@barramas.ism','Fazenda Barramas','Genisval','Vaqueiro','{Vaqueiro}');
select public.vincular_usuario('francisco@barramas.ism','Fazenda Barramas','Francisco','Serviços gerais','{Serviços gerais}');
select public.vincular_usuario('wemerson@barramas.ism','Fazenda Barramas','Wemerson','Tratorista','{Vaqueiro,Serviços gerais}');
select public.vincular_usuario('estranho@outra.ism','Fazenda Outra','Estranho','Proprietário','{Proprietário}');

insert into public.animais (id, cliente_id, brinco, ent_data, ent_peso, preco_compra)
values ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','1001','2026-01-10',250,2500),
       ('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','1002','2026-01-10',260,2500),
       ('20000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000002','9001','2026-01-10',300,3000);
insert into public.financeiro (cliente_id, data, tipo, grupo, item, valor)
values ('10000000-0000-0000-0000-000000000001','2026-02-01','Despesa','PESSOAL','Salário',3000);
insert into public.atividades (id, cliente_id, titulo, nivel, responsaveis) values
 ('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Plano de safra','Estratégico','{Wilmington}'),
 ('30000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','Escala de pesagem','Tático','{Josiane}'),
 ('30000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','Consertar cerca','Operacional','{Francisco}'),
 ('30000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000001','Limpar bebedouro','Operacional','{Genisval}');
insert into public.pastos (cliente_id, cod, nome) values ('10000000-0000-0000-0000-000000000001','P01','Pasto 1');
insert into public.painel (cliente_id, chave, dados) values
 ('10000000-0000-0000-0000-000000000001','marca','{"subtitulo":"x"}'),
 ('10000000-0000-0000-0000-000000000001','D','{"m":[]}');
