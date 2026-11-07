-- t_Recompenses : lecture pour tous les utilisateurs actifs,
-- ajout / modification / suppression reserves aux roles SA et Admin.

ALTER TABLE public."t_Recompenses" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_t_Recompenses_select" ON public."t_Recompenses";
DROP POLICY IF EXISTS "auth_t_Recompenses_insert" ON public."t_Recompenses";
DROP POLICY IF EXISTS "auth_t_Recompenses_update" ON public."t_Recompenses";
DROP POLICY IF EXISTS "auth_t_Recompenses_delete" ON public."t_Recompenses";

CREATE POLICY "auth_t_Recompenses_select"
ON public."t_Recompenses"
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public."t_Users" u
        WHERE u."AuthUserId" = auth.uid()
        AND u."Actif" = true
    )
);

CREATE POLICY "auth_t_Recompenses_insert"
ON public."t_Recompenses"
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

CREATE POLICY "auth_t_Recompenses_update"
ON public."t_Recompenses"
FOR UPDATE
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public."t_Users" u
        WHERE u."AuthUserId" = auth.uid()
        AND u."Actif" = true
        AND u."Role"::text IN ('SA', 'Admin')
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM public."t_Users" u
        WHERE u."AuthUserId" = auth.uid()
        AND u."Actif" = true
        AND u."Role"::text IN ('SA', 'Admin')
    )
);

CREATE POLICY "auth_t_Recompenses_delete"
ON public."t_Recompenses"
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
