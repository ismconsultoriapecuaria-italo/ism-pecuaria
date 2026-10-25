-- =====================================================================
-- ISM Pecuária · 009 · atividades que se repetem toda semana
-- A atividade guarda os dias da semana em extra.rec (0 = domingo … 6 = sábado).
-- Quando alguém marca como concluída, o banco registra a data (extra.ult),
-- conta mais uma vez feita (extra.feitas) e a devolve "a fazer" com o prazo no
-- próximo dia marcado. Funciona até para quem só muda a situação (vaqueiro).
-- Rode uma vez no SQL Editor.
-- =====================================================================
create or replace function public.tg_atividade_rotina() returns trigger
language plpgsql as $$
declare dias int[]; base date; d date; i int; feito date;
begin
  if new.situacao = 2 and coalesce(old.situacao, 0) <> 2 and new.excluido_em is null
     and jsonb_typeof(new.extra -> 'rec') = 'array' and jsonb_array_length(new.extra -> 'rec') > 0 then
    select array_agg(x::int) into dias from jsonb_array_elements_text(new.extra -> 'rec') x;
    feito := coalesce(new.concluida_em, current_date);
    -- feita antes do prazo: a próxima é depois do prazo; feita atrasada: a próxima é depois de hoje
    base := greatest(coalesce(new.prazo, feito), feito);
    for i in 1..7 loop
      d := base + i;
      exit when extract(dow from d)::int = any(dias);
    end loop;
    new.extra := new.extra || jsonb_build_object('ult', feito, 'feitas', coalesce((new.extra ->> 'feitas')::int, 0) + 1);
    new.prazo := d; new.situacao := 0; new.concluida_em := null;
  end if;
  return new;
end $$;
-- o nome começa com "rotina" para rodar depois da conferência de quem pode mudar o quê (atividades_responsavel)
drop trigger if exists atividades_rotina on public.atividades;
create trigger atividades_rotina before update on public.atividades for each row execute function public.tg_atividade_rotina();
