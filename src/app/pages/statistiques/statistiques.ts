import { Component, OnInit, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { SupabaseService } from '../../services/supabase';
import { SessionService } from '../../services/session';
import { CollecteSelectionService, CollecteSelectionnee } from '../../services/collecte-selection';

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
        Sexe: string | null;
      }
    | {
        NomUsage: string;
        Prenom: string;
        DateNaissance: string;
        Sexe: string | null;
      }[];
}

interface AdresseStatistique {
  IdContact: number;
  Commune: string | null;
  CodePostal: string | null;
  IdPays: number | null;
}

interface PaysStatistique {
  IdPays: number;
  NomPays: string;
  CodeISO: string;
}

interface ClassementCommune {
  Commune: string;
  NbDonneurs: number;
  Pourcentage: number;
}

@Component({
  imports: [DatePipe, DecimalPipe],
  selector: 'app-statistiques',
  styleUrl: './statistiques.css',
  templateUrl: './statistiques.html',
})
export class Statistiques implements OnInit {
  collectes = signal<Collecte[]>([]);
  collecteSelectionnee = signal<CollecteSelectionnee | null>(null);

  nbTotalDonneurs = signal(0);
  nbPrimoDons = signal(0);
  nbFemmes = signal(0);
  nbHommes = signal(0);
  ageMoyenJours = signal(0);

  plusJeuneNom = signal('');
  plusJeunePrenom = signal('');
  plusJeuneAgeJours = signal(0);
  plusJeuneSexe = signal<string | null>(null);

  plusAgeNom = signal('');
  plusAgePrenom = signal('');
  plusAgeAgeJours = signal(0);
  plusAgeSexe = signal<string | null>(null);

  classementCommunes = signal<ClassementCommune[]>([]);
  chargement = signal(true);

  constructor(
    private supabase: SupabaseService,
    private session: SessionService,
    private selection: CollecteSelectionService,
  ) {}

  async ngOnInit(): Promise<void> {
    this.chargement.set(true);

    try {
      await this.session.attendreRestaurationSession();

      this.collecteSelectionnee.set(this.selection.collecte());

      await this.chargerCollectes();
    } finally {
      this.chargement.set(false);
    }
  }

  private async chargerCollectes(): Promise<void> {
    try {
      const collectes = await this.supabase.getCollectes();

      this.collectes.set(collectes);

      if (collectes.length === 0) {
        this.collecteSelectionnee.set(null);
        return;
      }

      const selectionExistante = this.selection.collecte();

      if (selectionExistante) {
        const collecte = collectes.find(
          (item) => item.IdCollecte === selectionExistante.IdCollecte,
        );

        if (collecte) {
          this.collecteSelectionnee.set({
            IdCollecte: collecte.IdCollecte,
            annee: collecte.annee,
            NumCollecte: collecte.NumCollecte,
            DateCollecte: collecte.DateCollecte,
          });
        } else {
          this.selection.effacerCollecte();
          this.selectionnerCollecteParDefaut(collectes);
        }
      } else {
        this.selectionnerCollecteParDefaut(collectes);
      }

      await this.chargerStatistiques();
    } catch (error) {
      console.error('ERREUR CHARGEMENT COLLECTES :', error);
    }
  }

  private selectionnerCollecteParDefaut(collectes: Collecte[]): void {
    const maintenant = new Date();

    const prochaines = collectes
      .filter((collecte) => new Date(collecte.DateCollecte) >= maintenant)
      .sort((a, b) => new Date(a.DateCollecte).getTime() - new Date(b.DateCollecte).getTime());

    const collecte = prochaines.length > 0 ? prochaines[0] : collectes[0];

    const selection: CollecteSelectionnee = {
      IdCollecte: collecte.IdCollecte,
      annee: collecte.annee,
      NumCollecte: collecte.NumCollecte,
      DateCollecte: collecte.DateCollecte,
    };

    this.selection.definirCollecte(selection);
    this.collecteSelectionnee.set(selection);
  }

