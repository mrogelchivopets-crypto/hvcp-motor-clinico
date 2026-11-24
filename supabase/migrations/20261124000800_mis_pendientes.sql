-- ═══════════════════════════════════════════════════════════════
-- 08 · Casos por cerrar del propio dispositivo (M10, 24/11/2026)
-- El dispositivo (usuario anónimo) no puede leer el registro. Esta función le devuelve solo el código
-- y la fecha de SUS casos sin cierre, de entre 24 horas y 14 días, para el aviso «Tiene N casos por cerrar».
-- No expone datos clínicos ni casos de otros dispositivos. Mientras no se aplique, la página usa la lista
-- local del dispositivo (localStorage) como respaldo.
-- ═══════════════════════════════════════════════════════════════

create or replace function public.mis_pendientes()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare u uuid := public._exigir_sesion();
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object('codigo', c.codigo, 'creado', c.creado) order by c.creado)
    from public.casos c
    left join public.cierres k on k.caso = c.id
    where c.usuario = u and not c.anulado and not c.prueba
      and c.creado < now() - interval '24 hours' and c.creado > now() - interval '14 days'
      and not coalesce(k.sin_dx or (k.dx_nombre is not null and k.confirmacion is not null), false)
  ), '[]'::jsonb);
end $$;

revoke execute on function public.mis_pendientes() from public, anon;
grant execute on function public.mis_pendientes() to authenticated;
