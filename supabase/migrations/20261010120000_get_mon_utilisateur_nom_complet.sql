DROP FUNCTION IF EXISTS public.get_mon_utilisateur();

CREATE FUNCTION public.get_mon_utilisateur()
RETURNS TABLE("IdUser" integer, "Login" character varying, "Role" character varying, "PwdChangeReq" boolean, "NomComplet" text)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
    SELECT
        u."IdUser",
        u."Login",
        u."Role",
        u."PwdChangeReq",
        COALESCE(
            NULLIF(
                btrim(
                    UPPER(COALESCE(NULLIF(c."NomUsage", ''), c."NomdeNaissance", '')) || ' ' || COALESCE(c."Prenom", '')
                ),
                ''
            ),
            u."Login"
        ) AS "NomComplet"
    FROM public."t_Users" u
    LEFT JOIN public."t_Contacts" c ON c."IdContact" = u."IdContact"
    WHERE u."AuthUserId" = auth.uid()
    AND u."Actif" = true;
$function$;

REVOKE ALL ON FUNCTION public.get_mon_utilisateur() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_mon_utilisateur() TO authenticated;
