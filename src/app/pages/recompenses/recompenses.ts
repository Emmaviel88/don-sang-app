import { ChangeDetectorRef, Component, computed, effect, OnDestroy, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DonneurSelectionService, DonneurSelectionne } from '../../services/donneur-selection';
import { SupabaseService } from '../../services/supabase';
import { SessionService } from '../../services/session';
import {
  RechercheContactController,
  ResultatRechercheContact,
} from '../../services/recherche-contact';

interface Recompense {
  IdRecompense: number;
  IdContact: number;
  NiveauEFS: number;
  DateAttribution: string;
}

@Component({
  selector: 'app-recompenses',
  standalone: true,
  imports: [DatePipe, FormsModule],
  templateUrl: './recompenses.html',
  styleUrl: './recompenses.css',
})
export class GestionRecompenses implements OnDestroy {
  readonly niveaux = [1, 2, 3, 4, 5, 6, 7];

  readonly criteres = [
    { niveau: '1er', femmes: '3 dons', hommes: '5 dons', insigne: 'Bronze' },
    { niveau: '2ème', femmes: '10 dons', hommes: '10 dons', insigne: 'Bronze' },
    { niveau: '3ème', femmes: '25 dons', hommes: '25 dons', insigne: 'Bronze' },
    { niveau: '4ème', femmes: '45 dons', hommes: '75 dons', insigne: 'Argent' },
    { niveau: '5ème', femmes: '60 dons', hommes: '100 dons', insigne: 'Or' },
    { niveau: '6ème', femmes: '100 dons', hommes: '150 dons', insigne: 'Or + 1 Palme' },
    {
      niveau: '7ème',
      femmes: '200 dons et +',
      hommes: '200 dons et +',
      insigne: 'Or + 2 Palmes',
    },
  ];

  donneurSelectionne = signal<DonneurSelectionne | null>(null);
  recompenses = signal<Recompense[]>([]);
  recompenseSelectionnee = signal<Recompense | null>(null);
  nbDonsTotal = signal<number | null>(null);
  message = signal('');

  // Ajout : uniquement les niveaux supérieurs au plus haut niveau atteint.
  // Modification : le niveau de la ligne éditée et ceux compris entre ses niveaux voisins.
  niveauxDisponibles = computed(() => {
    const edite = this.recompenseSelectionnee();
    const autres = this.recompenses()
      .filter((recompense) => recompense.IdRecompense !== edite?.IdRecompense)
      .map((recompense) => recompense.NiveauEFS);

    if (!edite) {
      const max = Math.max(0, ...autres);

      return this.niveaux.filter((niveau) => niveau > max);
    }

    const borneBasse = Math.max(0, ...autres.filter((niveau) => niveau <= edite.NiveauEFS));
    const borneHaute = Math.min(Infinity, ...autres.filter((niveau) => niveau > edite.NiveauEFS));

    return this.niveaux.filter(
      (niveau) => niveau === edite.NiveauEFS || (niveau > borneBasse && niveau < borneHaute),
    );
  });

  recherche = '';
  readonly rechercheContacts: RechercheContactController;

  niveauAEditer: number | null = null;
  anneeAEditer: number | null = new Date().getFullYear();

  constructor(
    private donneurSelection: DonneurSelectionService,
    private supabase: SupabaseService,
    private session: SessionService,
    private cdr: ChangeDetectorRef,
  ) {
    this.rechercheContacts = new RechercheContactController(this.supabase.client, this.cdr);

    effect(() => {
      const donneur = this.donneurSelection.donneur();

      this.donneurSelectionne.set(donneur);
      this.deselectionner();

      if (donneur) {
        void this.chargerRecompenses(donneur.IdContact);
        void this.chargerNbDons(donneur);
      } else {
        this.recompenses.set([]);
        this.nbDonsTotal.set(null);
      }
    });
  }

  ngOnDestroy(): void {
    this.rechercheContacts.detruire();
  }

  peutModifier(): boolean {
    const role = this.session.utilisateur()?.Role;

    return role === 'SA' || role === 'Admin';
  }

  anneeDe(recompense: Recompense): string {
    return recompense.DateAttribution.substring(0, 4);
  }

  rechercherDonneurs(): void {
    this.rechercheContacts.rechercher(this.recherche, (error) => {
      console.error('ERREUR RECHERCHE DONNEUR :', error);
      this.message.set('Erreur pendant la recherche.');
    });
  }

  afficherResultat(resultat: ResultatRechercheContact): string {
    return this.rechercheContacts.afficherNom(resultat);
  }

