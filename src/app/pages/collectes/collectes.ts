import { Component, effect, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { SupabaseService } from '../../services/supabase';
import {
  CollecteSelectionService,
  CollecteSelectionnee
} from '../../services/collecte-selection';
import {
  DonneurSelectionService,
  DonneurSelectionne
} from '../../services/donneur-selection';
import { SessionService } from '../../services/session';

interface Collecte {
  IdCollecte: number;
  annee: number;
  NumCollecte: number;
  DateCollecte: string;
}

interface Don {
  IdDon: number;
  IdDonneur: number;
  annee: number;
  NumCollecte: number;
  DateDon: string;
  IdSourceDon: number;
}

@Component({
  selector: 'app-collectes',
  standalone: true,
  imports: [DatePipe],
  templateUrl: './collectes.html',
  styleUrl: './collectes.css'
})
export class CollectesComponent {

  collectes = signal<Collecte[]>([]);
  annees = signal<number[]>([]);
  collecteSelectionnee = signal<CollecteSelectionnee | null>(null);
  donneurSelectionne = signal<DonneurSelectionne | null>(null);

  dons = signal<Don[]>([]);
  donsFiltres = signal<Don[]>([]);
  anneesDons = signal<number[]>([]);
  anneeFiltre = signal<number | 'Toutes'>('Toutes');

  nbDonsAvant2013 = signal(0);
  nbDonsApres2013 = signal(0);
  nbDonsTotal = signal(0);

  donSelectionne = signal<Don | null>(null);

  choixOuvert = signal(false);
  message = signal('');

  constructor(
    private supabase: SupabaseService,
    private selection: CollecteSelectionService,
    private donneurSelection: DonneurSelectionService,
    private session: SessionService
  ) {
    this.collecteSelectionnee.set(this.selection.collecte());
    this.donneurSelectionne.set(this.donneurSelection.donneur());

    effect(() => {
      const donneur = this.donneurSelection.donneur();

      this.donneurSelectionne.set(donneur);
      this.anneeFiltre.set('Toutes');
      this.donSelectionne.set(null);

      if (donneur) {
        this.chargerDons(donneur.IdContact);
      } else {
        this.dons.set([]);
        this.donsFiltres.set([]);
        this.anneesDons.set([]);
        this.nbDonsAvant2013.set(0);
        this.nbDonsApres2013.set(0);
        this.nbDonsTotal.set(0);
      }
    });

    this.chargerCollectes();
  }

  async chargerCollectes(): Promise<void> {
    try {
      const collectes = await this.supabase.getCollectes();

      this.collectes.set(collectes);

      const annees = [...new Set(
        collectes.map(collecte => collecte.annee)
      )].sort((a, b) => b - a);

      this.annees.set(annees);

      const maintenant = new Date();

      const prochaines = collectes
        .filter(collecte => new Date(collecte.DateCollecte) >= maintenant)
        .sort((a, b) =>
          new Date(a.DateCollecte).getTime() -
          new Date(b.DateCollecte).getTime()
        );

      if (
        prochaines.length > 0 &&
        !this.selection.collecte()
      ) {
        this.selectionnerCollecte(prochaines[0]);
      }

    } catch (error) {
      console.error('ERREUR CHARGEMENT COLLECTES :', error);
      this.message.set('Impossible de charger les collectes.');
    }
  }

  async chargerDons(IdContact: number): Promise<void> {
    try {
      const dons = await this.supabase.getDons(IdContact);

      this.dons.set(dons);

      const donneur = this.donneurSelection.donneur();

      const nbAvant2013 = donneur?.NbDonsAvant2013 ?? 0;

      const nbApres2013 = dons.filter(
        don => don.annee >= 2013
      ).length;

      this.nbDonsAvant2013.set(nbAvant2013);
      this.nbDonsApres2013.set(nbApres2013);
      this.nbDonsTotal.set(nbAvant2013 + nbApres2013);

      const annees = [...new Set(
        dons.map(don => don.annee)
      )].sort((a, b) => b - a);

      this.anneesDons.set(annees);

      this.appliquerFiltreAnnee();

    } catch (error) {
      console.error('ERREUR CHARGEMENT DONS :', error);
      this.message.set('Impossible de charger les dons du donneur.');
      this.dons.set([]);
      this.donsFiltres.set([]);
      this.anneesDons.set([]);
      this.nbDonsAvant2013.set(0);
      this.nbDonsApres2013.set(0);
      this.nbDonsTotal.set(0);
    }
  }

  appliquerFiltreAnnee(): void {
    const filtre = this.anneeFiltre();

    if (filtre === 'Toutes') {
      this.donsFiltres.set(this.dons());
      return;
    }

    this.donsFiltres.set(
      this.dons().filter(don => don.annee === filtre)
    );
  }

  changerFiltreAnnee(valeur: string): void {
    if (valeur === 'Toutes') {
      this.anneeFiltre.set('Toutes');
    } else {
      this.anneeFiltre.set(Number(valeur));
    }

    this.donSelectionne.set(null);
    this.appliquerFiltreAnnee();
  }

  selectionnerDon(don: Don): void {
    this.donSelectionne.set(don);
  }

  ouvrirChoixCollecte(): void {
    this.choixOuvert.set(true);
  }

  fermerChoixCollecte(): void {
    this.choixOuvert.set(false);
  }

  getCollecte(annee: number, numero: number): Collecte | undefined {
    return this.collectes().find(
      collecte =>
        collecte.annee === annee &&
        collecte.NumCollecte === numero
    );
  }

  selectionnerCollecte(collecte: Collecte): void {
    const selection: CollecteSelectionnee = {
      IdCollecte: collecte.IdCollecte,
      annee: collecte.annee,
      NumCollecte: collecte.NumCollecte,
      DateCollecte: collecte.DateCollecte
    };

    this.selection.definirCollecte(selection);
    this.collecteSelectionnee.set(selection);
    this.choixOuvert.set(false);
  }

  collecteModifiable(): boolean {
    const collecte = this.collecteSelectionnee();

    if (!collecte) {
      return false;
    }

    const utilisateur = this.session.utilisateur();

    if (!utilisateur) {
      return false;
    }

    const dateCollecte = new Date(collecte.DateCollecte);
    const aujourdHui = new Date();

    dateCollecte.setHours(0, 0, 0, 0);
    aujourdHui.setHours(0, 0, 0, 0);

    if (dateCollecte > aujourdHui) {
      return false;
    }

    if (dateCollecte.getTime() === aujourdHui.getTime()) {
      return true;
    }

    return (
      utilisateur.Role === 'SA' ||
      utilisateur.Role === 'Admin'
    );
  }

  async enregistrerDon(): Promise<void> {
    const donneur = this.donneurSelectionne();
    const collecte = this.collecteSelectionnee();

    if (!donneur || !collecte) {
      return;
    }

    if (!donneur.eligible) {
      return;
    }

    if (!this.collecteModifiable()) {
      return;
    }

    try {
      this.message.set('');

      await this.supabase.ajouterDon(
        donneur.IdContact,
        collecte.annee,
        collecte.NumCollecte,
        collecte.DateCollecte
      );

      await this.chargerDons(donneur.IdContact);

      this.donSelectionne.set(null);

    } catch (error) {
      console.error('ERREUR ENREGISTREMENT DON :', error);
      this.message.set('Impossible d’enregistrer le don.');
    }
  }

  async supprimerDon(): Promise<void> {
    const don = this.donSelectionne();
    const donneur = this.donneurSelectionne();

    if (!don || !donneur) {
      return;
    }

    if (!this.collecteModifiable()) {
      return;
    }

    try {
      this.message.set('');

      await this.supabase.supprimerDon(don.IdDon);

      await this.chargerDons(donneur.IdContact);

      this.donSelectionne.set(null);

    } catch (error) {
      console.error('ERREUR SUPPRESSION DON :', error);
      this.message.set('Impossible de supprimer le don.');
    }
  }
}