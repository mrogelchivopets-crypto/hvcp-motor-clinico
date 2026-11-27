-- ═══════════════════════════════════════════════════════════════
-- 08 · v8.0: perfil por médico (nombre + PIN) y campos nuevos del caso
-- Aprobado por la Dirección General (26/11/2026): el registro deja de ser anónimo.
-- · medicos: nombre y PIN de 4 dígitos con hash bcrypt en el servidor (pgcrypto); 5 intentos fallidos = espera de 60 s.
-- · medico_dispositivo: en qué dispositivos entró cada médico con su PIN. El servidor solo acepta medicoId en
--   un caso o un cierre si ese médico entró en ese dispositivo.
-- · casos: conciencia, critico, rcp, hemo_criterios y medico_id. cierres: cerrado_por_medico.
-- · Funciones: listar_medicos, crear_medico, entrar_medico, salir_medico, mis_casos.
-- Compatible con la v7.9.7 publicada: los campos nuevos son opcionales.
-- Si después se aplica la 06 (rol lector), su admin_casos debe conservar el nombre del médico.
-- ═══════════════════════════════════════════════════════════════

create table if not exists public.medicos (
  id              uuid primary key default gen_random_uuid(),
  nombre          text not null check (char_length(btrim(nombre)) between 3 and 80),
  pin_hash        text not null,
  activo          boolean not null default true,
  intentos        int not null default 0,
  bloqueado_hasta timestamptz,
  creado          timestamptz not null default now(),
  creado_por      uuid not null default auth.uid()
);
create unique index if not exists medicos_nombre_unico on public.medicos (lower(btrim(nombre)));

create table if not exists public.medico_dispositivo (
  usuario   uuid not null,
  medico_id uuid not null references public.medicos(id) on delete restrict,
  desde     timestamptz not null default now(),
  activo    boolean not null default true,
  primary key (usuario, medico_id)
);

alter table public.casos add column if not exists conciencia text
  check (conciencia is null or conciencia in ('alerta','dep','estupor','coma','crit','ssv'));
alter table public.casos add column if not exists critico boolean not null default false;
alter table public.casos add column if not exists rcp boolean not null default false;
alter table public.casos add column if not exists hemo_criterios jsonb not null default '[]'::jsonb;
alter table public.casos add column if not exists medico_id uuid references public.medicos(id) on delete restrict;
alter table public.cierres add column if not exists cerrado_por_medico uuid references public.medicos(id) on delete restrict;
create index if not exists casos_medico_idx on public.casos (medico_id, creado desc);

-- Nadie lee ni escribe estas tablas directo (Supabase concede permisos por defecto): solo por las funciones.
alter table public.medicos enable row level security;
alter table public.medico_dispositivo enable row level security;
revoke all on public.medicos, public.medico_dispositivo from anon, authenticated;
-- El admin ve los perfiles sin el hash del PIN (permiso por columnas).
grant select (id, nombre, activo, intentos, bloqueado_hasta, creado, creado_por) on public.medicos to authenticated;
grant select on public.medico_dispositivo to authenticated;
drop policy if exists medicos_leer_admin on public.medicos;
drop policy if exists medico_dispositivo_leer_admin on public.medico_dispositivo;
create policy medicos_leer_admin on public.medicos for select to authenticated using (public.es_admin());
create policy medico_dispositivo_leer_admin on public.medico_dispositivo for select to authenticated using (public.es_admin());

-- Lista para elegir perfil (solo nombre).
create or replace function public.listar_medicos()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare u uuid := public._exigir_sesion();
begin
  return coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'nombre', m.nombre) order by lower(m.nombre))
                   from public.medicos m where m.activo), '[]'::jsonb);
end $$;

