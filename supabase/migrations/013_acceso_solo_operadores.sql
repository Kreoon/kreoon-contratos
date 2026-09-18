-- ================================================
-- Migration: el sistema de contratos, solo para quien opera contratos
-- ================================================
--
-- Hasta aca, todas las reglas del esquema decian `auth.role() =
-- 'authenticated'`: cualquier usuario con sesion. El problema es que este
-- sistema comparte proyecto de Supabase -y por lo tanto usuarios- con el
-- panel interno de Feria Effix (master.feriaeffix.com), que tiene 20 cuentas:
-- colaboradores de varias areas, gestores y, desde el modulo de Ventas,
-- vendedores aliados externos con cuenta propia. Cualquiera de ellos podia
-- iniciar sesion en contratos.feriaeffix.com y ver los contratos con montos,
-- documentos y firmas de patrocinadores, stands y ponentes.
--
-- Quien opera contratos (decidido el 2026-09-18):
--   - directivos y administrativo del panel: public.es_admin_global(), la
--     misma regla que el panel usa para administracion global.
--   - las cuentas listadas en contratos.operadores. Hoy son tres cuentas
--     que operan contratos sin tener rol directivo ni administrativo en el
--     panel.
--
-- Por que una tabla y no los correos escritos en la funcion: esto es codigo
-- versionado y los correos de personas no van en migraciones. Los ids se
-- cargan por script (ver scripts o el README) y agregar a alguien mas es
-- insertar una fila, sin tocar codigo.
--
-- El flujo publico de firma (sponsors, stands, ponentes firmando por link)
-- NO depende de estas reglas: usa funciones SECURITY DEFINER por token.
-- ================================================

-- 1. Quienes, ademas de directivos y administrativo, operan contratos.
create table if not exists contratos.operadores (
  usuario_id uuid primary key references auth.users (id) on delete cascade,
  nota text,
  agregado_en timestamptz not null default now()
);

comment on table contratos.operadores is
  'Cuentas que operan el sistema de contratos sin ser directivo ni '
  'administrativo en el panel. La lee solo contratos.puede_operar_contratos(). '
  'Sin reglas para anon ni authenticated: nadie la lista desde la app.';

alter table contratos.operadores enable row level security;
revoke all on contratos.operadores from anon, authenticated;

-- 2. La pregunta, en un solo lugar.
create or replace function contratos.puede_operar_contratos()
returns boolean
language sql stable security definer
set search_path = contratos, public
as $fn$
  select public.es_admin_global()
      or exists (
        select 1 from contratos.operadores where usuario_id = auth.uid()
      )
$fn$;

comment on function contratos.puede_operar_contratos() is
  'true si quien consulta opera contratos: directivo o administrativo del '
  'panel, o una cuenta en contratos.operadores. La usan todas las reglas del '
  'esquema y la app (para mostrar "sin acceso" en vez de pantallas vacias).';

revoke execute on function contratos.puede_operar_contratos() from public, anon;
grant execute on function contratos.puede_operar_contratos() to authenticated;

-- 3. Todas las tablas del sistema: se borran las reglas viejas (sin depender
--    de sus nombres, recorriendo el catalogo) y queda una sola por tabla.
do $reglas$
declare
  t text;
  r record;
begin
  foreach t in array array[
    'contract_templates', 'contracts', 'signatures', 'audit_trail',
    'contacts', 'payment_installments'
  ]
  loop
    execute format('alter table contratos.%I enable row level security', t);

    for r in
      select policyname from pg_policies
      where schemaname = 'contratos' and tablename = t
    loop
      execute format('drop policy %I on contratos.%I', r.policyname, t);
    end loop;

    execute format(
      'create policy operadores_todo on contratos.%I for all to authenticated '
      'using (contratos.puede_operar_contratos()) '
      'with check (contratos.puede_operar_contratos())',
      t
    );
  end loop;
end $reglas$;

-- 4. La vista de contactos ya respeta las reglas de `contacts` desde la 012
--    (security_invoker), asi que queda cubierta por la regla de arriba.
