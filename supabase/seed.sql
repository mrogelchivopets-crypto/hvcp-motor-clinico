-- ═══════════════════════════════════════════════════════════════
-- Datos de ejemplo SOLO para Supabase local (supabase start / supabase db reset).
-- No contiene datos reales. NO lo ejecute en el proyecto de producción.
-- Crea un administrador de prueba: admin@hvcp.test / Prueba-HVCP-2026
-- ═══════════════════════════════════════════════════════════════

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                        confirmation_token, recovery_token, email_change_token_new, email_change)
values ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
        'admin@hvcp.test', crypt('Prueba-HVCP-2026', gen_salt('bf')), now(),
        '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '')
on conflict (id) do nothing;

insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
values (gen_random_uuid(), 'a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001',
        '{"sub":"a0000000-0000-4000-8000-000000000001","email":"admin@hvcp.test"}', 'email', now(), now(), now())
on conflict do nothing;

insert into public.perfiles (id, nombre, rol) values
  ('a0000000-0000-4000-8000-000000000001', 'Administración (prueba)', 'admin')
on conflict (id) do nothing;
