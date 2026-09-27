import { ChangeDetectorRef, Component, effect, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DonneurSelectionService, DonneurSelectionne } from '../../services/donneur-selection';
import { SupabaseService } from '../../services/supabase';
import { SessionService } from '../../services/session';

interface ResultatRecherche {
  IdContact: number;
  Civilite: string | null;
  NomUsage: string | null;
  NomdeNaissance: string | null;
  Prenom: string | null;
  DateNaissance: string | null;
}

interface Adhesion {
  IdAdhesion: number;
  IdContact: number;
  annee: number;
  DateAdhesion: string | null;
  Cotisation: number | null;
  Statut: string | null;
}

@Component({
  selector: 'app-adhesion-amicale',
  standalone: true,
  imports: [DatePipe, FormsModule],
  templateUrl: './adhesion-amicale.html',
  styleUrl: './adhesion-amicale.css',
})
export class AdhesionAmicale {
  donneurSelectionne = signal<DonneurSelectionne | null>(null);
  adhesions = signal<Adhesion[]>([]);

  recherche = '';
  resultats: ResultatRecherche[] = [];
  rechercheEnCours = false;
  rechercheEffectuee = false;

  private minuterieRecherche: ReturnType<typeof setTimeout> | null = null;
  private numeroRecherche = 0;

  anneeAEditer = signal(new Date().getFullYear() + 1);
  nbTotalAdherents = signal(0);
  message = signal('');

  constructor(
    private donneurSelection: DonneurSelectionService,
    private supabase: SupabaseService,
    private session: SessionService,
    private cdr: ChangeDetectorRef,
  ) {
    effect(() => {
      const donneur = this.donneurSelection.donneur();

      this.donneurSelectionne.set(donneur);

      if (donneur) {
        void this.chargerAdhesions(donneur.IdContact);
      } else {
        this.adhesions.set([]);
      }
    });

    void this.chargerNbAdherents(this.anneeAEditer());
  }

  rechercherDonneurs(): void {
    if (this.minuterieRecherche !== null) {
      clearTimeout(this.minuterieRecherche);
      this.minuterieRecherche = null;
    }

    this.resultats = [];
    this.rechercheEffectuee = false;

    const texte = this.recherche.trim();

    if (texte.length < 2) {
      this.rechercheEnCours = false;
      this.cdr.detectChanges();
      return;
    }

    this.rechercheEnCours = true;

    this.cdr.detectChanges();

    const numeroRechercheActuelle = ++this.numeroRecherche;

    this.minuterieRecherche = setTimeout(() => {
      this.minuterieRecherche = null;
      void this.executerRecherche(texte, numeroRechercheActuelle);
    }, 250);
  }

  private async executerRecherche(texte: string, numeroRechercheActuelle: number): Promise<void> {
    try {
      const terme = `${texte}%`;

      const { data, error } = await this.supabase.client
        .from('t_Contacts')
        .select(
          `
          IdContact,
          Civilite,
          NomUsage,
          NomdeNaissance,
          Prenom,
          DateNaissance
        `,
        )
        .or(`NomUsage.ilike.${terme},NomdeNaissance.ilike.${terme}`)
        .order('NomUsage', { ascending: true })
        .order('Prenom', { ascending: true })
        .order('DateNaissance', { ascending: true })
        .limit(20);

      if (error) {
        throw error;
      }

      if (numeroRechercheActuelle !== this.numeroRecherche) {
        return;
      }

      this.resultats = (data ?? []) as ResultatRecherche[];
      this.rechercheEffectuee = true;

      this.cdr.detectChanges();
    } catch (error) {
      if (numeroRechercheActuelle !== this.numeroRecherche) {
        return;
      }

      console.error('ERREUR RECHERCHE DONNEUR :', error);
      this.message.set('Erreur pendant la recherche.');

      this.cdr.detectChanges();
    } finally {
      if (numeroRechercheActuelle === this.numeroRecherche) {
        this.rechercheEnCours = false;

        this.cdr.detectChanges();
      }
    }
  }

