-- ═══════════════════════════════════════════════════════════════
-- 03 · Vistas de indicadores (solo admin)
-- Todas son security_invoker: heredan la RLS de las tablas, así que un
-- dispositivo anónimo obtiene 0 filas. Excluyen casos de prueba y anulados.
-- Zona horaria: America/El_Salvador (UTC−6, sin horario de verano).
-- Turnos: mañana 07:00–14:59 · tarde 15:00–22:59 · noche 23:00–06:59
-- (ajuste la función turno_de si el hospital usa otros horarios).
-- ═══════════════════════════════════════════════════════════════

create or replace function public.turno_de(t timestamptz)
returns text language sql immutable as $$
  select case
    when extract(hour from t at time zone 'America/El_Salvador') between 7 and 14 then 'mañana'
    when extract(hour from t at time zone 'America/El_Salvador') between 15 and 22 then 'tarde'
    else 'noche' end;
$$;

-- Etiqueta corta del dispositivo (los médicos no tienen cuenta: se identifica la sesión anónima).
create or replace function public.etiqueta_usuario(u uuid)
returns text language sql stable security definer set search_path = '' as $$
  select coalesce((select p.nombre from public.perfiles p where p.id = u and public.es_admin()),
                  'Anónimo · disp. ' || upper(left(replace(u::text,'-',''), 4)));
$$;

create or replace view public.v_casos_validos with (security_invoker = on) as
  select c.*, (c.creado at time zone 'America/El_Salvador')::date as dia, public.turno_de(c.creado) as turno
  from public.casos c
  where not c.anulado and not c.prueba;

-- Casos por día, turno y usuario/dispositivo
create or replace view public.v_casos_por_dia with (security_invoker = on) as
  select dia, turno, usuario, public.etiqueta_usuario(usuario) as veterinario, count(*)::int as casos
  from public.v_casos_validos
  group by dia, turno, usuario
  order by dia desc, turno;

-- Estado: cerrado = «sin diagnóstico definitivo» o (diagnóstico + base de confirmación). Igual que cerrado() del motor.
create or replace view public.v_casos_estado with (security_invoker = on) as
  select c.dia, c.codigo, c.usuario,
         (k.caso is not null and (k.sin_dx or (k.dx_nombre is not null and k.confirmacion is not null))) as cerrado
  from public.v_casos_validos c
  left join public.cierres k on k.caso = c.id;

create or replace view public.v_cerrados_abiertos with (security_invoker = on) as
  select dia, count(*) filter (where cerrado)::int as cerrados, count(*) filter (where not cerrado)::int as abiertos
  from public.v_casos_estado group by dia order by dia desc;

-- Acierto del motor contra el diagnóstico definitivo (casos evaluables = dx + confirmación, como regEval()).
create or replace view public.v_acierto_casos with (security_invoker = on) as
  select c.dia, c.codigo, c.usuario, k.dx_codigo, k.confirmacion,
         k.confirmacion in ('histo','lab','img','qx') as confirmacion_objetiva,
         (c.top->0->>'c') = k.dx_codigo as top1,
         exists (select 1 from jsonb_array_elements(c.top) with ordinality t(x, i) where i <= 3 and t.x->>'c' = k.dx_codigo) as top3,
         c.soap_dx ? k.dx_codigo as acierto_soap
  from public.v_casos_validos c
  join public.cierres k on k.caso = c.id
  where k.dx_nombre is not null and k.confirmacion is not null;

-- Totales sin agrupar: sin «having es_admin()» un anónimo vería una fila en cero (sin datos, pero no debe ver nada).
create or replace view public.v_acierto_resumen with (security_invoker = on) as
  select 'todos' as grupo, count(*)::int as n,
         count(*) filter (where top1 and dx_codigo is not null)::int as top1,
         count(*) filter (where top3 and dx_codigo is not null)::int as top3
  from public.v_acierto_casos having public.es_admin()
  union all
  select 'confirmacion_objetiva', count(*)::int,
         count(*) filter (where top1 and dx_codigo is not null)::int,
         count(*) filter (where top3 and dx_codigo is not null)::int
  from public.v_acierto_casos where confirmacion_objetiva having public.es_admin();

-- Tiempo medio desde el inicio de la atención hasta la nota SOAP
create or replace view public.v_tiempo_soap with (security_invoker = on) as
  select dia, usuario, public.etiqueta_usuario(usuario) as veterinario,
         count(minutos_soap)::int as n, round(avg(minutos_soap)::numeric, 1) as minutos_promedio,
         percentile_cont(0.5) within group (order by minutos_soap) as minutos_mediana
  from public.v_casos_validos where minutos_soap is not null
  group by dia, usuario order by dia desc;

-- Diagnósticos más frecuentes: presuntivo n.º 1 del motor y definitivo
create or replace view public.v_dx_frecuentes with (security_invoker = on) as
  select 'presuntivo' as tipo, top->0->>'c' as codigo, top->0->>'n' as nombre, count(*)::int as casos
  from public.v_casos_validos where jsonb_array_length(top) > 0
  group by 2, 3
  union all
  select 'definitivo', k.dx_codigo, k.dx_nombre, count(*)::int
  from public.v_casos_validos c join public.cierres k on k.caso = c.id
  where k.dx_nombre is not null
  group by 2, 3
  order by 1, 4 desc;

-- Uso: sesiones por día y dispositivo
create or replace view public.v_uso_sesiones with (security_invoker = on) as
  select (inicio at time zone 'America/El_Salvador')::date as dia, usuario, public.etiqueta_usuario(usuario) as veterinario,
         count(*)::int as sesiones,
         round(sum(extract(epoch from (ultimo_latido - inicio)) / 60)::numeric, 0) as minutos_de_uso
  from public.sesiones group by 1, 2 order by 1 desc;

grant select on public.v_casos_validos, public.v_casos_por_dia, public.v_casos_estado, public.v_cerrados_abiertos,
  public.v_acierto_casos, public.v_acierto_resumen, public.v_tiempo_soap, public.v_dx_frecuentes, public.v_uso_sesiones
to authenticated;
-- Supabase concede por defecto escritura sobre objetos nuevos: las vistas son solo de lectura.
revoke insert, update, delete, truncate, references, trigger on public.v_casos_validos, public.v_casos_por_dia, public.v_casos_estado, public.v_cerrados_abiertos,
  public.v_acierto_casos, public.v_acierto_resumen, public.v_tiempo_soap, public.v_dx_frecuentes, public.v_uso_sesiones
from authenticated;
revoke all on public.v_casos_validos, public.v_casos_por_dia, public.v_casos_estado, public.v_cerrados_abiertos,
  public.v_acierto_casos, public.v_acierto_resumen, public.v_tiempo_soap, public.v_dx_frecuentes, public.v_uso_sesiones
from anon;

revoke execute on function public.turno_de(timestamptz), public.etiqueta_usuario(uuid) from public, anon;
grant execute on function public.turno_de(timestamptz), public.etiqueta_usuario(uuid) to authenticated;