-- Crea el perfil y lo deja activo en este dispositivo. Máximo 5 perfiles nuevos por dispositivo por hora.
create or replace function public.crear_medico(p_nombre text, p_pin text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare u uuid := public._exigir_sesion(); v_nom text := btrim(coalesce(p_nombre,'')); v_id uuid; n int;
begin
  if char_length(v_nom) < 3 or char_length(v_nom) > 80 then return jsonb_build_object('error','nombre_invalido'); end if;
  if coalesce(p_pin,'') !~ '^[0-9]{4}$' then return jsonb_build_object('error','pin_invalido'); end if;
  select count(*) into n from public.medicos where creado_por = u and creado > now() - interval '1 hour';
  if n >= 5 then return jsonb_build_object('error','demasiados_perfiles'); end if;
  if exists (select 1 from public.medicos where lower(btrim(nombre)) = lower(v_nom)) then return jsonb_build_object('error','nombre_existe'); end if;
  insert into public.medicos (nombre, pin_hash) values (v_nom, extensions.crypt(p_pin, extensions.gen_salt('bf'))) returning id into v_id;
  update public.medico_dispositivo set activo = false where usuario = u;
  insert into public.medico_dispositivo (usuario, medico_id) values (u, v_id);
  return jsonb_build_object('id', v_id, 'nombre', v_nom);
end $$;

-- Entra con el PIN. No usa excepciones para el PIN incorrecto: así el contador de intentos queda guardado.
create or replace function public.entrar_medico(p_id uuid, p_pin text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare u uuid := public._exigir_sesion(); m public.medicos%rowtype;
begin
  select * into m from public.medicos where id = p_id and activo for update;
  if not found then return jsonb_build_object('error','no_existe'); end if;
  if m.bloqueado_hasta is not null and m.bloqueado_hasta > now() then
    return jsonb_build_object('error','bloqueado','segundos', ceil(extract(epoch from (m.bloqueado_hasta - now())))::int);
  end if;
  if coalesce(p_pin,'') ~ '^[0-9]{4}$' and extensions.crypt(p_pin, m.pin_hash) = m.pin_hash then
    update public.medicos set intentos = 0, bloqueado_hasta = null where id = m.id;
    update public.medico_dispositivo set activo = false where usuario = u;
    insert into public.medico_dispositivo (usuario, medico_id) values (u, m.id)
      on conflict (usuario, medico_id) do update set activo = true, desde = now();
    return jsonb_build_object('id', m.id, 'nombre', m.nombre);
  end if;
  if m.intentos + 1 >= 5 then
    update public.medicos set intentos = 0, bloqueado_hasta = now() + interval '60 seconds' where id = m.id;
    return jsonb_build_object('error','bloqueado','segundos',60);
  end if;
  update public.medicos set intentos = m.intentos + 1 where id = m.id;
  return jsonb_build_object('error','pin_incorrecto','restantes', 5 - (m.intentos + 1));
end $$;

create or replace function public.salir_medico()
returns void language sql security definer set search_path = '' as $$
  update public.medico_dispositivo set activo = false where usuario = auth.uid();
$$;

-- Casos del médico activo en este dispositivo (pendientes y cerrados), los 300 más recientes.
create or replace function public.mis_casos()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare u uuid := public._exigir_sesion(); v_med uuid;
begin
  select medico_id into v_med from public.medico_dispositivo where usuario = u and activo order by desde desc limit 1;
  if v_med is null then return jsonb_build_object('error','sin_medico'); end if;
  return jsonb_build_object('medico', (select nombre from public.medicos where id = v_med), 'casos', coalesce((
    select jsonb_agg(x order by x->>'f' desc) from (
      select jsonb_build_object('codigo', c.codigo, 'f', c.creado, 'soap', c.soap_dx, 'top', c.top,
        'cerrado', (k.caso is not null and (k.sin_dx or (k.dx_nombre is not null and k.confirmacion is not null))),
        'dx', k.dx_nombre, 'sinDx', coalesce(k.sin_dx,false)) as x
      from public.casos c left join public.cierres k on k.caso = c.id
      where c.medico_id = v_med and not c.anulado
      order by c.creado desc limit 300) t), '[]'::jsonb));
end $$;

-- registrar_caso: igual que en 05, más conciencia, critico, rcp, hemo_criterios y medico_id
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
  v_med uuid;
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

  -- v8.0: médico activo en este dispositivo (solo si entró con su PIN aquí).
  begin v_med := nullif(p->>'medicoId','')::uuid; exception when others then v_med := null; end;
  if v_med is not null and not exists (select 1 from public.medico_dispositivo d where d.usuario = u and d.medico_id = v_med) then v_med := null; end if;

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
    alertas, minutos_soap, prueba,
    conciencia, critico, rcp, hemo_criterios, medico_id
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
    public._arr(p->'alertas',40), v_min, coalesce((p->>'prueba')::boolean, false),
    case when e->>'conc' in ('alerta','dep','estupor','coma','crit','ssv') then e->>'conc' end,
    coalesce((e->>'critico')::boolean, false), coalesce((e->>'rcp')::boolean, false), public._arr(e->'hemoCrit',12), v_med
  )
  on conflict (codigo) do update set
    actualizado = now(), sesion = coalesce(excluded.sesion, c.sesion), version_motor = excluded.version_motor,
    especie = excluded.especie, edad = excluded.edad, sexo = excluded.sexo, peso = excluded.peso, hemo = excluded.hemo, hemo_efectivo = excluded.hemo_efectivo,
    motivo = excluded.motivo, motivo2 = excluded.motivo2, signos = excluded.signos, signos_todos = excluded.signos_todos,
    examen = excluded.examen, respuestas = excluded.respuestas, antecedentes = excluded.antecedentes, vacunacion = excluded.vacunacion,
    top = excluded.top, alta = excluded.alta, soap_dx = excluded.soap_dx, soap_auto = excluded.soap_auto,
    insuficiente = excluded.insuficiente, sin_dx = excluded.sin_dx, faltan = excluded.faltan,
    q_visibles = excluded.q_visibles, q_pendientes = excluded.q_pendientes,
    alertas = excluded.alertas, minutos_soap = excluded.minutos_soap, prueba = excluded.prueba,
    conciencia = excluded.conciencia, critico = excluded.critico, rcp = excluded.rcp, hemo_criterios = excluded.hemo_criterios,
    medico_id = coalesce(excluded.medico_id, c.medico_id)
  where c.usuario = u
  returning * into r;

  return jsonb_build_object('codigo', r.codigo, 'id', r.id);
end $$;

-- guardar_cierre: igual que en 07, más cerrado_por_medico
create or replace function public.guardar_cierre(p_codigo text, p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare u uuid := public._exigir_sesion(); c public.casos%rowtype; k public.cierres%rowtype; dx jsonb := p->'dx'; v_med uuid;
begin
  if pg_column_size(p) > 16384 then raise exception 'cierre_muy_grande' using errcode = 'P0001'; end if;
  select * into c from public.casos where codigo = upper(coalesce(p_codigo,'')) and not anulado;
  if not found then raise exception 'caso_no_encontrado' using errcode = 'P0001'; end if;
  if jsonb_typeof(dx) = 'object' and coalesce(p->>'conf','') = '' then
    raise exception 'falta_confirmacion' using errcode = 'P0001';
  end if;

  begin v_med := nullif(p->>'medicoId','')::uuid; exception when others then v_med := null; end;
  if v_med is not null and not exists (select 1 from public.medico_dispositivo d where d.usuario = u and d.medico_id = v_med) then v_med := null; end if;

  insert into public.cierres as x (caso, usuario, fecha, dx_codigo, dx_nombre, dx_capitulo, dx_nuevo, sin_dx, confirmacion, confirmacion2, concomitantes, labs, tests, otros, notas, cerrado_por_medico)
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
    left(p->>'otros',300), left(p->>'notas',600), v_med)
  on conflict (caso) do update set
    usuario = excluded.usuario, fecha = excluded.fecha, dx_codigo = excluded.dx_codigo, dx_nombre = excluded.dx_nombre,
    dx_capitulo = excluded.dx_capitulo, dx_nuevo = excluded.dx_nuevo, sin_dx = excluded.sin_dx,
    confirmacion = excluded.confirmacion, confirmacion2 = excluded.confirmacion2, concomitantes = excluded.concomitantes, labs = excluded.labs,
    tests = excluded.tests, otros = excluded.otros, notas = excluded.notas, cerrado_por_medico = excluded.cerrado_por_medico
  returning * into k;

  insert into public.cierres_hist (caso, usuario, datos) values (c.id, u, to_jsonb(k));
  insert into public.eventos (usuario, caso, tipo) values (u, c.id, 'cerrar_caso');
  return public._cierre_json(k);
end $$;

-- _caso_json: igual que en 05, más conciencia, criterios hemodinámicos y médico
create or replace function public._caso_json(c public.casos)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'id', c.codigo, 'uuid', c.id, 'f', c.creado, 'fa', c.actualizado, 'v', c.version_motor, 'por', c.usuario,
    'sesion', c.sesion, 'prueba', c.prueba, 'migrado', c.migrado, 'anulado', c.anulado, 'min', c.minutos_soap, 'alertas', c.alertas,
    'medicoId', c.medico_id, 'medico', (select m.nombre from public.medicos m where m.id = c.medico_id),
    'ent', jsonb_build_object('esp', c.especie, 'peso', c.peso, 'edad', c.edad, 'sexo', c.sexo, 'hemo', c.hemo, 'hemoEf', c.hemo_efectivo, 'hemoCrit', c.hemo_criterios, 'conc', c.conciencia, 'critico', c.critico, 'rcp', c.rcp,
            'vac', c.vacunacion, 'hxs', c.antecedentes, 'ex', c.examen, 'motivo', c.motivo, 'motivo2', c.motivo2,
            'signs', c.signos, 'signsAll', c.signos_todos, 'ans', c.respuestas),
    'sal', jsonb_build_object('top', c.top, 'alta', c.alta, 'insuf', c.insuficiente, 'sinDx', c.sin_dx,
            'soap', c.soap_dx, 'soapAuto', c.soap_auto, 'faltan', c.faltan, 'qVis', c.q_visibles, 'qPend', c.q_pendientes));
