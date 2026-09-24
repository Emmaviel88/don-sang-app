import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../../services/supabase';
import {
  CollecteSelectionService,
  CollecteSelectionnee
} from '../../services/collecte-selection';

interface ResultatRecherche {
  IdContact: number;
  Civilite: string | null;
  NomUsage: string | null;
  NomdeNaissance: string | null;
  Prenom: string | null;
  DateNaissance: string | null;
}

interface Donneur {
  IdContact: number;
  Civilite: string | null;
  NomUsage: string | null;
  NomdeNaissance: string | null;
  Prenom: string | null;
  Sexe: string | null;
  DateNaissance: string | null;
  EstDecede: boolean;
  Actif: boolean;
  NePeutVeutPlusDonner: boolean;
  VolontairePlasma: boolean;
  PrimoDon: boolean;
  Commentaire: string | null;
}

interface Adresse {
  Adresse1: string | null;
  Adresse2: string | null;
  CodePostal: string | null;
  Commune: string | null;
  IdPays: number | null;
  EstPrincipale: boolean;
  EstValide: boolean;
}

interface Pays {
  IdPays: number;
  NomPays: string;
  CodeISO: string | null;
}

interface MoyenContact {
  IdTypeMoyen: number;
  Valeur: string | null;
  EstPrincipal: boolean;
  EstValide: boolean;
}

@Component({
  selector: 'app-coordonnees',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './coordonnees.html',
  styleUrl: './coordonnees.css'
})
export class Coordonnees implements OnInit {

  donneur: Donneur | null = null;

  recherche = '';
  resultats: ResultatRecherche[] = [];
  rechercheEnCours = false;
  rechercheEffectuee = false;
  erreur = '';

  age = '—';

  selection: CollecteSelectionnee | null = null;

  adresse: Adresse | null = null;
  pays: Pays | null = null;

  telephonePortable = '';
  email = '';

  dernierDon: string | null = null;
  delaiDernierDon = '—';
  nombreDons365 = 0;

  ageOK = false;
  delaiDernierDonOK = false;
  nombreDons365OK = false;
  statutOK = false;
  eligible = false;

  modeEdition = false;
  enregistrementEnCours = false;

  private minuterieRecherche:
    ReturnType<typeof setTimeout> | null = null;

  constructor(
    private supabase: SupabaseService,
    private collecteSelection: CollecteSelectionService,
    private changeDetectorRef: ChangeDetectorRef
  ) {}

  async ngOnInit(): Promise<void> {
    await this.chargerCollecteSelectionnee();
    await this.selectionnerDonneur(1);
  }

  private async chargerCollecteSelectionnee(): Promise<void> {
    const selection = this.collecteSelection.collecte();

    if (selection) {
      this.selection = selection;
      this.calculerAge();
      return;
    }

    try {
      const collectes = await this.supabase.getCollectes();

      const maintenant = new Date();

      const prochaines = collectes
        .filter(collecte =>
          new Date(collecte.DateCollecte) >= maintenant
        )
        .sort((a, b) =>
          new Date(a.DateCollecte).getTime() -
          new Date(b.DateCollecte).getTime()
        );

      if (prochaines.length === 0) {
        return;
      }

      const prochaine = prochaines[0];

      const selectionSuivante: CollecteSelectionnee = {
        IdCollecte: prochaine.IdCollecte,
        annee: prochaine.annee,
        NumCollecte: prochaine.NumCollecte,
        DateCollecte: prochaine.DateCollecte
      };

      this.collecteSelection.definirCollecte(
        selectionSuivante
      );

      this.selection = selectionSuivante;

      this.calculerAge();

    } catch (error) {
      console.error(
        'ERREUR CHARGEMENT COLLECTE :',
        error
      );

      this.erreur =
        'Impossible de charger la collecte.';
    }
  }

