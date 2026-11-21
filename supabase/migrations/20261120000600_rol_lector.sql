-- ═══════════════════════════════════════════════════════════════
-- 06 · Rol «lector»: solo lectura del registro, para la exportación automática
-- Una cuenta con rol 'lector' puede leer el registro (tablas, vistas y admin_casos),
-- pero NO puede anular, importar, administrar perfiles ni escribir nada.
-- La usa scripts/exportar_registro.mjs (Excel en OneDrive cada 15 minutos).
-- ═══════════════════════════════════════════════════════════════

alter table public.perfiles drop constraint if exists perfiles_rol_check;
alter table public.perfiles add constraint perfiles_rol_check check (rol in ('veterinario', 'admin', 'lector'));

-- ¿Puede leer el registro? Admin o lector, activos.
create or replace function public.puede_leer()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.perfiles p
    where p.id = auth.uid() and p.rol in ('admin', 'lector') and p.activo
  );
$$;
revoke execute on function public.puede_leer() from public, anon;
grant execute on function public.puede_leer() to authenticated;

-- Lectura de tablas: admin o lector (sigue sin haber políticas de escritura).
drop policy if exists sesiones_leer_admin     on public.sesiones;
drop policy if exists casos_leer_admin        on public.casos;
drop policy if exists cierres_leer_admin      on public.cierres;
drop policy if exists cierres_hist_leer_admin on public.cierres_hist;
drop policy if exists eventos_leer_admin      on public.eventos;
create policy sesiones_leer     on public.sesiones     for select to authenticated using (public.puede_leer());
create policy casos_leer        on public.casos        for select to authenticated using (public.puede_leer());
create policy cierres_leer      on public.cierres      for select to authenticated using (public.puede_leer());
create policy cierres_hist_leer on public.cierres_hist for select to authenticated using (public.puede_leer());
create policy eventos_leer      on public.eventos      for select to authenticated using (public.puede_leer());

-- Nombre del veterinario en indicadores y Excel (antes solo para el admin).
create or replace function public.etiqueta_usuario(u uuid)
returns text language sql stable security definer set search_path = '' as $$
  select coalesce((select p.nombre from public.perfiles p where p.id = u and public.puede_leer()),
                  'Anónimo · disp. ' || upper(left(replace(u::text,'-',''), 4)));
$$;

-- Totales de acierto: visibles para admin y lector.
create or replace view public.v_acierto_resumen with (security_invoker = on) as
  select 'todos' as grupo, count(*)::int as n,
         count(*) filter (where top1 and dx_codigo is not null)::int as top1,
         count(*) filter (where top3 and dx_codigo is not null)::int as top3
  from public.v_acierto_casos having public.puede_leer()
  union all
  select 'confirmacion_objetiva', count(*)::int,
         count(*) filter (where top1 and dx_codigo is not null)::int,
         count(*) filter (where top3 and dx_codigo is not null)::int
  from public.v_acierto_casos where confirmacion_objetiva having public.puede_leer();

-- Listado del registro: admin o lector. (anular_caso e importar_caso siguen siendo solo admin.)
create or replace function public.admin_casos(p_desde timestamptz, p_incluir_pruebas boolean default false)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.puede_leer() then raise exception 'solo_admin' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'caso', public._caso_json(c) || jsonb_build_object('vet', public.etiqueta_usuario(c.usuario)),
             'cierre', public._cierre_json(k)) order by c.creado desc)
    from public.casos c left join public.cierres k on k.caso = c.id
    where c.creado >= p_desde and not c.anulado and (p_incluir_pruebas or not c.prueba)
  ), '[]'::jsonb);
end $$;
