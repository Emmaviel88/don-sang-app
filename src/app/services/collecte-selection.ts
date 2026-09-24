import { Injectable, signal } from '@angular/core';

export interface CollecteSelectionnee {
  IdCollecte: number;
  annee: number;
  NumCollecte: number;
  DateCollecte: string;
}

@Injectable({
  providedIn: 'root'
})
export class CollecteSelectionService {

  collecte = signal<CollecteSelectionnee | null>(null);

  definirCollecte(collecte: CollecteSelectionnee): void {
    this.collecte.set(collecte);
  }

  effacerCollecte(): void {
    this.collecte.set(null);
  }
}