  async selectionnerDonneur(
    idContact: number
  ): Promise<void> {

    this.erreur = '';

    try {
      const { data, error } =
        await this.supabase.client
          .from('t_Contacts')
          .select('*')
          .eq('IdContact', idContact)
          .single();

      if (error) {
        throw error;
      }

      if (!data) {
        throw new Error(
          'Aucun donneur trouvé.'
        );
      }

      this.donneur = {
        IdContact: Number(data['IdContact']),
        Civilite: data['Civilite'] ?? null,
        NomUsage: data['NomUsage'] ?? null,
        NomdeNaissance:
          data['NomdeNaissance'] ?? null,
        Prenom: data['Prenom'] ?? null,
        Sexe: data['Sexe'] ?? null,
        DateNaissance:
          data['DateNaissance'] ?? null,
        EstDecede:
          Boolean(data['EstDécédé']),
        Actif:
          Boolean(data['Actif']),
        NePeutVeutPlusDonner:
          Boolean(data['NePeutVeutPlusDonner']),
        VolontairePlasma:
          Boolean(data['VolontairePlasma']),
        PrimoDon:
          Boolean(data['PrimoDon']),
        Commentaire:
          data['Commentaire'] ?? null
      };

      this.recherche =
        this.libelleDonneur(this.donneur);

      this.resultats = [];
      this.rechercheEffectuee = false;

      this.adresse = null;
      this.pays = null;
      this.telephonePortable = '';
      this.email = '';

      this.dernierDon = null;
      this.delaiDernierDon = '—';
      this.nombreDons365 = 0;

      this.ageOK = false;
      this.delaiDernierDonOK = false;
      this.nombreDons365OK = false;
      this.statutOK = false;
      this.eligible = false;

      this.changeDetectorRef.detectChanges();

      await Promise.all([
        this.chargerAdresse(),
        this.chargerMoyensContact(),
        this.calculerEligibilite()
      ]);

      this.changeDetectorRef.detectChanges();

    } catch (error) {
      console.error(
        'ERREUR CHARGEMENT DONNEUR :',
        error
      );

      this.donneur = null;
      this.age = '—';
      this.adresse = null;
      this.pays = null;
      this.telephonePortable = '';
      this.email = '';
      this.dernierDon = null;
      this.delaiDernierDon = '—';
      this.nombreDons365 = 0;
      this.eligible = false;

      this.erreur =
        'Impossible de charger le donneur.';
    }
  }

  rechercherDonneurs(): void {

    if (this.minuterieRecherche !== null) {
      clearTimeout(this.minuterieRecherche);
    }

    this.resultats = [];
    this.rechercheEffectuee = false;
    this.rechercheEnCours = false;

    const texte = this.recherche.trim();

    if (texte.length < 2) {
      return;
    }

    this.rechercheEnCours = true;

    this.minuterieRecherche = setTimeout(() => {
      void this.executerRecherche(texte);
    }, 300);
  }

  private async executerRecherche(
    texte: string
  ): Promise<void> {

    try {
      const terme = `${texte}%`;

      const { data, error } =
        await this.supabase.client
          .from('t_Contacts')
          .select(`
            IdContact,
            Civilite,
            NomUsage,
            NomdeNaissance,
            Prenom,
            DateNaissance
          `)
          .or(
            `NomUsage.ilike.${terme},NomdeNaissance.ilike.${terme}`
          )
          .order('NomUsage', {
            ascending: true
          })
          .limit(50);

      if (error) {
        throw error;
      }

      this.resultats =
        (data ?? []) as ResultatRecherche[];

      this.rechercheEffectuee = true;

    } catch (error) {
      console.error(
        'ERREUR RECHERCHE DONNEUR :',
        error
      );

      this.erreur =
        'Erreur pendant la recherche.';

    } finally {
      this.rechercheEnCours = false;

      this.changeDetectorRef.detectChanges();
    }
  }

  private async chargerAdresse(): Promise<void> {

    if (!this.donneur) {
      return;
    }

    const { data, error } =
      await this.supabase.client
        .from('t_Adresses')
        .select(`
          Adresse1,
          Adresse2,
          CodePostal,
          Commune,
          IdPays,
          EstPrincipale,
          EstValide
        `)
        .eq(
          'IdContact',
          this.donneur.IdContact
        )
        .eq(
          'EstPrincipale',
          true
        )
        .eq(
          'EstValide',
          true
        )
        .maybeSingle();

    if (error) {
      throw error;
    }

    this.adresse =
      data as Adresse | null;

    if (
      this.adresse &&
      this.adresse.IdPays !== null
    ) {

      const resultatPays =
        await this.supabase.client
          .from('t_Pays')
          .select(`
            IdPays,
            NomPays,
            CodeISO
          `)
          .eq(
            'IdPays',
            this.adresse.IdPays
          )
          .maybeSingle();

      if (resultatPays.error) {
        throw resultatPays.error;
      }

      this.pays =
        resultatPays.data as Pays | null;
    }
  }

  private async chargerMoyensContact(): Promise<void> {

    if (!this.donneur) {
      return;
    }

    const { data, error } =
      await this.supabase.client
        .from('t_MoyensContact')
        .select(`
          IdTypeMoyen,
          Valeur,
          EstPrincipal,
          EstValide
        `)
        .eq(
          'IdContact',
          this.donneur.IdContact
        )
        .eq(
          'EstPrincipal',
          true
        )
        .eq(
          'EstValide',
          true
        )
        .in(
          'IdTypeMoyen',
          [2, 3]
        );

    if (error) {
      throw error;
    }

    const moyens =
      (data ?? []) as MoyenContact[];

    const portable =
      moyens.find(
        moyen => moyen.IdTypeMoyen === 2
      );

    const mail =
      moyens.find(
        moyen => moyen.IdTypeMoyen === 3
      );

    this.telephonePortable =
      this.formaterTelephone(
        portable?.Valeur ?? ''
      );

    this.email =
      mail?.Valeur ?? '';
  }

