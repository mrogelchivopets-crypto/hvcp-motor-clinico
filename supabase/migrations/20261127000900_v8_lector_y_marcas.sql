-- ═══════════════════════════════════════════════════════════════
-- 09 · v8.0: correcciones para la exportación y el análisis (27/11/2026). Requiere la 06 y la 08.
-- · admin_casos: la 08 la volvió a limitar a administradores (es_admin) y la cuenta lectora de la
--   exportación de las 10:00 y 16:00 dejaba de poder leer el registro. Vuelve a usar puede_leer()
--   (administrador o lector) y conserva el nombre del médico de la 08.
-- · critico y rcp: una vez marcados, no se pierden. Si el médico marca «Crítico ER», genera la nota y
--   después completa el examen y la vuelve a generar, registrar_caso sobrescribía critico = false y no
--   se podía saber cuántos pacientes críticos completaron el examen después. conciencia guarda el último valor.
-- ═══════════════════════════════════════════════════════════════

create or replace function public.admin_casos(p_desde timestamptz, p_incluir_pruebas boolean default false)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.puede_leer() then raise exception 'solo_admin' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'caso', public._caso_json(c) || jsonb_build_object('vet', coalesce((select m.nombre from public.medicos m where m.id = c.medico_id), public.etiqueta_usuario(c.usuario))),
             'cierre', public._cierre_json(k)) order by c.creado desc)
    from public.casos c left join public.cierres k on k.caso = c.id
    where c.creado >= p_desde and not c.anulado and (p_incluir_pruebas or not c.prueba)
  ), '[]'::jsonb);
end $$;

create or replace function public._casos_marcas_fijas()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.critico := old.critico or coalesce(new.critico, false);
  new.rcp := old.rcp or coalesce(new.rcp, false);
  return new;
end $$;

drop trigger if exists casos_marcas_fijas on public.casos;
create trigger casos_marcas_fijas before update on public.casos
  for each row execute function public._casos_marcas_fijas();

-- Turnos del hospital (Dirección General, 27/11/2026): diurno 6:00 a. m.–6:00 p. m. y nocturno 6:00 p. m.–6:00 a. m.
-- (antes: mañana 7–15, tarde 15–23, noche 23–7). Lo usan las vistas v_casos_validos y v_casos_por_dia.
create or replace function public.turno_de(t timestamptz)
returns text language sql immutable as $$
  select case when extract(hour from t at time zone 'America/El_Salvador') between 6 and 17 then 'diurno' else 'nocturno' end;
$$;
