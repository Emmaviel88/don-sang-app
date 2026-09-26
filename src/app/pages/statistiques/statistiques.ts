import { Component, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { SupabaseService } from '../../services/supabase';
import { SessionService } from '../../services/session';

interface Collecte {
  IdCollecte: number;
  annee: number;
  NumCollecte: number;
  DateCollecte: string;
}

interface DonneurStatistique {
  IdContact: number;
  NbDonsAvant2013: number;
  Sexe: string | null;
}

interface DonStatistique {
  IdDonneur: number;
  AnnéeDon: number;
  NumCollecte: number;
}

interface DonneurAge {
  IdDonneur: number;
  DateDon: string;
  t_Contacts:
    | {
        NomUsage: string;
        Prenom: string;
        DateNaissance: string;
      }
    | {
        NomUsage: string;
        Prenom: string;
        DateNaissance: string;
      }[];
}

@Component({
  imports: [DatePipe],
  selector: 'app-statistiques',
  styleUrl: './statistiques.css',
  templateUrl: './statistiques.html',
})
export class Statistiques implements OnInit {
  collectes = signal<Collecte[]>([]);
  collecteSelectionnee = signal<Collecte | null>(null);

  nbTotalDonneurs = signal(0);
  nbPrimoDons = signal(0);
  nbFemmes = signal(0);
  nbHommes = signal(0);
  ageMoyenJours = signal(0);

  plusJeuneNom = signal('');
  plusJeunePrenom = signal('');
  plusJeuneAgeJours = signal(0);

  plusAgeNom = signal('');
  plusAgePrenom = signal('');
  plusAgeAgeJours = signal(0);

  constructor(
    private supabase: SupabaseService,
    private session: SessionService,
  ) {}

  async ngOnInit(): Promise<void> {
    await this.session.attendreRestaurationSession();
    await this.chargerCollectes();
  }

  private async chargerCollectes(): Promise<void> {
    try {
      const collectes = await this.supabase.getCollectes();

      this.collectes.set(collectes);

      if (collectes.length === 0) {
        return;
      }

      this.collecteSelectionnee.set(collectes[0]);

      await this.chargerStatistiques();
    } catch (error) {
      console.error('ERREUR CHARGEMENT COLLECTES :', error);
    }
  }

  private async chargerStatistiques(): Promise<void> {
    const collecte = this.collecteSelectionnee();

    if (!collecte) {
      this.nbTotalDonneurs.set(0);
      this.nbPrimoDons.set(0);
      this.nbFemmes.set(0);
      this.nbHommes.set(0);
      this.ageMoyenJours.set(0);
      this.plusJeuneNom.set('');
      this.plusJeunePrenom.set('');
      this.plusJeuneAgeJours.set(0);
      this.plusAgeNom.set('');
      this.plusAgePrenom.set('');
      this.plusAgeAgeJours.set(0);
      return;
    }

    try {
      const { data: donsCollecte, error: erreurDonsCollecte } = await this.supabase.client
        .from('t_Dons')
        .select('IdDonneur, DateDon')
        .eq('AnnéeDon', collecte.annee)
        .eq('NumCollecte', collecte.NumCollecte);

      if (erreurDonsCollecte) {
        throw erreurDonsCollecte;
      }

      const donneurs = new Set((donsCollecte ?? []).map((don) => don.IdDonneur));

      this.nbTotalDonneurs.set(donneurs.size);

      if (donneurs.size === 0) {
        this.nbPrimoDons.set(0);
        this.nbFemmes.set(0);
        this.nbHommes.set(0);
        this.ageMoyenJours.set(0);
        this.plusJeuneNom.set('');
        this.plusJeunePrenom.set('');
        this.plusJeuneAgeJours.set(0);
        this.plusAgeNom.set('');
        this.plusAgePrenom.set('');
        this.plusAgeAgeJours.set(0);
        return;
      }

      const { data: contacts, error: erreurContacts } = await this.supabase.client
        .from('t_Contacts')
        .select('IdContact, NbDonsAvant2013, Sexe')
        .in('IdContact', [...donneurs]);

      if (erreurContacts) {
        throw erreurContacts;
      }

      let nbFemmes = 0;
      let nbHommes = 0;

      for (const contact of (contacts ?? []) as DonneurStatistique[]) {
        if (contact.Sexe === 'F') {
          nbFemmes++;
        }

        if (contact.Sexe === 'M') {
          nbHommes++;
        }
      }

      this.nbFemmes.set(nbFemmes);
      this.nbHommes.set(nbHommes);

      const { data: donsDesDonneurs, error: erreurDonsDesDonneurs } = await this.supabase.client
        .from('t_Dons')
        .select('IdDonneur, "AnnéeDon", NumCollecte')
        .in('IdDonneur', [...donneurs]);

      if (erreurDonsDesDonneurs) {
        throw erreurDonsDesDonneurs;
      }

      const { data: donneursAge, error: erreurDonneursAge } = await this.supabase.client
        .from('t_Dons')
        .select('IdDonneur, DateDon, t_Contacts!inner(NomUsage, Prenom, DateNaissance)')
        .eq('AnnéeDon', collecte.annee)
        .eq('NumCollecte', collecte.NumCollecte)
        .in('IdDonneur', [...donneurs]);

      if (erreurDonneursAge) {
        throw erreurDonneursAge;
      }

      let totalAgeJours = 0;
      let nombreAges = 0;

      let ageMinimumJours = Number.POSITIVE_INFINITY;
      let plusJeuneNom = '';
      let plusJeunePrenom = '';

      let ageMaximumJours = Number.NEGATIVE_INFINITY;
      let plusAgeNom = '';
      let plusAgePrenom = '';

      for (const donneur of (donneursAge ?? []) as DonneurAge[]) {
        const contact = Array.isArray(donneur.t_Contacts)
          ? donneur.t_Contacts[0]
          : donneur.t_Contacts;

        if (!contact?.DateNaissance || !donneur.DateDon) {
          continue;
        }

        const dateNaissance = new Date(`${contact.DateNaissance}T00:00:00`);

        const dateDon = new Date(`${donneur.DateDon}T00:00:00`);

        const ageJours = (dateDon.getTime() - dateNaissance.getTime()) / (1000 * 60 * 60 * 24);

        if (ageJours >= 0) {
          totalAgeJours += ageJours;
          nombreAges++;

          if (ageJours < ageMinimumJours) {
            ageMinimumJours = ageJours;
            plusJeuneNom = contact.NomUsage ?? '';
            plusJeunePrenom = contact.Prenom ?? '';
          }

          if (ageJours > ageMaximumJours) {
            ageMaximumJours = ageJours;
            plusAgeNom = contact.NomUsage ?? '';
            plusAgePrenom = contact.Prenom ?? '';
          }
        }
      }

      const ageMoyenJours = nombreAges > 0 ? totalAgeJours / nombreAges : 0;

      this.ageMoyenJours.set(ageMoyenJours);

      if (Number.isFinite(ageMinimumJours)) {
        this.plusJeuneNom.set(plusJeuneNom);
        this.plusJeunePrenom.set(plusJeunePrenom);
        this.plusJeuneAgeJours.set(ageMinimumJours);
      } else {
        this.plusJeuneNom.set('');
        this.plusJeunePrenom.set('');
        this.plusJeuneAgeJours.set(0);
      }

      if (Number.isFinite(ageMaximumJours)) {
        this.plusAgeNom.set(plusAgeNom);
        this.plusAgePrenom.set(plusAgePrenom);
        this.plusAgeAgeJours.set(ageMaximumJours);
      } else {
        this.plusAgeNom.set('');
        this.plusAgePrenom.set('');
        this.plusAgeAgeJours.set(0);
      }

      const nbDonsApres2013 = new Map<number, number>();

      for (const don of (donsDesDonneurs ?? []) as DonStatistique[]) {
        const donAvantCollecte =
          don.AnnéeDon < collecte.annee ||
          (don.AnnéeDon === collecte.annee && don.NumCollecte <= collecte.NumCollecte);

        if (!donAvantCollecte) {
          continue;
        }

        const nombreActuel = nbDonsApres2013.get(don.IdDonneur) ?? 0;

        nbDonsApres2013.set(don.IdDonneur, nombreActuel + 1);
      }

      let nbPrimo = 0;

      for (const contact of (contacts ?? []) as DonneurStatistique[]) {
        const nbAvant2013 = contact.NbDonsAvant2013 ?? 0;

        const nbApres2013 = nbDonsApres2013.get(contact.IdContact) ?? 0;

        const nbTotal = nbAvant2013 + nbApres2013;

        if (nbTotal === 1) {
          nbPrimo++;
        }
      }

      this.nbPrimoDons.set(nbPrimo);
    } catch (error) {
      console.error('ERREUR CHARGEMENT STATISTIQUES :', error);

      this.nbTotalDonneurs.set(0);
      this.nbPrimoDons.set(0);
      this.nbFemmes.set(0);
      this.nbHommes.set(0);
      this.ageMoyenJours.set(0);

      this.plusJeuneNom.set('');
      this.plusJeunePrenom.set('');
      this.plusJeuneAgeJours.set(0);

      this.plusAgeNom.set('');
      this.plusAgePrenom.set('');
      this.plusAgeAgeJours.set(0);
    }
  }

  formaterAgeMoyen(): string {
    const collecte = this.collecteSelectionnee();
    const jours = this.ageMoyenJours();

    if (!collecte || jours <= 0) {
      return '—';
    }

    return this.formaterAge(jours, collecte.DateCollecte);
  }

  formaterPlusJeuneDonneur(): string {
    const collecte = this.collecteSelectionnee();
    const jours = this.plusJeuneAgeJours();

    if (!collecte || jours <= 0) {
      return '—';
    }

    return `${this.plusJeuneNom()} ${this.plusJeunePrenom()} — ${this.formaterAge(
      jours,
      collecte.DateCollecte,
    )}`;
  }

  formaterPlusAgeDonneur(): string {
    const collecte = this.collecteSelectionnee();
    const jours = this.plusAgeAgeJours();

    if (!collecte || jours <= 0) {
      return '—';
    }

    return `${this.plusAgeNom()} ${this.plusAgePrenom()} — ${this.formaterAge(
      jours,
      collecte.DateCollecte,
    )}`;
  }

  private formaterAge(jours: number, dateReference: string): string {
    const dateReferenceDate = new Date(`${dateReference}T00:00:00`);

    const dateNaissanceEstimee = new Date(
      dateReferenceDate.getTime() - Math.round(jours) * 24 * 60 * 60 * 1000,
    );

    let annees = dateReferenceDate.getFullYear() - dateNaissanceEstimee.getFullYear();

    let mois = dateReferenceDate.getMonth() - dateNaissanceEstimee.getMonth();

    let joursRestants = dateReferenceDate.getDate() - dateNaissanceEstimee.getDate();

    if (joursRestants < 0) {
      mois--;

      const dernierJourMoisPrecedent = new Date(
        dateReferenceDate.getFullYear(),
        dateReferenceDate.getMonth(),
        0,
      ).getDate();

      joursRestants += dernierJourMoisPrecedent;
    }

    if (mois < 0) {
      annees--;
      mois += 12;
    }

    return `${annees} an${annees > 1 ? 's' : ''} ${mois} mois ${joursRestants} jour${joursRestants > 1 ? 's' : ''}`;
  }

  async changerCollecte(idCollecte: string): Promise<void> {
    const id = Number(idCollecte);

    this.collecteSelectionnee.set(
      this.collectes().find((collecte) => collecte.IdCollecte === id) ?? null,
    );

    await this.chargerStatistiques();
  }
}