  private formaterTelephone(
    telephone: string
  ): string {

    const valeur =
      telephone.trim();

    if (!valeur) {
      return '';
    }

    const nettoye =
      valeur.replace(/[^\d+]/g, '');

    if (nettoye.startsWith('+352')) {

      const numero =
        nettoye
          .substring(4)
          .replace(/\D/g, '');

      if (!numero) {
        return '+352';
      }

      const groupes =
        numero.match(/.{1,3}/g);

      return `+352 ${groupes?.join(' ') ?? numero}`;
    }

    if (nettoye.startsWith('+33')) {

      const numero =
        nettoye
          .substring(3)
          .replace(/\D/g, '');

      if (numero.length === 9) {

        return `+33 ${numero.substring(0, 1)} ${numero.substring(1, 3)} ${numero.substring(3, 5)} ${numero.substring(5, 7)} ${numero.substring(7, 9)}`;
      }

      return `+33 ${numero}`;
    }

    const numero =
      nettoye.replace(/\D/g, '');

    if (numero.length === 10) {

      const groupes =
        numero.match(/.{1,2}/g);

      return groupes?.join(' ') ?? numero;
    }

    return valeur;
  }

  private async calculerEligibilite(): Promise<void> {

    if (
      !this.donneur ||
      !this.selection ||
      !this.selection.DateCollecte
    ) {
      return;
    }

    const dateCollecte =
      this.creerDateLocale(
        this.selection.DateCollecte
      );

    if (!dateCollecte) {
      return;
    }

    this.calculerAge();

    const naissance =
      this.donneur.DateNaissance
        ? this.creerDateLocale(
            this.donneur.DateNaissance
          )
        : null;

    if (!naissance) {
      this.ageOK = false;
    } else {
      let age =
        dateCollecte.getFullYear() -
        naissance.getFullYear();

      const mois =
        dateCollecte.getMonth() -
        naissance.getMonth();

      const jours =
        dateCollecte.getDate() -
        naissance.getDate();

      if (
        mois < 0 ||
        (mois === 0 && jours < 0)
      ) {
        age--;
      }

      this.ageOK =
        age >= 18 &&
        age < 71;
    }

    const dateLimite56 =
      new Date(dateCollecte);

    dateLimite56.setDate(
      dateLimite56.getDate() - 56
    );

    const dateLimite365 =
      new Date(dateCollecte);

    dateLimite365.setDate(
      dateLimite365.getDate() - 365
    );

    const { data, error } =
      await this.supabase.client
        .from('t_Dons')
        .select(`
          DateDon
        `)
        .eq(
          'IdDonneur',
          this.donneur.IdContact
        )
        .gte(
          'DateDon',
          this.dateToString(dateLimite365)
        )
        .lte(
          'DateDon',
          this.dateToString(dateCollecte)
        )
        .order(
          'DateDon',
          { ascending: false }
        );

    if (error) {
      throw error;
    }

    const dons =
      data ?? [];

    this.nombreDons365 =
      dons.length;

    this.nombreDons365OK =
      this.nombreDons365 < 4;

    if (dons.length > 0) {

      this.dernierDon =
        dons[0]['DateDon'] ?? null;

      const dernierDonDate =
        this.creerDateLocale(
          this.dernierDon ?? ''
        );

      if (dernierDonDate) {

        const diff =
          dateCollecte.getTime() -
          dernierDonDate.getTime();

        const jours =
          Math.floor(
            diff / (1000 * 60 * 60 * 24)
          );

        this.delaiDernierDon =
          `${jours} jours`;

        this.delaiDernierDonOK =
          jours >= 56;

      } else {
        this.delaiDernierDonOK =
          false;
      }

    } else {

      this.dernierDon = null;

      this.delaiDernierDon =
        'Aucun don dans les 365 derniers jours';

      this.delaiDernierDonOK =
        true;
    }

    this.statutOK =
      this.donneur.Actif &&
      !this.donneur.EstDecede &&
      !this.donneur.NePeutVeutPlusDonner;

    this.eligible =
      this.ageOK &&
      this.delaiDernierDonOK &&
      this.nombreDons365OK &&
      this.statutOK;
  }