  async selectionnerDonneur(idContact: number): Promise<void> {
    try {
      this.message.set('');

      const { data, error } = await this.supabase.client
        .from('t_Contacts')
        .select(
          `
          IdContact,
          NomUsage,
          Prenom,
          DateNaissance,
          NbDonsAvant2013
        `,
        )
        .eq('IdContact', idContact)
        .maybeSingle();

      if (error) {
        throw error;
      }

      if (!data) {
        this.message.set('Donneur introuvable.');
        return;
      }

      this.donneurSelection.definirDonneur({
        IdContact: data.IdContact,
        NomUsage: data.NomUsage,
        Prenom: data.Prenom,
        DateNaissance: data.DateNaissance,
        NbDonsAvant2013: data.NbDonsAvant2013 ?? 0,
        eligible: false,
      });

      this.recherche = '';
      this.resultats = [];
      this.rechercheEffectuee = false;
      this.rechercheEnCours = false;

      this.cdr.detectChanges();
    } catch (error) {
      console.error('ERREUR SÉLECTION DONNEUR :', error);
      this.message.set('Impossible de sélectionner le donneur.');

      this.cdr.detectChanges();
    }
  }

  afficherResultat(resultat: ResultatRecherche): string {
    return [resultat.NomUsage, resultat.Prenom]
      .filter((valeur) => valeur !== null && valeur !== '')
      .join(' ');
  }

  async chargerAdhesions(IdContact: number): Promise<void> {
    try {
      console.log('ID CONTACT ADHÉSIONS :', IdContact);

      const adhesions = await this.supabase.getAdhesions(IdContact);

      console.log('ADHÉSIONS CHARGÉES :', adhesions);

      this.adhesions.set(adhesions);
    } catch (error) {
      console.error('ERREUR CHARGEMENT ADHÉSIONS :', error);
      this.adhesions.set([]);
    }
  }

  async chargerNbAdherents(annee: number): Promise<void> {
    try {
      const nbAdherents = await this.supabase.getNbAdherents(annee);

      this.nbTotalAdherents.set(nbAdherents);
    } catch (error) {
      console.error('ERREUR CHARGEMENT NOMBRE ADHÉRENTS :', error);
      this.nbTotalAdherents.set(0);
    }
  }

  async selectionnerAnnee(annee: number): Promise<void> {
    const anneeMax = new Date().getFullYear() + 1;

    if (annee > anneeMax) {
      this.message.set(
        `L'année ${annee} ne peut pas être sélectionnée : les adhésions ne peuvent actuellement pas être enregistrées au delà de l'année ${anneeMax}.`,
      );
      return;
    }

    this.message.set('');
    this.anneeAEditer.set(annee);

    await this.chargerNbAdherents(annee);
  }

  estSA(): boolean {
    const utilisateur = this.session.utilisateur();

    return utilisateur?.Role === 'SA';
  }

  adhesionAnneeSelectionnee(): Adhesion | undefined {
    const annee = this.anneeAEditer();

    return this.adhesions().find((adhesion) => adhesion.annee === annee);
  }

  peutAjouterAdhesion(): boolean {
    if (!this.donneurSelectionne()) {
      return false;
    }

    if (!this.estSA()) {
      return false;
    }

    return !this.adhesionAnneeSelectionnee();
  }

  peutSupprimerAdhesion(): boolean {
    if (!this.donneurSelectionne()) {
      return false;
    }

    if (!this.estSA()) {
      return false;
    }

    return !!this.adhesionAnneeSelectionnee();
  }

  async ajouterAdhesion(): Promise<void> {
    const donneur = this.donneurSelectionne();

    if (!donneur) {
      return;
    }

    if (!this.estSA()) {
      return;
    }

    if (this.adhesionAnneeSelectionnee()) {
      return;
    }

    try {
      this.message.set('');

      await this.supabase.ajouterAdhesion(donneur.IdContact, this.anneeAEditer());

      await this.chargerAdhesions(donneur.IdContact);
      await this.chargerNbAdherents(this.anneeAEditer());
    } catch (error) {
      console.error('ERREUR AJOUT ADHÉSION :', error);
      this.message.set('Impossible d’ajouter l’adhésion.');
    }
  }

  async supprimerAdhesion(): Promise<void> {
    const donneur = this.donneurSelectionne();
    const adhesion = this.adhesionAnneeSelectionnee();

    if (!donneur || !adhesion) {
      return;
    }

    if (!this.estSA()) {
      return;
    }

    try {
      this.message.set('');

      await this.supabase.supprimerAdhesion(adhesion.IdAdhesion);

      await this.chargerAdhesions(donneur.IdContact);
      await this.chargerNbAdherents(this.anneeAEditer());
    } catch (error) {
      console.error('ERREUR SUPPRESSION ADHÉSION :', error);
      this.message.set('Impossible de supprimer l’adhésion.');
    }
  }
}
