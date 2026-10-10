CREATE OR REPLACE FUNCTION public.forcer_contact_decede_inactif()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
BEGIN
    IF NEW."EstDécédé" THEN
        NEW."Actif" := false;
    END IF;

    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_contact_decede_inactif ON public."t_Contacts";

CREATE TRIGGER trg_contact_decede_inactif
BEFORE INSERT OR UPDATE ON public."t_Contacts"
FOR EACH ROW
EXECUTE FUNCTION public.forcer_contact_decede_inactif();

UPDATE public."t_Contacts"
SET "Actif" = false
WHERE "EstDécédé" = true
    AND "Actif" = true;
