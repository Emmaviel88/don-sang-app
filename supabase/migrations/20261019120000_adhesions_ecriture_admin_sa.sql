-- Ouvre l'enregistrement et la suppression d'une adhesion aux roles Admin et SA
-- (la modification d'une adhesion reste reservee a SA).

DROP POLICY IF EXISTS "auth_t_Adhesions_insert" ON public."t_Adhesions";
DROP POLICY IF EXISTS "auth_t_Adhesions_delete" ON public."t_Adhesions";

CREATE POLICY "auth_t_Adhesions_insert"
ON public."t_Adhesions"
FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM public."t_Users" u
        WHERE u."AuthUserId" = auth.uid()
        AND u."Actif" = true
        AND u."Role"::text IN ('SA', 'Admin')
    )
);

CREATE POLICY "auth_t_Adhesions_delete"
ON public."t_Adhesions"
FOR DELETE
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public."t_Users" u
        WHERE u."AuthUserId" = auth.uid()
        AND u."Actif" = true
        AND u."Role"::text IN ('SA', 'Admin')
    )
);