  private async chargerStatistiques(): Promise<void> {
    this.chargement.set(true);

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
      this.plusJeuneSexe.set(null);
      this.plusAgeNom.set('');
      this.plusAgePrenom.set('');
      this.plusAgeAgeJours.set(0);
      this.plusAgeSexe.set(null);
      this.classementCommunes.set([]);
      this.chargement.set(false);
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
        this.plusJeuneSexe.set(null);
        this.plusAgeNom.set('');
        this.plusAgePrenom.set('');
        this.plusAgeAgeJours.set(0);
        this.plusAgeSexe.set(null);
        this.classementCommunes.set([]);
        this.chargement.set(false);
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

      const { data: adresses, error: erreurAdresses } = await this.supabase.client
        .from('t_Adresses')
        .select('IdContact, Commune, CodePostal, IdPays, EstPrincipale, EstValide')
        .in('IdContact', [...donneurs])
        .eq('EstPrincipale', true)
        .eq('EstValide', true);

      if (erreurAdresses) {
        throw erreurAdresses;
      }

      const { data: pays, error: erreurPays } = await this.supabase.client
        .from('t_Pays')
        .select('IdPays, NomPays, CodeISO');

      if (erreurPays) {
        throw erreurPays;
      }

      const paysParId = new Map<number, PaysStatistique>();

      for (const paysItem of (pays ?? []) as PaysStatistique[]) {
        paysParId.set(paysItem.IdPays, paysItem);
      }

      const adresseParDonneur = new Map<number, AdresseStatistique>();

      for (const adresse of (adresses ?? []) as AdresseStatistique[]) {
        const commune = typeof adresse.Commune === 'string' ? adresse.Commune.trim() : '';

        if (commune === '') {
          continue;
        }

        adresseParDonneur.set(adresse.IdContact, adresse);
      }

      const nombreDonneursParCommune = new Map<string, number>();

      for (const idDonneur of donneurs) {
        const adresse = adresseParDonneur.get(idDonneur);

        if (!adresse) {
          continue;
        }

        const paysDonneur = adresse.IdPays !== null ? paysParId.get(adresse.IdPays) : undefined;

        const commune = this.formaterCommune(
          adresse.Commune ?? '',
          adresse.CodePostal,
          paysDonneur,
        );

        const nombreActuel = nombreDonneursParCommune.get(commune) ?? 0;

        nombreDonneursParCommune.set(commune, nombreActuel + 1);
      }

      const totalDonneurs = donneurs.size;

      const classementCommunes = [...nombreDonneursParCommune.entries()]
        .map(([Commune, NbDonneurs]) => ({
          Commune,
          NbDonneurs,
          Pourcentage: (NbDonneurs / totalDonneurs) * 100,
        }))
        .sort((a, b) => {
          if (b.NbDonneurs !== a.NbDonneurs) {
            return b.NbDonneurs - a.NbDonneurs;
          }

          return a.Commune.localeCompare(b.Commune, 'fr', {
            sensitivity: 'base',
          });
        });

      this.classementCommunes.set(classementCommunes);

      const { data: donsDesDonneurs, error: erreurDonsDesDonneurs } = await this.supabase.client
        .from('t_Dons')
        .select('IdDonneur, "AnnéeDon", NumCollecte')
        .in('IdDonneur', [...donneurs]);

      if (erreurDonsDesDonneurs) {
        throw erreurDonsDesDonneurs;
      }

      const { data: donneursAge, error: erreurDonneursAge } = await this.supabase.client
        .from('t_Dons')
        .select('IdDonneur, DateDon, t_Contacts!inner(NomUsage, Prenom, DateNaissance, Sexe)')
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
      let plusJeuneSexe: string | null = null;

      let ageMaximumJours = Number.NEGATIVE_INFINITY;

      let plusAgeNom = '';
      let plusAgePrenom = '';
      let plusAgeSexe: string | null = null;

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
            plusJeuneSexe = contact.Sexe ?? null;
          }