$$;

-- _cierre_json: igual que en 07, más quién cerró
create or replace function public._cierre_json(k public.cierres)
returns jsonb language sql stable set search_path = '' as $$
  select case when k.caso is null then null else jsonb_strip_nulls(jsonb_build_object(
    'dx', case when k.dx_nombre is null then null else jsonb_build_object('c', coalesce(k.dx_codigo,''), 'n', k.dx_nombre, 'cap', coalesce(k.dx_capitulo,''), 'nuevo', k.dx_nuevo) end,
    'con', k.concomitantes, 'sinDx', k.sin_dx, 'conf', coalesce(k.confirmacion,''), 'conf2', k.confirmacion2,
    'labs', k.labs, 'tests', k.tests, 'otros', coalesce(k.otros,''), 'notas', coalesce(k.notas,''),
    'fc', k.fecha, 'por', k.usuario, 'cerradoPor', (select m.nombre from public.medicos m where m.id = k.cerrado_por_medico))) end;
$$;

-- admin_casos: igual que en 04, con el nombre del médico como veterinario
create or replace function public.admin_casos(p_desde timestamptz, p_incluir_pruebas boolean default false)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.es_admin() then raise exception 'solo_admin' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'caso', public._caso_json(c) || jsonb_build_object('vet', coalesce((select m.nombre from public.medicos m where m.id = c.medico_id), public.etiqueta_usuario(c.usuario))),
             'cierre', public._cierre_json(k)) order by c.creado desc)
    from public.casos c left join public.cierres k on k.caso = c.id
    where c.creado >= p_desde and not c.anulado and (p_incluir_pruebas or not c.prueba)
  ), '[]'::jsonb);
end $$;

revoke execute on function public.listar_medicos(), public.crear_medico(text,text), public.entrar_medico(uuid,text),
  public.salir_medico(), public.mis_casos() from public, anon;
grant execute on function public.listar_medicos(), public.crear_medico(text,text), public.entrar_medico(uuid,text),
  public.salir_medico(), public.mis_casos() to authenticated;
