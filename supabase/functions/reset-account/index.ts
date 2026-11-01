import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

function repondre(status: number, contenu: unknown): Response {
  return new Response(JSON.stringify(contenu), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return repondre(405, { message: 'Méthode non autorisée.' });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const cleAnonyme = Deno.env.get('SUPABASE_ANON_KEY');
  const cleService = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !cleAnonyme || !cleService) {
    console.error('Configuration Supabase manquante pour reset-account.');
    return repondre(500, { message: 'Configuration serveur incomplète.' });
  }

  const jeton = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!jeton) {
    return repondre(401, { message: 'Session requise.' });
  }

  const clientAuthentifie = createClient(supabaseUrl, cleAnonyme);
  const { data: authData, error: authError } = await clientAuthentifie.auth.getUser(jeton);
  if (authError || !authData.user) {
    return repondre(401, { message: 'Session invalide.' });
  }

  const admin = createClient(supabaseUrl, cleService, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: acteur, error: acteurError } = await admin
    .from('t_Users')
    .select('IdUser, Role, Actif')
    .eq('AuthUserId', authData.user.id)
    .maybeSingle();

  if (acteurError || !acteur || !acteur.Actif || acteur.Role !== 'SA') {
    return repondre(403, { message: 'Action réservée aux SA actifs.' });
  }

  let corps: Record<string, unknown>;
  try {
    corps = await request.json();
  } catch {
    return repondre(400, { message: 'Requête invalide.' });
  }

  const authUserId = typeof corps.AuthUserId === 'string' ? corps.AuthUserId.trim() : '';
  const login = typeof corps.login === 'string' ? corps.login.trim() : '';

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(authUserId)) {
    return repondre(400, { message: 'AuthUserId invalide.' });
  }
  if (!login || login.length > 72) {
    return repondre(400, { message: 'Mot de passe par défaut invalide.' });
  }

  try {
    const { data: cible, error: erreurCible } = await admin
      .from('t_Users')
      .select('IdUser')
      .eq('AuthUserId', authUserId)
      .maybeSingle();
    if (erreurCible) {
      throw erreurCible;
    }
    if (!cible) {
      return repondre(404, { message: 'Utilisateur introuvable.' });
    }

    const { error: erreurMotDePasse } = await admin.auth.admin.updateUserById(authUserId, {
      password: login,
    });
    if (erreurMotDePasse) {
      console.error('Réinitialisation du mot de passe Auth échouée :', erreurMotDePasse);
      return repondre(400, {
        message: `Impossible de réinitialiser le mot de passe : ${erreurMotDePasse.message}`,
      });
    }

    const { error: erreurExigence } = await admin
      .from('t_Users')
      .update({ PwdChangeReq: true })
      .eq('IdUser', cible.IdUser);
    if (erreurExigence) {
      console.error('Mise à jour de PwdChangeReq échouée :', erreurExigence);
      return repondre(500, {
        message:
          'Mot de passe réinitialisé, mais l’exigence de changement n’a pas pu être enregistrée.',
      });
    }

    return repondre(200, { success: true });
  } catch (error) {
    console.error('Erreur reset-account :', error);
    return repondre(500, { message: 'Erreur serveur pendant la réinitialisation.' });
  }
});
