-- ═══════════════════════════════════════════════════════════════
-- 02 · Seguridad: Row Level Security y funciones RPC
--
-- Modelo de acceso acordado con la dirección (17/11/2026):
--   · Médicos: usan el motor SIN cuenta. La página abre una sesión anónima de
--     Supabase por dispositivo (rol «authenticated», is_anonymous = true).
--     Pueden REGISTRAR casos y CERRAR un caso si conocen su código MC.
--     No pueden listar ni leer el historial.
--   · Admin: cuenta con correo y contraseña + fila en perfiles con rol 'admin'.
--     Lee todo, administra perfiles y puede anular casos.
--   · Nadie borra. Ni siquiera el admin (no hay política DELETE ni permiso).
--
-- Toda escritura de los médicos pasa por funciones SECURITY DEFINER que
-- validan formato, tamaño y frecuencia. Las tablas no aceptan INSERT/UPDATE
-- directos desde el cliente.
-- ═══════════════════════════════════════════════════════════════

-- ─── ¿El usuario actual es admin activo? ───
create or replace function public.es_admin()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.perfiles p
    where p.id = auth.uid() and p.rol = 'admin' and p.activo
  );
$$;

-- ─── RLS en todas las tablas ───
alter table public.perfiles     enable row level security;
alter table public.sesiones     enable row level security;
alter table public.casos        enable row level security;
alter table public.cierres      enable row level security;
alter table public.cierres_hist enable row level security;
alter table public.eventos      enable row level security;

-- Permisos de tabla: el cliente solo puede leer (y RLS limita a admin).
revoke all on public.perfiles, public.sesiones, public.casos, public.cierres, public.cierres_hist, public.eventos from anon, authenticated;
grant select on public.perfiles, public.sesiones, public.casos, public.cierres, public.cierres_hist, public.eventos to authenticated;
grant insert, update on public.perfiles to authenticated;   -- solo admin, por política
revoke all on all sequences in schema public from anon, authenticated;

-- perfiles: cada quien ve el suyo; el admin ve y administra todos.
create policy perfiles_leer on public.perfiles for select to authenticated
  using (id = auth.uid() or public.es_admin());
create policy perfiles_alta_admin on public.perfiles for insert to authenticated
  with check (public.es_admin());
create policy perfiles_editar_admin on public.perfiles for update to authenticated
  using (public.es_admin()) with check (public.es_admin());

-- Resto de tablas: lectura solo admin. Sin políticas de escritura (todo por RPC).
create policy sesiones_leer_admin     on public.sesiones     for select to authenticated using (public.es_admin());
create policy casos_leer_admin        on public.casos        for select to authenticated using (public.es_admin());
create policy cierres_leer_admin      on public.cierres      for select to authenticated using (public.es_admin());
create policy cierres_hist_leer_admin on public.cierres_hist for select to authenticated using (public.es_admin());
create policy eventos_leer_admin      on public.eventos      for select to authenticated using (public.es_admin());

-- Un admin no puede quitarse a sí mismo el rol (evita quedarse sin administrador por error).
create or replace function public.perfiles_proteger()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.id = auth.uid() and (new.rol <> 'admin' or not new.activo) then
    raise exception 'No puede quitarse a sí mismo el rol de administrador.' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger perfiles_proteger before update on public.perfiles
  for each row execute function public.perfiles_proteger();

-- ═══════════════════════════════════════════════════════════════
-- Funciones RPC
-- ═══════════════════════════════════════════════════════════════

-- Utilidad: exige sesión (anónima o con correo).
create or replace function public._exigir_sesion()
returns uuid language plpgsql stable set search_path = '' as $$
declare u uuid := auth.uid();
begin
  if u is null then
    raise exception 'sin_sesion' using errcode = '28000';
  end if;
  return u;
end $$;

-- Utilidad: arreglo JSON (o vacío) con límite de elementos.
create or replace function public._arr(j jsonb, maxn int default 200)
returns jsonb language sql immutable as $$
  select case when jsonb_typeof(j) = 'array' and jsonb_array_length(j) <= maxn then j else '[]'::jsonb end;
$$;
create or replace function public._obj(j jsonb)
returns jsonb language sql immutable as $$
  select case when jsonb_typeof(j) = 'object' then j else '{}'::jsonb end;
$$;

