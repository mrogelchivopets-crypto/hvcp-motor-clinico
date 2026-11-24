-- ═══════════════════════════════════════════════════════════════
-- 07 · Segunda base de confirmación del cierre (motor v7.9.7)
-- El motor permite marcar hasta 2 bases de confirmación (conf y conf2). Hasta ahora la base
-- solo guardaba conf: conf2 se perdía. Los cierres anteriores quedan con confirmacion2 vacía.
-- La confirmación es objetiva si conf o conf2 es histo, lab, img o qx.
-- Las radiografías nuevas (tests.rxa, rxcab, rxcad) ya se guardan: tests se guarda completo.
-- ═══════════════════════════════════════════════════════════════

alter table public.cierres add column if not exists confirmacion2 text
  check (confirmacion2 is null or confirmacion2 in ('histo','lab','img','qx','resp','clin'));

-- guardar_cierre: igual que en 02, más confirmacion2 (p.conf2)
create or replace function public.guardar_cierre(p_codigo text, p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare u uuid := public._exigir_sesion(); c public.casos%rowtype; k public.cierres%rowtype; dx jsonb := p->'dx';
begin
  if pg_column_size(p) > 16384 then raise exception 'cierre_muy_grande' using errcode = 'P0001'; end if;
  select * into c from public.casos where codigo = upper(coalesce(p_codigo,'')) and not anulado;
  if not found then raise exception 'caso_no_encontrado' using errcode = 'P0001'; end if;
  if jsonb_typeof(dx) = 'object' and coalesce(p->>'conf','') = '' then
    raise exception 'falta_confirmacion' using errcode = 'P0001';
  end if;

  insert into public.cierres as x (caso, usuario, fecha, dx_codigo, dx_nombre, dx_capitulo, dx_nuevo, sin_dx, confirmacion, confirmacion2, concomitantes, labs, tests, otros, notas)
  values (c.id, u, now(),
    case when jsonb_typeof(dx) = 'object' then nullif(left(dx->>'c',40),'') end,
    case when jsonb_typeof(dx) = 'object' then left(dx->>'n',120) end,
    case when jsonb_typeof(dx) = 'object' then nullif(left(dx->>'cap',4),'') end,
    case when jsonb_typeof(dx) = 'object' then coalesce((dx->>'nuevo')::boolean,false) else false end,
    coalesce((p->>'sinDx')::boolean,false) and jsonb_typeof(dx) is distinct from 'object',
    nullif(p->>'conf',''),
    -- Segunda base (opcional): solo si hay primera y es distinta.
    case when nullif(p->>'conf','') is not null and nullif(p->>'conf2','') is distinct from nullif(p->>'conf','') then nullif(p->>'conf2','') end,
    public._arr(p->'con',20), public._obj(p->'labs'), public._obj(p->'tests'),
    left(p->>'otros',300), left(p->>'notas',600))
  on conflict (caso) do update set
    usuario = excluded.usuario, fecha = excluded.fecha, dx_codigo = excluded.dx_codigo, dx_nombre = excluded.dx_nombre,
    dx_capitulo = excluded.dx_capitulo, dx_nuevo = excluded.dx_nuevo, sin_dx = excluded.sin_dx,
    confirmacion = excluded.confirmacion, confirmacion2 = excluded.confirmacion2, concomitantes = excluded.concomitantes, labs = excluded.labs,
    tests = excluded.tests, otros = excluded.otros, notas = excluded.notas
  returning * into k;

  insert into public.cierres_hist (caso, usuario, datos) values (c.id, u, to_jsonb(k));
  insert into public.eventos (usuario, caso, tipo) values (u, c.id, 'cerrar_caso');
  return public._cierre_json(k);
end $$;

-- _cierre_json: igual que en 02, más conf2 (ausente si no hay segunda base)
create or replace function public._cierre_json(k public.cierres)
returns jsonb language sql stable set search_path = '' as $$
  select case when k.caso is null then null else jsonb_strip_nulls(jsonb_build_object(
    'dx', case when k.dx_nombre is null then null else jsonb_build_object('c', coalesce(k.dx_codigo,''), 'n', k.dx_nombre, 'cap', coalesce(k.dx_capitulo,''), 'nuevo', k.dx_nuevo) end,
    'con', k.concomitantes, 'sinDx', k.sin_dx, 'conf', coalesce(k.confirmacion,''), 'conf2', k.confirmacion2,
    'labs', k.labs, 'tests', k.tests, 'otros', coalesce(k.otros,''), 'notas', coalesce(k.notas,''),
    'fc', k.fecha, 'por', k.usuario)) end;
$$;

-- Acierto con confirmación objetiva: cuenta conf o conf2
create or replace view public.v_acierto_casos with (security_invoker = on) as
  select c.dia, c.codigo, c.usuario, k.dx_codigo, k.confirmacion,
         (k.confirmacion in ('histo','lab','img','qx') or coalesce(k.confirmacion2 in ('histo','lab','img','qx'), false)) as confirmacion_objetiva,
         (c.top->0->>'c') = k.dx_codigo as top1,
         exists (select 1 from jsonb_array_elements(c.top) with ordinality t(x, i) where i <= 3 and t.x->>'c' = k.dx_codigo) as top3,
         c.soap_dx ? k.dx_codigo as acierto_soap
  from public.v_casos_validos c
  join public.cierres k on k.caso = c.id
  where k.dx_nombre is not null and k.confirmacion is not null;
