import { Component, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { SupabaseService } from '../../services/supabase';
import {
  CollecteSelectionService,
  CollecteSelectionnee
} from '../../services/collecte-selection';

interface Collecte {
  IdCollecte: number;
  annee: number;
  NumCollecte: number;
  DateCollecte: string;
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
  choixOuvert = signal(false);
  message = signal('');

  constructor(
    private supabase: SupabaseService,
    private selection: CollecteSelectionService
  ) {
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

      if (prochaines.length > 0) {
        this.selectionnerCollecte(prochaines[0]);
      }

    } catch (error) {
      console.error('ERREUR CHARGEMENT COLLECTES :', error);
      this.message.set('Impossible de charger les collectes.');
    }
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
}