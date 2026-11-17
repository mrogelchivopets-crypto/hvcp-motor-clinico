-- ═══════════════════════════════════════════════════════════════
-- Motor Clínico de Urgencias HVCP v7.9.6 · registro en línea
-- 01 · Esquema base
-- Sin datos del propietario (nombre, teléfono, dirección, expediente): nunca.
-- ═══════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

-- ─── Perfiles: solo para cuentas con correo (administradores) ───
-- Los médicos usan el motor con sesión anónima y no tienen perfil.
create table public.perfiles (
  id         uuid primary key references auth.users(id) on delete restrict,
  nombre     text not null check (char_length(nombre) between 2 and 80),
  rol        text not null default 'veterinario' check (rol in ('veterinario','admin')),
  activo     boolean not null default true,
  creado     timestamptz not null default now()
);
comment on table public.perfiles is 'Cuentas con correo. rol=admin ve todo el registro.';

-- ─── Sesiones de uso del motor (una por dispositivo y apertura) ───
create table public.sesiones (
  id             uuid primary key default gen_random_uuid(),
  usuario        uuid not null default auth.uid(),          -- uid anónimo del dispositivo o uid del admin
  inicio         timestamptz not null default now(),
  ultimo_latido  timestamptz not null default now(),
  dispositivo    text check (char_length(dispositivo) <= 120),
  version_motor  text not null check (char_length(version_motor) <= 20)
);
create index sesiones_usuario_idx on public.sesiones (usuario, inicio desc);

-- ─── Casos (uno por nota SOAP registrada) ───
create table public.casos (
  id                uuid primary key default gen_random_uuid(),
  codigo            text not null unique check (codigo ~ '^MC-[A-HJ-NP-Z2-9]{6}$'),
  usuario           uuid not null,                           -- uid que lo registró (anónimo o admin)
  sesion            uuid references public.sesiones(id) on delete set null,
  creado            timestamptz not null,                    -- hora de la primera nota SOAP (campo f del motor)
  actualizado       timestamptz not null default now(),      -- última regeneración de la nota (campo fa)
  version_motor     text not null check (char_length(version_motor) <= 20),
  -- datos del paciente (sin propietario)
  especie           text check (especie in ('c','f')),
  edad              text,
  sexo              text,
  peso              numeric(6,2) check (peso is null or (peso > 0 and peso < 200)),
  hemo              text,
  motivo            text,
  motivo2           text,
  signos            jsonb not null default '[]'::jsonb,      -- signos marcados por el médico
  signos_todos      jsonb not null default '[]'::jsonb,      -- signos efectivos (incluye los derivados del examen)
  examen            jsonb not null default '{}'::jsonb,      -- ST.ex
  respuestas        jsonb not null default '{}'::jsonb,      -- ST.ans
  antecedentes      jsonb not null default '[]'::jsonb,      -- ST.hxs
  vacunacion        jsonb not null default '[]'::jsonb,      -- ST.vac
  -- salida del motor
  top               jsonb not null default '[]'::jsonb,      -- top 8 [{id,c,n,sys,sc}] (el top 5 son los 5 primeros)
  alta              jsonb not null default '[]'::jsonb,      -- códigos VetCIE-1 de alta probabilidad
  soap_dx           jsonb not null default '[]'::jsonb,      -- códigos usados en la nota SOAP
  soap_auto         boolean not null default true,
  insuficiente      boolean not null default false,
  sin_dx            boolean not null default false,
  faltan            jsonb not null default '[]'::jsonb,
  q_visibles        integer not null default 0,
  q_pendientes      jsonb not null default '[]'::jsonb,
  alertas           jsonb not null default '[]'::jsonb,      -- [[nivel,título]] mostradas al generar la nota
  minutos_soap      integer check (minutos_soap is null or minutos_soap between 0 and 1440),
  -- control
  prueba            boolean not null default false,          -- «No registrar (prueba o docencia)»: no cuenta en indicadores
  migrado           boolean not null default false,          -- importado desde el Excel del registro anterior
  anulado           boolean not null default false,
  anulado_por       uuid,
  anulado_fecha     timestamptz,
  anulado_motivo    text check (char_length(anulado_motivo) <= 300)
);
create index casos_creado_idx  on public.casos (creado desc);
create index casos_usuario_idx on public.casos (usuario, creado desc);

-- ─── Cierre del caso (diagnóstico definitivo) ───
-- Mismos campos que el cierre actual del motor: dx{c,n,cap,nuevo}, con[], sinDx, conf, labs{}, tests{}, otros, notas.
create table public.cierres (
  caso          uuid primary key references public.casos(id) on delete restrict,
  usuario       uuid not null,
  fecha         timestamptz not null default now(),
  dx_codigo     text check (char_length(dx_codigo) <= 40),
  dx_nombre     text check (char_length(dx_nombre) <= 120),
  dx_capitulo   text check (char_length(dx_capitulo) <= 4),
  dx_nuevo      boolean not null default false,
  sin_dx        boolean not null default false,
  confirmacion  text check (confirmacion is null or confirmacion in ('histo','lab','img','qx','resp','clin')),
  concomitantes jsonb not null default '[]'::jsonb,
  labs          jsonb not null default '{}'::jsonb,
  tests         jsonb not null default '{}'::jsonb,
  otros         text check (char_length(otros) <= 300),
  notas         text check (char_length(notas) <= 600)
);

-- Historial de cierres: cada guardado queda auditado (nadie borra).
create table public.cierres_hist (
  id        bigint generated always as identity primary key,
  caso      uuid not null references public.casos(id) on delete restrict,
  usuario   uuid not null,
  fecha     timestamptz not null default now(),
  datos     jsonb not null
);

-- ─── Eventos de uso (liviano) ───
create table public.eventos (
  id       bigint generated always as identity primary key,
  usuario  uuid not null default auth.uid(),
  sesion   uuid references public.sesiones(id) on delete set null,
  caso     uuid references public.casos(id) on delete set null,
  tipo     text not null check (tipo in ('copiar_soap','nuevo_paciente','abrir_registro','exportar','cerrar_caso')),
  fecha    timestamptz not null default now()
);
create index eventos_fecha_idx on public.eventos (fecha desc);
