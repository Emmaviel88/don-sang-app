import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const rolesAutorises = new Set(['User', 'Admin', 'SA']);
const dureeBlocage = '876000h';

class ErreurHttp extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function repondre(status: number, contenu: unknown): Response {
  return new Response(JSON.stringify(contenu), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function emailDepuisLogin(login: string): string {
  const identifiant = login
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, '-');
  return `${identifiant}+dondusangletholy@gmail.com`;
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
    console.error('Configuration Supabase manquante pour gestion-users.');
    return repondre(500, { message: 'Configuration serveur incomplète.' });
  }

  const authorization = request.headers.get('Authorization');
  const jeton = authorization?.replace(/^Bearer\s+/i, '');

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

  if (acteurError || !acteur || !acteur.Actif || !['Admin', 'SA'].includes(acteur.Role)) {
    return repondre(403, { message: 'Accès réservé aux administrateurs actifs.' });
  }

  let corps: Record<string, unknown>;
  try {
    corps = await request.json();
  } catch {
    return repondre(400, { message: 'Requête invalide.' });
  }

  try {
    if (corps.action === 'liste') {
      const { data: utilisateurs, error } = await admin
        .from('t_Users')
        .select('IdUser, IdContact, AuthUserId, Role, Actif, PwdChangeReq, DerniereCnx, Login')
        .order('Login', { ascending: true });

      if (error) {
        throw error;
      }

      const idsContacts = [...new Set((utilisateurs ?? []).map((ligne) => ligne.IdContact))];
      let contacts: Array<Record<string, unknown>> = [];

      if (idsContacts.length > 0) {
        const { data, error: erreurContacts } = await admin
          .from('t_Contacts')
          .select('IdContact, NomUsage, NomdeNaissance, Prenom, DateNaissance')
          .in('IdContact', idsContacts);

        if (erreurContacts) {
          throw erreurContacts;
        }
        contacts = data ?? [];
      }

      const contactsParId = new Map(contacts.map((contact) => [contact.IdContact, contact]));
      return repondre(200, {
        utilisateurs: (utilisateurs ?? []).map((utilisateur) => ({
          ...utilisateur,
          Contact: contactsParId.get(utilisateur.IdContact) ?? null,
        })),
      });
    }

    if (corps.action === 'creer') {
      const login = typeof corps.Login === 'string' ? corps.Login.trim() : '';
      const idContact = Number(corps.IdContact);
      const role = typeof corps.Role === 'string' ? corps.Role : '';
      const motDePasse = typeof corps.MotDePasseInitial === 'string' ? corps.MotDePasseInitial : '';

      if (!login || login.length > 50 || !Number.isInteger(idContact) || idContact < 1) {
        throw new ErreurHttp(400, 'Login ou contact invalide.');
      }
      if (!rolesAutorises.has(role) || (acteur.Role !== 'SA' && role !== 'User')) {
        throw new ErreurHttp(403, 'Vous ne pouvez pas attribuer ce rôle.');
      }
      if (motDePasse.length < 8 || !/[A-Z]/.test(motDePasse) || !/[@!%_\-0-9]/.test(motDePasse)) {
        throw new ErreurHttp(
          400,
          'Le mot de passe initial ne respecte pas la politique de sécurité.',
        );
      }

      const { data: loginExistant, error: erreurLogin } = await admin
        .from('t_Users')
        .select('IdUser')
        .eq('Login', login)
        .maybeSingle();
      if (erreurLogin) {
        throw erreurLogin;
      }
      if (loginExistant) {
        throw new ErreurHttp(409, 'Ce login est déjà utilisé.');
      }

      const { data: nouveauCompte, error: erreurAuth } = await admin.auth.admin.createUser({
        email: emailDepuisLogin(login),
        password: motDePasse,
        email_confirm: true,
        user_metadata: { login },
      });
      if (erreurAuth || !nouveauCompte.user) {
        console.error('Création Auth échouée :', erreurAuth);
        throw new ErreurHttp(409, 'Impossible de créer le compte Auth pour ce login.');
      }

      const { data: utilisateur, error: erreurInsertion } = await admin
        .from('t_Users')
        .insert({
          IdContact: idContact,
          AuthUserId: nouveauCompte.user.id,
          Role: role,
          Actif: true,
          PwdChangeReq: true,
          Login: login,
        })
        .select('IdUser, IdContact, AuthUserId, Role, Actif, PwdChangeReq, DerniereCnx, Login')
        .single();

      if (erreurInsertion || !utilisateur) {
        const { error: erreurSuppressionAuth } = await admin.auth.admin.deleteUser(
          nouveauCompte.user.id,
        );
        if (erreurSuppressionAuth) {
          console.error('Nettoyage du compte Auth échoué :', erreurSuppressionAuth);
        }
        console.error('Insertion t_Users échouée :', erreurInsertion);
        throw new ErreurHttp(400, 'Le compte applicatif n’a pas pu être créé.');
      }

      return repondre(201, { utilisateur });
    }

    if (corps.action === 'modifier') {
      const idUser = Number(corps.IdUser);
      if (!Number.isInteger(idUser) || idUser < 1) {
        throw new ErreurHttp(400, 'Utilisateur invalide.');
      }

      const { data: cible, error: erreurCible } = await admin
        .from('t_Users')
        .select('IdUser, AuthUserId, Role, Actif')
        .eq('IdUser', idUser)
        .maybeSingle();
      if (erreurCible) {
        throw erreurCible;
      }
      if (!cible) {
        throw new ErreurHttp(404, 'Utilisateur introuvable.');
      }
      if (acteur.Role !== 'SA' && cible.Role !== 'User') {
        throw new ErreurHttp(403, 'Seul un SA peut modifier un compte Admin ou SA.');
      }
      if (cible.IdUser === acteur.IdUser && corps.Actif === false) {
        throw new ErreurHttp(400, 'Vous ne pouvez pas désactiver votre propre compte.');
      }

      const modifications: Record<string, unknown> = {};
      if (corps.Role !== undefined) {
        if (typeof corps.Role !== 'string' || !rolesAutorises.has(corps.Role)) {
          throw new ErreurHttp(400, 'Rôle invalide.');
        }
        if (acteur.Role !== 'SA' && corps.Role !== 'User') {
          throw new ErreurHttp(403, 'Seul un SA peut attribuer un rôle Admin ou SA.');
        }
        modifications.Role = corps.Role;
      }
      if (corps.Actif !== undefined) {
        if (typeof corps.Actif !== 'boolean') {
          throw new ErreurHttp(400, 'État actif invalide.');
        }
        modifications.Actif = corps.Actif;
      }
      if (corps.PwdChangeReq !== undefined) {
        if (typeof corps.PwdChangeReq !== 'boolean') {
          throw new ErreurHttp(400, 'État du changement de mot de passe invalide.');
        }
        modifications.PwdChangeReq = corps.PwdChangeReq;
      }
      if (Object.keys(modifications).length === 0) {
        throw new ErreurHttp(400, 'Aucune modification à enregistrer.');
      }

      const nouveauRole = typeof modifications.Role === 'string' ? modifications.Role : cible.Role;
      const nouveauStatutActif =
        typeof modifications.Actif === 'boolean' ? modifications.Actif : cible.Actif;
      if (cible.Role === 'SA' && cible.Actif && (nouveauRole !== 'SA' || !nouveauStatutActif)) {
        const { count, error: erreurNombreSA } = await admin
          .from('t_Users')
          .select('IdUser', { count: 'exact', head: true })
          .eq('Role', 'SA')
          .eq('Actif', true);
        if (erreurNombreSA) {
          throw erreurNombreSA;
        }
        if ((count ?? 0) <= 1) {
          throw new ErreurHttp(400, 'Conservez au moins un compte SA actif.');
        }
      }

      const statutModifie = typeof modifications.Actif === 'boolean';
      if (statutModifie && cible.AuthUserId) {
        const { error: erreurBlocage } = await admin.auth.admin.updateUserById(cible.AuthUserId, {
          ban_duration: modifications.Actif ? 'none' : dureeBlocage,
        });
        if (erreurBlocage) {
          throw new ErreurHttp(400, 'Impossible de modifier l’accès au compte Auth.');
        }
      }

      const { data: utilisateur, error: erreurModification } = await admin
        .from('t_Users')
        .update(modifications)
        .eq('IdUser', idUser)
        .select('IdUser, IdContact, AuthUserId, Role, Actif, PwdChangeReq, DerniereCnx, Login')
        .single();

      if (erreurModification || !utilisateur) {
        if (statutModifie && cible.AuthUserId) {
          const { error: erreurRetourAuth } = await admin.auth.admin.updateUserById(
            cible.AuthUserId,
            {
              ban_duration: cible.Actif ? 'none' : dureeBlocage,
            },
          );
          if (erreurRetourAuth) {
            console.error('Rétablissement du statut Auth échoué :', erreurRetourAuth);
          }
        }
        throw new ErreurHttp(400, 'La modification du compte a échoué.');
      }

      return repondre(200, { utilisateur });
    }

    if (corps.action === 'supprimer') {
      const idUser = Number(corps.IdUser);
      if (!Number.isInteger(idUser) || idUser < 1) {
        throw new ErreurHttp(400, 'Utilisateur invalide.');
      }

      const { data: cible, error: erreurCible } = await admin
        .from('t_Users')
        .select('IdUser, IdContact, AuthUserId, Role, Actif, PwdChangeReq, DerniereCnx, Login')
        .eq('IdUser', idUser)
        .maybeSingle();
      if (erreurCible) {
        throw erreurCible;
      }
      if (!cible) {
        throw new ErreurHttp(404, 'Utilisateur introuvable.');
      }
      if (cible.IdUser === acteur.IdUser) {
        throw new ErreurHttp(400, 'Vous ne pouvez pas supprimer votre propre compte.');
      }
      if (acteur.Role !== 'SA' && cible.Role !== 'User') {
        throw new ErreurHttp(403, 'Seul un SA peut supprimer un compte Admin ou SA.');
      }

      if (cible.Role === 'SA' && cible.Actif) {
        const { count, error: erreurNombreSA } = await admin
          .from('t_Users')
          .select('IdUser', { count: 'exact', head: true })
          .eq('Role', 'SA')
          .eq('Actif', true);
        if (erreurNombreSA) {
          throw erreurNombreSA;
        }
        if ((count ?? 0) <= 1) {
          throw new ErreurHttp(400, 'Conservez au moins un compte SA actif.');
        }
      }

      const { data: utilisateurSupprime, error: erreurSuppressionLigne } = await admin
        .from('t_Users')
        .delete()
        .eq('IdUser', idUser)
        .select('IdUser')
        .maybeSingle();
      if (erreurSuppressionLigne) {
        throw erreurSuppressionLigne;
      }
      if (!utilisateurSupprime) {
        throw new ErreurHttp(404, 'Utilisateur introuvable.');
      }

      if (cible.AuthUserId) {
        const { error: erreurSuppressionAuth } = await admin.auth.admin.deleteUser(
          cible.AuthUserId,
        );

        if (erreurSuppressionAuth) {
          const { error: erreurRestauration } = await admin.from('t_Users').insert(cible);
          if (erreurRestauration) {
            console.error(
              'Restauration de t_Users échouée après erreur Auth :',
              erreurRestauration,
            );
            throw new ErreurHttp(
              500,
              'La suppression Auth a échoué et la ligne applicative doit être vérifiée dans la base.',
            );
          }

          console.error('Suppression Auth échouée :', erreurSuppressionAuth);
          throw new ErreurHttp(
            502,
            'La suppression du compte Auth a échoué. La ligne a été restaurée.',
          );
        }
      }

      return repondre(200, { success: true });
    }

    throw new ErreurHttp(400, 'Opération inconnue.');
  } catch (error) {
    if (error instanceof ErreurHttp) {
      return repondre(error.status, { message: error.message });
    }
    console.error('Erreur gestion-users :', error);
    return repondre(500, { message: 'Erreur serveur pendant la gestion du compte.' });
  }
});
