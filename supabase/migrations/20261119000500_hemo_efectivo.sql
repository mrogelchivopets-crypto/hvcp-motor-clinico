-- ═══════════════════════════════════════════════════════════════
-- 05 · Estado hemodinámico efectivo (motor v7.9.7)
-- El motor compara el estado hemodinámico que marcó el médico con las constantes
-- (FC, mucosas, TLLC, pulso, PAS) y puede analizar al paciente con otro estado.
-- Se guarda aparte para comparar ambos; «hemo» sigue siendo el que marcó el médico.
-- Casos anteriores a v7.9.7 e importados: hemo_efectivo queda vacío.
-- ═══════════════════════════════════════════════════════════════

alter table public.casos add column if not exists hemo_efectivo text;

-- registrar_caso: igual que en 02, más hemo_efectivo (ent.hemoEf)
create or replace function public.registrar_caso(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  u uuid := public._exigir_sesion();
  v_codigo text := p->>'id';
  e jsonb := public._obj(p->'ent');
  s jsonb := public._obj(p->'sal');
  v_creado timestamptz;
  v_peso numeric;
  v_min int;
  v_ses uuid;
  r public.casos%rowtype;
  n int;
begin
  if pg_column_size(p) > 65536 then raise exception 'caso_muy_grande' using errcode = 'P0001'; end if;
  if v_codigo is null or v_codigo !~ '^MC-[A-HJ-NP-Z2-9]{6}$' then raise exception 'codigo_invalido' using errcode = 'P0001'; end if;

  -- Fecha: la del motor (puede venir de la cola sin conexión), acotada a [-14 días, +5 min].
  begin v_creado := (p->>'f')::timestamptz; exception when others then v_creado := now(); end;
  if v_creado is null or v_creado > now() + interval '5 minutes' or v_creado < now() - interval '14 days' then v_creado := now(); end if;

  begin v_peso := nullif(e->>'peso','')::numeric; exception when others then v_peso := null; end;
  if v_peso is not null and (v_peso <= 0 or v_peso >= 200) then v_peso := null; end if;
  begin v_min := (p->>'min')::int; exception when others then v_min := null; end;
  if v_min is not null and (v_min < 0 or v_min > 1440) then v_min := null; end if;
  begin v_ses := (p->>'sesion')::uuid; exception when others then v_ses := null; end;
  if v_ses is not null and not exists (select 1 from public.sesiones where id = v_ses and usuario = u) then v_ses := null; end if;

  select * into r from public.casos where codigo = v_codigo;
  if found then
    if r.usuario <> u then raise exception 'codigo_ocupado' using errcode = 'P0001'; end if;
    if r.anulado then raise exception 'caso_anulado' using errcode = 'P0001'; end if;
  else
    -- Límite de frecuencia: 60 casos nuevos por dispositivo cada 10 minutos.
    select count(*) into n from public.casos where usuario = u and creado > now() - interval '10 minutes';
    if n >= 60 then raise exception 'demasiados_casos' using errcode = 'P0001'; end if;
  end if;

  insert into public.casos as c (
    codigo, usuario, sesion, creado, actualizado, version_motor,
    especie, edad, sexo, peso, hemo, hemo_efectivo, motivo, motivo2,
    signos, signos_todos, examen, respuestas, antecedentes, vacunacion,
    top, alta, soap_dx, soap_auto, insuficiente, sin_dx, faltan, q_visibles, q_pendientes,
    alertas, minutos_soap, prueba
  ) values (
    v_codigo, u, v_ses, v_creado, now(), left(coalesce(p->>'v','?'),20),
    nullif(e->>'esp',''), left(e->>'edad',10), left(e->>'sexo',10), v_peso, left(e->>'hemo',10), left(nullif(e->>'hemoEf',''),10),
    left(e->>'motivo',40), left(e->>'motivo2',40),
    public._arr(e->'signs'), public._arr(e->'signsAll'), public._obj(e->'ex'), public._obj(e->'ans'),
    public._arr(e->'hxs',30), public._arr(e->'vac',30),
    public._arr(s->'top',8), public._arr(s->'alta',8), public._arr(s->'soap',8),
    coalesce((s->>'soapAuto')::boolean, true), coalesce((s->>'insuf')::boolean, false),
    coalesce((s->>'sinDx')::boolean, false), public._arr(s->'faltan',30),
    coalesce((s->>'qVis')::int, 0), public._arr(s->'qPend'),
    public._arr(p->'alertas',40), v_min, coalesce((p->>'prueba')::boolean, false)
  )
  on conflict (codigo) do update set
    actualizado = now(), sesion = coalesce(excluded.sesion, c.sesion), version_motor = excluded.version_motor,
    especie = excluded.especie, edad = excluded.edad, sexo = excluded.sexo, peso = excluded.peso, hemo = excluded.hemo, hemo_efectivo = excluded.hemo_efectivo,
    motivo = excluded.motivo, motivo2 = excluded.motivo2, signos = excluded.signos, signos_todos = excluded.signos_todos,
    examen = excluded.examen, respuestas = excluded.respuestas, antecedentes = excluded.antecedentes, vacunacion = excluded.vacunacion,
    top = excluded.top, alta = excluded.alta, soap_dx = excluded.soap_dx, soap_auto = excluded.soap_auto,
    insuficiente = excluded.insuficiente, sin_dx = excluded.sin_dx, faltan = excluded.faltan,
    q_visibles = excluded.q_visibles, q_pendientes = excluded.q_pendientes,
    alertas = excluded.alertas, minutos_soap = excluded.minutos_soap, prueba = excluded.prueba
  where c.usuario = u
  returning * into r;

  return jsonb_build_object('codigo', r.codigo, 'id', r.id);
end $$;

-- _caso_json: igual que en 02, más ent.hemoEf (lo lee el panel del admin y el Excel)
create or replace function public._caso_json(c public.casos)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'id', c.codigo, 'uuid', c.id, 'f', c.creado, 'fa', c.actualizado, 'v', c.version_motor, 'por', c.usuario,
    'sesion', c.sesion, 'prueba', c.prueba, 'migrado', c.migrado, 'anulado', c.anulado, 'min', c.minutos_soap, 'alertas', c.alertas,
    'ent', jsonb_build_object('esp', c.especie, 'peso', c.peso, 'edad', c.edad, 'sexo', c.sexo, 'hemo', c.hemo, 'hemoEf', c.hemo_efectivo,
            'vac', c.vacunacion, 'hxs', c.antecedentes, 'ex', c.examen, 'motivo', c.motivo, 'motivo2', c.motivo2,
            'signs', c.signos, 'signsAll', c.signos_todos, 'ans', c.respuestas),
    'sal', jsonb_build_object('top', c.top, 'alta', c.alta, 'insuf', c.insuficiente, 'sinDx', c.sin_dx,
            'soap', c.soap_dx, 'soapAuto', c.soap_auto, 'faltan', c.faltan, 'qVis', c.q_visibles, 'qPend', c.q_pendientes));
$$;