  afficherResultat(
    resultat: ResultatRecherche
  ): string {

    const nom =
      resultat.NomUsage ||
      resultat.NomdeNaissance ||
      '';

    const prenom =
      resultat.Prenom ||
      '';

    return `${nom} ${prenom}`.trim();
  }

  private libelleDonneur(
    donneur: Donneur
  ): string {

    const nom =
      donneur.NomUsage ||
      donneur.NomdeNaissance ||
      '';

    const prenom =
      donneur.Prenom ||
      '';

    return `${nom} ${prenom}`.trim();
  }

  afficherDate(
    date: string | null
  ): string {

    if (!date) {
      return '';
    }

    const partieDate =
      date.substring(0, 10);

    const morceaux =
      partieDate.split('-');

    if (morceaux.length !== 3) {
      return '';
    }

    return `${morceaux[2]}/${morceaux[1]}/${morceaux[0]}`;
  }

  calculerAge(): void {

    if (
      !this.donneur ||
      !this.donneur.DateNaissance ||
      !this.selection ||
      !this.selection.DateCollecte
    ) {
      this.age = '—';
      return;
    }

    const naissance =
      this.creerDateLocale(
        this.donneur.DateNaissance
      );

    const collecte =
      this.creerDateLocale(
        this.selection.DateCollecte
      );

    if (
      !naissance ||
      !collecte ||
      collecte < naissance
    ) {
      this.age = '—';
      return;
    }

    let annees =
      collecte.getFullYear() -
      naissance.getFullYear();

    let mois =
      collecte.getMonth() -
      naissance.getMonth();

    let jours =
      collecte.getDate() -
      naissance.getDate();

    if (jours < 0) {

      mois--;

      const joursMoisPrecedent =
        new Date(
          collecte.getFullYear(),
          collecte.getMonth(),
          0
        ).getDate();

      jours += joursMoisPrecedent;
    }

    if (mois < 0) {

      annees--;

      mois += 12;
    }

    this.age =
      `${annees} ans ${mois} mois ${jours} jours`;
  }

  private creerDateLocale(
    date: string
  ): Date | null {

    const partieDate =
      date.substring(0, 10);

    const morceaux =
      partieDate.split('-');

    if (morceaux.length !== 3) {
      return null;
    }

    const annee =
      Number(morceaux[0]);

    const mois =
      Number(morceaux[1]);

    const jour =
      Number(morceaux[2]);

    if (
      !Number.isInteger(annee) ||
      !Number.isInteger(mois) ||
      !Number.isInteger(jour)
    ) {
      return null;
    }

    return new Date(
      annee,
      mois - 1,
      jour
    );
  }

  private dateToString(
    date: Date
  ): string {

    const annee =
      date.getFullYear();

    const mois =
      String(
        date.getMonth() + 1
      ).padStart(2, '0');

    const jour =
      String(
        date.getDate()
      ).padStart(2, '0');

    return `${annee}-${mois}-${jour}`;
  }

  modifier(): void {

    if (!this.donneur) {
      return;
    }

    this.modeEdition = true;
  }

  annuler(): void {

    if (!this.donneur) {
      return;
    }

    this.modeEdition = false;

    void this.selectionnerDonneur(
      this.donneur.IdContact
    );
  }

  async enregistrer(): Promise<void> {

    if (!this.donneur) {
      return;
    }

    if (
      !this.donneur.Commentaire ||
      this.donneur.Commentaire.trim() === ''
    ) {
      this.erreur =
        'Le commentaire est obligatoire.';

      return;
    }

    this.enregistrementEnCours = true;
    this.erreur = '';

    try {

      const { error } =
        await this.supabase.client
          .from('t_Contacts')
          .update({
            Civilite:
              this.donneur.Civilite,

            NomUsage:
              this.donneur.NomUsage,

            NomdeNaissance:
              this.donneur.NomdeNaissance,

            Prenom:
              this.donneur.Prenom,

            Sexe:
              this.donneur.Sexe,

            DateNaissance:
              this.donneur.DateNaissance,

            'EstDécédé':
              this.donneur.EstDecede,

            Actif:
              this.donneur.Actif,

            NePeutVeutPlusDonner:
              this.donneur.NePeutVeutPlusDonner,

            VolontairePlasma:
              this.donneur.VolontairePlasma,

            PrimoDon:
              this.donneur.PrimoDon,

            Commentaire:
              this.donneur.Commentaire
          })
          .eq(
            'IdContact',
            this.donneur.IdContact
          );

      if (error) {
        throw error;
      }

      this.modeEdition = false;

    } catch (error) {

      console.error(
        'ERREUR ENREGISTREMENT DONNEUR :',
        error
      );

      this.erreur =
        'Impossible d’enregistrer les modifications.';

    } finally {

      this.enregistrementEnCours = false;
    }
  }
}