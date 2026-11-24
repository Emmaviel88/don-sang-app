-- Accès global à l'application pour les Users/Admins, ouvert par le SA (4 h maximum).

CREATE TABLE IF NOT EXISTS public."t_AccesApplication" (
    "Id" integer PRIMARY KEY DEFAULT 1 CHECK ("Id" = 1),
    "Ouvert" boolean NOT NULL DEFAULT false,
    "OuvertJusquA" timestamptz NULL
);

INSERT INTO public."t_AccesApplication" ("Id", "Ouvert", "OuvertJusquA")
VALUES (1, false, NULL)
ON CONFLICT ("Id") DO NOTHING;

ALTER TABLE public."t_AccesApplication" ENABLE ROW LEVEL SECURITY;
-- Aucune policy : la table n'est accessible que via les fonctions ci-dessous.

-- Accès ouvert = interrupteur activé ET limite de temps non dépassée (réinitialisation automatique).
CREATE OR REPLACE FUNCTION public.get_etat_acces()
RETURNS TABLE ("Ouvert" boolean, "OuvertJusquA" timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
    SELECT
        COALESCE(a."Ouvert" AND a."OuvertJusquA" > now(), false),
        CASE WHEN a."Ouvert" AND a."OuvertJusquA" > now() THEN a."OuvertJusquA" END
    FROM public."t_AccesApplication" a
    WHERE a."Id" = 1;
$function$;

CREATE OR REPLACE FUNCTION public.acces_autorise()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
    SELECT EXISTS (
        SELECT 1
        FROM public."t_Users" u
        WHERE u."AuthUserId" = auth.uid()
          AND u."Actif" = true
          AND (
              u."Role" = 'SA'
              OR (SELECT e."Ouvert" FROM public.get_etat_acces() e)
          )
    );
$function$;

CREATE OR REPLACE FUNCTION public.definir_acces_application(p_duree_heures numeric)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_limite timestamptz;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public."t_Users" u
        WHERE u."AuthUserId" = auth.uid() AND u."Actif" = true AND u."Role" = 'SA'
    ) THEN
        RAISE EXCEPTION 'Action réservée au SA' USING ERRCODE = '42501';
    END IF;

    IF p_duree_heures IS NULL OR p_duree_heures <= 0 THEN
        UPDATE public."t_AccesApplication"
        SET "Ouvert" = false, "OuvertJusquA" = NULL
        WHERE "Id" = 1;
        RETURN NULL;
    END IF;

    IF p_duree_heures > 4 THEN
        RAISE EXCEPTION 'La durée maximale est de 4 heures' USING ERRCODE = '22023';
    END IF;

    v_limite := now() + make_interval(secs => (p_duree_heures * 3600)::double precision);

    UPDATE public."t_AccesApplication"
    SET "Ouvert" = true, "OuvertJusquA" = v_limite
    WHERE "Id" = 1;

    RETURN v_limite;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_etat_acces() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.acces_autorise() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.definir_acces_application(numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_etat_acces() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.acces_autorise() TO authenticated;
GRANT EXECUTE ON FUNCTION public.definir_acces_application(numeric) TO authenticated;

-- Verrou global : policy RESTRICTIVE sur chaque table protégée par RLS (cumulative avec les policies existantes).
DO $$
DECLARE
    v_table text;
BEGIN
    FOR v_table IN
        SELECT c.relname
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relkind IN ('r', 'p')
          AND c.relrowsecurity
          AND c.relname NOT IN ('t_Users', 't_AccesApplication')
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'auth_' || v_table || '_acces', v_table);
        EXECUTE format(
            'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (public.acces_autorise()) WITH CHECK (public.acces_autorise())',
            'auth_' || v_table || '_acces', v_table
        );
    END LOOP;
END
$$;
