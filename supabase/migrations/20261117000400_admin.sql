-- ═══════════════════════════════════════════════════════════════
-- 04 · Funciones del administrador: listado del registro e importación
-- ═══════════════════════════════════════════════════════════════

-- Listado para la vista «Registro de casos» del admin, en el formato del motor.
create or replace function public.admin_casos(p_desde timestamptz, p_incluir_pruebas boolean default false)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.es_admin() then raise exception 'solo_admin' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'caso', public._caso_json(c) || jsonb_build_object('vet', public.etiqueta_usuario(c.usuario)),
             'cierre', public._cierre_json(k)) order by c.creado desc)
    from public.casos c left join public.cierres k on k.caso = c.id
    where c.creado >= p_desde and not c.anulado and (p_incluir_pruebas or not c.prueba)
  ), '[]'::jsonb);
end $$;

-- Importación desde el Excel del registro anterior (scripts/importar_registro.mjs).
-- Idempotente: si el código MC ya existe, no hace nada y devuelve false.
-- El caso queda a nombre del admin que importa y marcado como migrado.
create or replace function public.importar_caso(p jsonb, p_cierre jsonb default null)
returns boolean language plpgsql security definer set search_path = '' as $$
declare u uuid := auth.uid(); v_codigo text := upper(p->>'id'); e jsonb := public._obj(p->'ent'); s jsonb := public._obj(p->'sal');
        v_id uuid; v_creado timestamptz; dx jsonb := p_cierre->'dx';
begin
  if not public.es_admin() then raise exception 'solo_admin' using errcode = '42501'; end if;
  if v_codigo is null or v_codigo !~ '^MC-[A-HJ-NP-Z2-9]{6}$' then raise exception 'codigo_invalido: %', v_codigo using errcode = 'P0001'; end if;
  begin v_creado := (p->>'f')::timestamptz; exception when others then v_creado := null; end;
  if v_creado is null then raise exception 'fecha_invalida: %', v_codigo using errcode = 'P0001'; end if;

  insert into public.casos (codigo, usuario, creado, actualizado, version_motor, especie, edad, sexo, peso, hemo, motivo, motivo2,
    signos, signos_todos, examen, respuestas, top, alta, soap_dx, soap_auto, insuficiente, sin_dx, faltan, q_visibles, q_pendientes, migrado)
  values (v_codigo, u, v_creado, v_creado, left(coalesce(p->>'v','?'),20), nullif(e->>'esp',''), e->>'edad', e->>'sexo',
    nullif(e->>'peso','')::numeric, e->>'hemo', e->>'motivo', e->>'motivo2',
    public._arr(e->'signs'), public._arr(e->'signsAll'), public._obj(e->'ex'), public._obj(e->'ans'),
    public._arr(s->'top',8), public._arr(s->'alta',8), public._arr(s->'soap',8), coalesce((s->>'soapAuto')::boolean,true),
    coalesce((s->>'insuf')::boolean,false), coalesce((s->>'sinDx')::boolean,false), public._arr(s->'faltan',30),
    coalesce((s->>'qVis')::int,0), public._arr(s->'qPend'), true)
  on conflict (codigo) do nothing
  returning id into v_id;

  if v_id is null then return false; end if;

  if jsonb_typeof(p_cierre) = 'object' then
    insert into public.cierres (caso, usuario, fecha, dx_codigo, dx_nombre, dx_capitulo, dx_nuevo, sin_dx, confirmacion, concomitantes, labs, tests, otros, notas)
    values (v_id, u, now(),
      case when jsonb_typeof(dx)='object' then nullif(dx->>'c','') end,
      case when jsonb_typeof(dx)='object' then dx->>'n' end,
      case when jsonb_typeof(dx)='object' then nullif(dx->>'cap','') end,
      case when jsonb_typeof(dx)='object' then coalesce((dx->>'nuevo')::boolean,false) else false end,
      coalesce((p_cierre->>'sinDx')::boolean,false), nullif(p_cierre->>'conf',''),
      public._arr(p_cierre->'con',20), public._obj(p_cierre->'labs'), public._obj(p_cierre->'tests'),
      left(p_cierre->>'otros',300), left(p_cierre->>'notas',600));
  end if;
  return true;
end $$;

revoke execute on function public.admin_casos(timestamptz,boolean), public.importar_caso(jsonb,jsonb) from public, anon;
grant execute on function public.admin_casos(timestamptz,boolean), public.importar_caso(jsonb,jsonb) to authenticated;
-- Funciones auxiliares: nunca invocables desde el cliente.
revoke execute on function public._exigir_sesion(), public._arr(jsonb,int), public._obj(jsonb),
  public._caso_json(public.casos), public._cierre_json(public.cierres), public.perfiles_proteger() from public, anon, authenticated;