  async selectionnerDonneur(idContact: number): Promise<void> {
    this.rechercheContacts.annuler();

    try {
      this.message.set('');

      const { data, error } = await this.supabase.client
        .from('t_Contacts')
        .select('IdContact, NomUsage, Prenom, DateNaissance, NbDonsAvant2013')
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

      this.cdr.detectChanges();
    } catch (error) {
      console.error('ERREUR SÉLECTION DONNEUR :', error);
      this.message.set('Impossible de sélectionner le donneur.');

      this.cdr.detectChanges();
    }
  }

  async chargerNbDons(donneur: DonneurSelectionne): Promise<void> {
    this.nbDonsTotal.set(null);

    try {
      const dons = await this.supabase.getDons(donneur.IdContact);

      // Évite d'afficher le résultat d'un donneur précédemment sélectionné.
      if (this.donneurSelectionne()?.IdContact !== donneur.IdContact) {
        return;
      }

      const nbApres2013 = dons.filter((don) => don.annee >= 2013).length;

      this.nbDonsTotal.set((donneur.NbDonsAvant2013 ?? 0) + nbApres2013);
    } catch (error) {
      console.error('ERREUR CHARGEMENT NOMBRE DE DONS :', error);
      this.nbDonsTotal.set(null);
    }
  }

  async chargerRecompenses(IdContact: number): Promise<void> {
    try {
      this.recompenses.set(await this.supabase.getRecompenses(IdContact));
    } catch (error) {
      console.error('ERREUR CHARGEMENT RÉCOMPENSES :', error);
      this.recompenses.set([]);
      this.message.set('Impossible de charger les récompenses.');
    }
  }

  selectionnerLigne(recompense: Recompense): void {
    if (!this.peutModifier()) {
      return;
    }

    if (this.recompenseSelectionnee()?.IdRecompense === recompense.IdRecompense) {
      this.deselectionner();
      return;
    }

    this.recompenseSelectionnee.set(recompense);
    this.niveauAEditer = recompense.NiveauEFS;
    this.anneeAEditer = Number(this.anneeDe(recompense));
  }

  private deselectionner(): void {
    this.recompenseSelectionnee.set(null);
    this.niveauAEditer = null;
    this.anneeAEditer = new Date().getFullYear();
  }

  private saisieValide(): boolean {
    const niveau = Number(this.niveauAEditer);
    const annee = Number(this.anneeAEditer);

    if (!Number.isInteger(niveau) || niveau < 1 || niveau > 7) {
      this.message.set('Sélectionner un niveau compris entre 1 et 7.');
      return false;
    }

    if (!Number.isInteger(annee) || annee < 1900 || annee > new Date().getFullYear() + 1) {
      this.message.set("L'année d'obtention est invalide.");
      return false;
    }

    return true;
  }

  peutAjouter(): boolean {
    return !!this.donneurSelectionne() && this.peutModifier() && !this.recompenseSelectionnee();
  }

  async ajouter(): Promise<void> {
    const donneur = this.donneurSelectionne();

    if (!donneur || !this.peutAjouter()) {
      return;
    }

    this.message.set('');

    if (!this.saisieValide()) {
      return;
    }

    try {
      await this.supabase.ajouterRecompense(
        donneur.IdContact,
        Number(this.niveauAEditer),
        `${Number(this.anneeAEditer)}-01-01`,
      );

      await this.chargerRecompenses(donneur.IdContact);
      this.deselectionner();
    } catch (error) {
      console.error('ERREUR AJOUT RÉCOMPENSE :', error);
      this.message.set("Impossible d'ajouter la récompense.");
    }
  }

  async modifier(): Promise<void> {
    const donneur = this.donneurSelectionne();
    const recompense = this.recompenseSelectionnee();

    if (!donneur || !recompense || !this.peutModifier()) {
      return;
    }

    this.message.set('');

    if (!this.saisieValide()) {
      return;
    }

    const niveau = Number(this.niveauAEditer);

    // Le jour et le mois d'origine sont conservés : seule l'année est remplacée.
    const dateAttribution = `${Number(this.anneeAEditer)}${recompense.DateAttribution.substring(4)}`;

    try {
      await this.supabase.modifierRecompense(recompense.IdRecompense, niveau, dateAttribution);

      await this.chargerRecompenses(donneur.IdContact);
      this.deselectionner();
    } catch (error) {
      console.error('ERREUR MODIFICATION RÉCOMPENSE :', error);
      this.message.set('Impossible de modifier la récompense.');
    }
  }

  async supprimer(): Promise<void> {
    const donneur = this.donneurSelectionne();
    const recompense = this.recompenseSelectionnee();

    if (!donneur || !recompense || !this.peutModifier()) {
      return;
    }

    try {
      this.message.set('');

      await this.supabase.supprimerRecompense(recompense.IdRecompense);

      await this.chargerRecompenses(donneur.IdContact);
      this.deselectionner();
    } catch (error) {
      console.error('ERREUR SUPPRESSION RÉCOMPENSE :', error);
      this.message.set('Impossible de supprimer la récompense.');
    }
  }
}
