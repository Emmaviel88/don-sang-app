import { Injectable, signal } from '@angular/core';

export interface DonneurSelectionne {
  IdContact: number;
  NomUsage: string | null;
  Prenom: string | null;
  DateNaissance: string | null;
  NbDonsAvant2013: number;
  eligible: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class DonneurSelectionService {

  donneur = signal<DonneurSelectionne | null>(null);

  definirDonneur(donneur: DonneurSelectionne): void {
    this.donneur.set(donneur);
  }

  effacerDonneur(): void {
    this.donneur.set(null);
  }
}