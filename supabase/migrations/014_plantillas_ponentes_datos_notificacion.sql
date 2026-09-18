-- Las tres plantillas de contrato de ponentes traían, en la cláusula de
-- notificaciones, el texto del Word sin conectar al formulario:
--   EL PONENTE: Dirección: (dirección ponente) Correo electrónico: (correo
--   ponente) Celular: (celular ponente)
-- Todo contrato de ponente salía con esos paréntesis literales en vez de los
-- datos. Se enlazan con las variables que las plantillas ya piden
-- ({{direccion}}, {{email}}, {{celular}}).
--
-- Solo cambia la plantilla: los contratos ya creados guardan su propio
-- rendered_html y no se tocan (sobre ese HTML se calcula el hash de la firma).
--
-- Ejecutar en: https://supabase.com/dashboard/project/hidkhplgahoiusfxfrzi/sql/new

update contratos.contract_templates
   set content = replace(replace(replace(
         content,
         '(dirección ponente)', '{{direccion}}'),
         '(correo ponente)', '{{email}}'),
         '(celular ponente)', '{{celular}}'),
       updated_at = now()
 where slug in (
         '1-modelo-de-contrato-ponentes-con-pago-ponencia-viaticos-bla',
         '2-modelo-contrato-ponentes-pago-viaticos-black-y-vip',
         '3-modelo-contrato-ponentes-sin-ningun-pago-y-con-derecho-a-b'
       )
   and content like '%(dirección ponente)%';