-- ─── Sesión de uso ───
create or replace function public.iniciar_sesion(p_dispositivo text, p_version text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare u uuid := public._exigir_sesion(); s uuid; n int;
begin
  select count(*) into n from public.sesiones where usuario = u and inicio > now() - interval '1 hour';
  if n >= 30 then raise exception 'demasiadas_sesiones' using errcode = 'P0001'; end if;
  insert into public.sesiones (usuario, dispositivo, version_motor)
  values (u, left(coalesce(p_dispositivo,''),120), left(coalesce(p_version,'?'),20))
  returning id into s;
  return s;
end $$;

create or replace function public.latido(p_sesion uuid)
returns void language sql security definer set search_path = '' as $$
  update public.sesiones set ultimo_latido = now()
  where id = p_sesion and usuario = auth.uid() and ultimo_latido < now() - interval '30 seconds';
$$;

-- ─── Registrar o actualizar un caso (al pulsar «Nota SOAP») ───
-- p = {id, f, fa, v, prueba, sesion, ent:{...}, sal:{...}, alertas:[...], min}
-- Si el código ya existe y es del mismo dispositivo, se actualiza (nota regenerada).
-- Si existe y es de otro, se rechaza con 'codigo_ocupado' para que el cliente genere otro.
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
    especie, edad, sexo, peso, hemo, motivo, motivo2,
    signos, signos_todos, examen, respuestas, antecedentes, vacunacion,
    top, alta, soap_dx, soap_auto, insuficiente, sin_dx, faltan, q_visibles, q_pendientes,
    alertas, minutos_soap, prueba
  ) values (
    v_codigo, u, v_ses, v_creado, now(), left(coalesce(p->>'v','?'),20),
    nullif(e->>'esp',''), left(e->>'edad',10), left(e->>'sexo',10), v_peso, left(e->>'hemo',10),
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
    especie = excluded.especie, edad = excluded.edad, sexo = excluded.sexo, peso = excluded.peso, hemo = excluded.hemo,
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

-- ─── Abrir UN caso por su código exacto (para cerrarlo) ───
-- Devuelve el caso en el formato que usa el motor ({id,b,f,fa,v,ent,sal}) y su cierre.
create or replace function public._caso_json(c public.casos)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'id', c.codigo, 'uuid', c.id, 'f', c.creado, 'fa', c.actualizado, 'v', c.version_motor, 'por', c.usuario,
    'sesion', c.sesion, 'prueba', c.prueba, 'migrado', c.migrado, 'anulado', c.anulado, 'min', c.minutos_soap, 'alertas', c.alertas,
    'ent', jsonb_build_object('esp', c.especie, 'peso', c.peso, 'edad', c.edad, 'sexo', c.sexo, 'hemo', c.hemo,
            'vac', c.vacunacion, 'hxs', c.antecedentes, 'ex', c.examen, 'motivo', c.motivo, 'motivo2', c.motivo2,
            'signs', c.signos, 'signsAll', c.signos_todos, 'ans', c.respuestas),
    'sal', jsonb_build_object('top', c.top, 'alta', c.alta, 'insuf', c.insuficiente, 'sinDx', c.sin_dx,
            'soap', c.soap_dx, 'soapAuto', c.soap_auto, 'faltan', c.faltan, 'qVis', c.q_visibles, 'qPend', c.q_pendientes));
$$;

create or replace function public._cierre_json(k public.cierres)
returns jsonb language sql stable set search_path = '' as $$
  select case when k.caso is null then null else jsonb_strip_nulls(jsonb_build_object(
    'dx', case when k.dx_nombre is null then null else jsonb_build_object('c', coalesce(k.dx_codigo,''), 'n', k.dx_nombre, 'cap', coalesce(k.dx_capitulo,''), 'nuevo', k.dx_nuevo) end,
    'con', k.concomitantes, 'sinDx', k.sin_dx, 'conf', coalesce(k.confirmacion,''),
    'labs', k.labs, 'tests', k.tests, 'otros', coalesce(k.otros,''), 'notas', coalesce(k.notas,''),
    'fc', k.fecha, 'por', k.usuario)) end;
$$;

