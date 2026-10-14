CREATE OR REPLACE FUNCTION public.maj_derniere_cnx()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
    UPDATE public."t_Users"
    SET "DerniereCnx" = now() AT TIME ZONE 'Europe/Paris'
    WHERE "AuthUserId" = auth.uid()
    AND "Actif" = true;
$function$;

REVOKE ALL ON FUNCTION public.maj_derniere_cnx() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.maj_derniere_cnx() TO authenticated;
