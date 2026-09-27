import { ChangeDetectorRef } from '@angular/core';
import { SupabaseClient } from '@supabase/supabase-js';

export interface ResultatRechercheContact {
  IdContact: number;
  NomUsage: string | null;
  NomdeNaissance: string | null;
  Prenom: string | null;
  DateNaissance: string | null;
}

export class RechercheContactController {
  resultats: ResultatRechercheContact[] = [];
  rechercheEnCours = false;
  rechercheEffectuee = false;

  private minuterieRecherche: ReturnType<typeof setTimeout> | null = null;
  private numeroRecherche = 0;
  private detruit = false;

  constructor(
    private client: SupabaseClient,
    private cdr: ChangeDetectorRef,
  ) {}

  rechercher(texteRecherche: string, gererErreur: (error: unknown) => void): void {
    this.annulerMinuterie();

    const numeroRechercheActuelle = ++this.numeroRecherche;
    const texte = texteRecherche.trim();

    this.resultats = [];
    this.rechercheEffectuee = false;
    this.rechercheEnCours = false;

    if (texte.length < 2) {
      this.cdr.detectChanges();
      return;
    }

    this.rechercheEnCours = true;
    this.cdr.detectChanges();

    this.minuterieRecherche = setTimeout(() => {
      this.minuterieRecherche = null;
      void this.executerRecherche(texte, numeroRechercheActuelle, gererErreur);
    }, 250);
  }

  annuler(): void {
    this.annulerMinuterie();
    this.numeroRecherche++;
    this.resultats = [];
    this.rechercheEffectuee = false;
    this.rechercheEnCours = false;
    this.cdr.detectChanges();
  }

  afficherNom(resultat: ResultatRechercheContact): string {
    return [resultat.NomUsage || resultat.NomdeNaissance, resultat.Prenom]
      .filter((valeur) => valeur !== null && valeur !== '')
      .join(' ');
  }

  detruire(): void {
    this.detruit = true;
    this.numeroRecherche++;
    this.annulerMinuterie();
  }

  private async executerRecherche(
    texte: string,
    numeroRechercheActuelle: number,
    gererErreur: (error: unknown) => void,
  ): Promise<void> {
    try {
      const terme = `${texte}%`;
      const { data, error } = await this.client
        .from('t_Contacts')
        .select('IdContact, NomUsage, NomdeNaissance, Prenom, DateNaissance')
        .or(`NomUsage.ilike.${terme},NomdeNaissance.ilike.${terme}`)
        .order('NomUsage', { ascending: true })
        .order('Prenom', { ascending: true })
        .order('DateNaissance', { ascending: true })
        .limit(20);

      if (error) {
        throw error;
      }

      if (numeroRechercheActuelle !== this.numeroRecherche || this.detruit) {
        return;
      }

      this.resultats = (data ?? []) as ResultatRechercheContact[];
      this.rechercheEffectuee = true;
    } catch (error) {
      if (numeroRechercheActuelle !== this.numeroRecherche || this.detruit) {
        return;
      }

      gererErreur(error);
    } finally {
      if (numeroRechercheActuelle === this.numeroRecherche && !this.detruit) {
        this.rechercheEnCours = false;
        this.cdr.detectChanges();
      }
    }
  }

  private annulerMinuterie(): void {
    if (this.minuterieRecherche !== null) {
      clearTimeout(this.minuterieRecherche);
      this.minuterieRecherche = null;
    }
  }
}