create or replace function public.caso_por_codigo(p_codigo text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare u uuid := public._exigir_sesion(); c public.casos%rowtype; k public.cierres%rowtype; n int;
begin
  if p_codigo is null or upper(p_codigo) !~ '^MC-[A-HJ-NP-Z2-9]{6}$' then raise exception 'codigo_invalido' using errcode = 'P0001'; end if;
  -- Freno a la búsqueda por fuerza bruta: 30 consultas por dispositivo cada 10 minutos.
  select count(*) into n from public.eventos where usuario = u and tipo = 'abrir_registro' and fecha > now() - interval '10 minutes';
  if n >= 30 and not public.es_admin() then raise exception 'demasiadas_consultas' using errcode = 'P0001'; end if;
  insert into public.eventos (usuario, tipo) values (u, 'abrir_registro');

  select * into c from public.casos where codigo = upper(p_codigo) and not anulado;
  if not found then return null; end if;
  select * into k from public.cierres where caso = c.id;
  return jsonb_build_object('caso', public._caso_json(c), 'cierre', public._cierre_json(k));
end $$;

-- ─── Guardar el cierre de un caso (por código) ───
-- p = {dx:{c,n,cap,nuevo}|null, con:[], sinDx, conf, labs:{}, tests:{}, otros, notas}
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

  insert into public.cierres as x (caso, usuario, fecha, dx_codigo, dx_nombre, dx_capitulo, dx_nuevo, sin_dx, confirmacion, concomitantes, labs, tests, otros, notas)
  values (c.id, u, now(),
    case when jsonb_typeof(dx) = 'object' then nullif(left(dx->>'c',40),'') end,
    case when jsonb_typeof(dx) = 'object' then left(dx->>'n',120) end,
    case when jsonb_typeof(dx) = 'object' then nullif(left(dx->>'cap',4),'') end,
    case when jsonb_typeof(dx) = 'object' then coalesce((dx->>'nuevo')::boolean,false) else false end,
    coalesce((p->>'sinDx')::boolean,false) and jsonb_typeof(dx) is distinct from 'object',
    nullif(p->>'conf',''),
    public._arr(p->'con',20), public._obj(p->'labs'), public._obj(p->'tests'),
    left(p->>'otros',300), left(p->>'notas',600))
  on conflict (caso) do update set
    usuario = excluded.usuario, fecha = excluded.fecha, dx_codigo = excluded.dx_codigo, dx_nombre = excluded.dx_nombre,
    dx_capitulo = excluded.dx_capitulo, dx_nuevo = excluded.dx_nuevo, sin_dx = excluded.sin_dx,
    confirmacion = excluded.confirmacion, concomitantes = excluded.concomitantes, labs = excluded.labs,
    tests = excluded.tests, otros = excluded.otros, notas = excluded.notas
  returning * into k;

  insert into public.cierres_hist (caso, usuario, datos) values (c.id, u, to_jsonb(k));
  insert into public.eventos (usuario, caso, tipo) values (u, c.id, 'cerrar_caso');
  return public._cierre_json(k);
end $$;

-- ─── Evento de uso ───
create or replace function public.registrar_evento(p_tipo text, p_sesion uuid default null, p_codigo text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare u uuid := public._exigir_sesion(); v_caso uuid; v_ses uuid; n int;
begin
  if p_tipo not in ('copiar_soap','nuevo_paciente','exportar') then raise exception 'tipo_invalido' using errcode = 'P0001'; end if;
  select count(*) into n from public.eventos where usuario = u and fecha > now() - interval '10 minutes';
  if n >= 300 then return; end if;
  if p_codigo is not null then select id into v_caso from public.casos where codigo = upper(p_codigo) and usuario = u; end if;
  if p_sesion is not null then select id into v_ses from public.sesiones where id = p_sesion and usuario = u; end if;
  insert into public.eventos (usuario, sesion, caso, tipo) values (u, v_ses, v_caso, p_tipo);
end $$;

-- ─── Anular un caso (solo admin; no se borra) ───
create or replace function public.anular_caso(p_codigo text, p_motivo text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.es_admin() then raise exception 'solo_admin' using errcode = '42501'; end if;
  update public.casos set anulado = true, anulado_por = auth.uid(), anulado_fecha = now(), anulado_motivo = left(p_motivo,300)
  where codigo = upper(p_codigo) and not anulado;
  if not found then raise exception 'caso_no_encontrado' using errcode = 'P0001'; end if;
end $$;

-- Permisos de ejecución: solo con sesión (anónima o con correo). Nunca el rol «anon» sin sesión.
revoke execute on all functions in schema public from public, anon;
grant execute on function
  public.es_admin(), public.iniciar_sesion(text,text), public.latido(uuid), public.registrar_caso(jsonb),
  public.caso_por_codigo(text), public.guardar_cierre(text,jsonb), public.registrar_evento(text,uuid,text),
  public.anular_caso(text,text)
to authenticated;
