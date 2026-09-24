import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { SupabaseService } from '../../services/supabase';
import { SessionService } from '../../services/session';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './login.html',
  styleUrl: './login.css'
})
export class LoginComponent {

  logins = signal<string[]>([]);
  login = '';
  password = '';
  message = signal('');
  chargement = signal(false);

  constructor(
    private supabase: SupabaseService,
    private session: SessionService,
    private router: Router
  ) {
    this.chargerLogins();
  }

  async chargerLogins() {
    try {
      const logins = await this.supabase.getLogins();
      this.logins.set(logins);
      console.log('LOGINS CHARGÉS :', logins);
    } catch (error) {
      console.error('ERREUR CHARGEMENT LOGINS :', error);
      this.message.set('Impossible de charger la liste des utilisateurs.');
    }
  }

  async seConnecter() {

    if (this.chargement()) {
      return;
    }

    this.message.set('');
    this.chargement.set(true);

    const email = this.login
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\s+/g, '-')
      + '+dondusangletholy@gmail.com';

    const { error } = await this.supabase.client.auth.signInWithPassword({
      email: email,
      password: this.password
    });

    if (error) {
      console.error('ERREUR SIGNIN :', error);
      this.chargement.set(false);
      this.message.set('Mot de passe incorrect.');
      this.password = '';
      return;
    }

    const { data: userData, error: userError } =
      await this.supabase.client.rpc('get_mon_utilisateur');

    if (userError) {
      this.chargement.set(false);
      console.error('ERREUR T_USER :', userError);
      this.message.set('Impossible de récupérer les informations utilisateur.');
      return;
    }

    if (!userData || userData.length === 0) {
      this.chargement.set(false);
      this.message.set('Utilisateur non trouvé.');
      return;
    }

    const utilisateur = userData[0];

    console.log('UTILISATEUR CONNECTÉ :', utilisateur);

    this.session.definirUtilisateur({
      IdUser: utilisateur.IdUser,
      Login: utilisateur.Login,
      Role: utilisateur.Role
    });

    try {
      const nombreContacts = await this.supabase.testerLectureContacts();
      console.log('LECTURE t_Contacts RÉUSSIE :', nombreContacts, 'contacts');
    } catch (error) {
      console.error('ERREUR LECTURE t_Contacts :', error);
    }

    if (utilisateur.PwdChangeReq) {
      this.chargement.set(false);
      await this.router.navigate(['/changer-mot-de-passe']);
      return;
    }

    this.chargement.set(false);
    await this.router.navigate(['/accueil']);
  }
}