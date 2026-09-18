-- ================================================
-- Migration: cerrar lo que se podia leer SIN sesion
-- ================================================
--
-- Hallazgo del 2026-09-18, verificado con la llave anon (que es publica: va
-- dentro del codigo de contratos.feriaeffix.com y de master.feriaeffix.com):
--
--   contacts_with_stats   74 de 74 filas visibles sin sesion
--   saved_reports         28 de 28
--   benchmark_config      18 de 18
--
-- La vista `contacts_with_stats` entregaba nombre, tipo y numero de
-- documento, NIT, representante legal y su documento, email, telefono,
-- celular, direccion, persona encargada y notas de los 74 contactos. La
-- tabla `contacts` SI estaba protegida (0 filas sin sesion), pero una vista
-- en Postgres corre con los permisos de su duenio y no con los de quien la
-- consulta: se saltaba esa proteccion.
--
-- `saved_reports` y `benchmark_config` no son de este sistema: son de
-- carteleraeffi, que vive en OTRO proyecto de Supabase (nialmgwqajvjtayyagba)
-- y no lee de este. Llegaron como copia huerfana, con sus reglas de
-- "cualquiera puede leer, insertar, editar y borrar". Ninguna app las usa
-- aca, asi que se cierran del todo (solo service_role). No se borran: si
-- alguien las necesita, los datos siguen ahi.
--
-- Esta migracion NO cambia lo que ve un usuario con sesion en la app: la
-- vista pasa a respetar las reglas de `contacts`, que hoy dejan leer a
-- cualquier usuario autenticado. Restringir eso a quien opera contratos es
-- un paso aparte (ver 013), que necesita saber primero quien es.
--
-- El flujo publico de firma no se toca: usa funciones SECURITY DEFINER por
-- token (get_contract_by_token, sign_contract, mark_contract_viewed,
-- get_signed_contract_by_token), que no dependen de estas reglas.
-- ================================================

-- 1. La vista respeta las reglas de la tabla que lee (Postgres 15+).
alter view contratos.contacts_with_stats set (security_invoker = true);

-- 2. Tablas huerfanas de carteleraeffi: RLS encendido y sin ninguna regla.
--    Se borran las reglas existentes sin depender de sus nombres (no estan
--    en este repo), recorriendolas desde el catalogo.
alter table contratos.saved_reports enable row level security;
alter table contratos.benchmark_config enable row level security;

do $cerrar$
declare
  r record;
begin
  for r in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'contratos'
      and tablename in ('saved_reports', 'benchmark_config')
  loop
    execute format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $cerrar$;

revoke all on contratos.saved_reports from anon, authenticated;
revoke all on contratos.benchmark_config from anon, authenticated;

-- 3. Funciones que no tienen por que poder llamarse sin sesion.
--    upsert_contact escribe contactos saltandose las reglas (SECURITY
--    DEFINER) y solo la usa el formulario de nuevo contrato, que corre con
--    sesion. rls_auto_enable no la llama ninguna app. Se revoca sobre todas
--    sus firmas, desde el catalogo, para no depender de la lista exacta de
--    argumentos.
do $funciones$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as firma, p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'contratos'
      and p.proname in ('upsert_contact', 'rls_auto_enable')
  loop
    execute format('revoke execute on function %s from public, anon', f.firma);
    if f.proname = 'rls_auto_enable' then
      execute format('revoke execute on function %s from authenticated', f.firma);
    else
      -- authenticated suele tener execute HEREDADO de public, no propio. Sin
      -- este grant explicito, el revoke de arriba tambien le quitaria la
      -- funcion al formulario de nuevo contrato, que corre con sesion.
      execute format('grant execute on function %s to authenticated', f.firma);
    end if;
  end loop;
end $funciones$;