          if (ageJours > ageMaximumJours) {
            ageMaximumJours = ageJours;

            plusAgeNom = contact.NomUsage ?? '';
            plusAgePrenom = contact.Prenom ?? '';
            plusAgeSexe = contact.Sexe ?? null;
          }
        }
      }

      const ageMoyenJours = nombreAges > 0 ? totalAgeJours / nombreAges : 0;

      this.ageMoyenJours.set(ageMoyenJours);

      if (Number.isFinite(ageMinimumJours)) {
        this.plusJeuneNom.set(plusJeuneNom);
        this.plusJeunePrenom.set(plusJeunePrenom);
        this.plusJeuneAgeJours.set(ageMinimumJours);
        this.plusJeuneSexe.set(plusJeuneSexe);
      } else {
        this.plusJeuneNom.set('');
        this.plusJeunePrenom.set('');
        this.plusJeuneAgeJours.set(0);
        this.plusJeuneSexe.set(null);
      }

      if (Number.isFinite(ageMaximumJours)) {
        this.plusAgeNom.set(plusAgeNom);
        this.plusAgePrenom.set(plusAgePrenom);
        this.plusAgeAgeJours.set(ageMaximumJours);
        this.plusAgeSexe.set(plusAgeSexe);
      } else {
        this.plusAgeNom.set('');
        this.plusAgePrenom.set('');
        this.plusAgeAgeJours.set(0);
        this.plusAgeSexe.set(null);
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
      this.plusJeuneSexe.set(null);

      this.plusAgeNom.set('');
      this.plusAgePrenom.set('');
      this.plusAgeAgeJours.set(0);
      this.plusAgeSexe.set(null);

      this.classementCommunes.set([]);
    } finally {
      this.chargement.set(false);
    }
  }

  private formaterCommune(
    commune: string,
    codePostal: string | null,
    pays: PaysStatistique | undefined,
  ): string {
    const nomCommune = commune.trim();

    if (!pays || pays.CodeISO === 'FR') {
      const departement = this.determinerDepartement(codePostal);

      if (!departement || departement === '88') {
        return nomCommune;
      }

      return `${nomCommune} (${departement})`;
    }

    return `${nomCommune} (${pays.NomPays})`;
  }

  private determinerDepartement(codePostal: string | null): string | null {
    if (!codePostal) {
      return null;
    }

    const code = codePostal.trim();

    if (code.length < 2) {
      return null;
    }

    if (code.startsWith('20')) {
      const codeNumerique = Number(code);

      if (Number.isFinite(codeNumerique) && codeNumerique >= 20000 && codeNumerique <= 20199) {
        return '2A';
      }

      if (Number.isFinite(codeNumerique) && codeNumerique >= 20200 && codeNumerique <= 20620) {
        return '2B';
      }
    }

    if (/^\d{3}/.test(code)) {
      const troisPremiers = code.substring(0, 3);

      if (
        troisPremiers === '971' ||
        troisPremiers === '972' ||
        troisPremiers === '973' ||
        troisPremiers === '974' ||
        troisPremiers === '976'
      ) {
        return troisPremiers;
      }
    }

    return code.substring(0, 2);
  }

  formaterAgeMoyen(): string {
    const collecte = this.collecteSelectionnee();

    const jours = this.ageMoyenJours();

    if (!collecte || jours <= 0) {
      return '—';
    }

    return this.formaterAge(jours, collecte.DateCollecte);
  }

  libellePlusJeuneDonneur(): string {
    return this.plusJeuneSexe() === 'F' ? 'Donneuse la plus jeune' : 'Donneur le plus jeune';
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

  libellePlusAgeDonneur(): string {
    return this.plusAgeSexe() === 'F' ? 'Donneuse la plus sage' : 'Donneur le plus sage';
  }

  formaterPlusAgeDonneur(): string {
    const jours = this.plusAgeAgeJours();

    if (jours <= 0) {
      return '—';
    }

    if (this.plusAgeSexe() === 'F') {
      return `${this.plusAgeNom()} ${this.plusAgePrenom()}`;
    }

    const collecte = this.collecteSelectionnee();

    if (!collecte) {
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

    const collecte = this.collectes().find((item) => item.IdCollecte === id);

    if (!collecte) {
      return;
    }

    const selection: CollecteSelectionnee = {
      IdCollecte: collecte.IdCollecte,
      annee: collecte.annee,
      NumCollecte: collecte.NumCollecte,
      DateCollecte: collecte.DateCollecte,
    };

    this.selection.definirCollecte(selection);

    this.collecteSelectionnee.set(selection);

    await this.chargerStatistiques();
  }
}
