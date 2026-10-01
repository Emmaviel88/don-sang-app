CREATE OR REPLACE FUNCTION public.supprimer_donneur_complet(p_id_contact integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
    actor_role text;
BEGIN
    actor_role := public."RoleUtilisateur"();

    IF actor_role IS NULL OR actor_role NOT IN ('Admin', 'SA') THEN
        RAISE EXCEPTION 'La suppression est reservee aux roles Admin et SA.' USING ERRCODE = '42501';
    END IF;

    PERFORM 1
    FROM public."t_Contacts"
    WHERE "IdContact" = p_id_contact
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Donneur introuvable.' USING ERRCODE = 'P0002';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public."t_Users"
        WHERE "IdContact" = p_id_contact
    ) THEN
        RAISE EXCEPTION 'Ce donneur est lie a un compte utilisateur. Supprimez d''abord ce compte dans la page Utilisateurs.'
            USING ERRCODE = '23503';
    END IF;

    DELETE FROM public."t_Dons" WHERE "IdDonneur" = p_id_contact;
    DELETE FROM public."t_Adhesions" WHERE "IdContact" = p_id_contact;
    DELETE FROM public."t_ContactsFonctions" WHERE "IdContact" = p_id_contact;
    DELETE FROM public."t_Adresses" WHERE "IdContact" = p_id_contact;
    DELETE FROM public."t_MoyensContact" WHERE "IdContact" = p_id_contact;
    DELETE FROM public."t_Contacts" WHERE "IdContact" = p_id_contact;
END;
$$;

REVOKE ALL ON FUNCTION public.supprimer_donneur_complet(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supprimer_donneur_complet(integer) TO authenticated;