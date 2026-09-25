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
  Commentaire: string | null;
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
  paysDisponibles: Pays[] = [];

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
    await this.chargerPays();
    await this.selectionnerDonneur(1);
  }

  private async chargerPays(): Promise<void> {

    const { data, error } =
      await this.supabase.client
        .from('t_Pays')
        .select(`
          IdPays,
          NomPays,
          CodeISO
        `)
        .order(
          'NomPays',
          {
            ascending: true
          }
        );

    if (error) {
      throw error;
    }

    this.paysDisponibles =
      (data ?? []) as Pays[];
  }

  private async chargerCollecteSelectionnee(): Promise<void> {

    const selection =
      this.collecteSelection.collecte();

    if (selection) {
      this.selection = selection;
      this.calculerAge();
      return;
    }

    try {

      const collectes =
        await this.supabase.getCollectes();

      const maintenant =
        new Date();

      const prochaines =
        collectes
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

      const prochaine =
        prochaines[0];

      const selectionSuivante:
        CollecteSelectionnee = {
          IdCollecte: prochaine.IdCollecte,
          annee: prochaine.annee,
          NumCollecte: prochaine.NumCollecte,
          DateCollecte: prochaine.DateCollecte
        };

      this.collecteSelection.definirCollecte(
        selectionSuivante
      );

      this.selection =
        selectionSuivante;

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
    this.modeEdition = false;

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
        IdContact:
          Number(data['IdContact']),

        Civilite:
          data['Civilite'] ?? null,

        NomUsage:
          data['NomUsage'] ?? null,

        NomdeNaissance:
          data['NomdeNaissance'] ?? null,

        Prenom:
          data['Prenom'] ?? null,

        Sexe:
          data['Sexe'] ?? null,

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

      this.erreur =
        'Impossible de charger le donneur.';

      this.changeDetectorRef.detectChanges();
    }
  }

  rechercherDonneurs(): void {

    if (this.minuterieRecherche !== null) {
      clearTimeout(
        this.minuterieRecherche
      );
    }

    this.resultats = [];
    this.rechercheEffectuee = false;
    this.rechercheEnCours = false;

    const texte =
      this.recherche.trim();

    if (texte.length < 2) {
      return;
    }

    this.rechercheEnCours = true;

    this.minuterieRecherche =
      setTimeout(() => {
        void this.executerRecherche(texte);
      }, 300);
  }

  private async executerRecherche(
    texte: string
  ): Promise<void> {

    try {

      const terme =
        `${texte}%`;

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
          Commentaire,
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

    this.pays = null;

    if (!this.adresse?.IdPays) {
      return;
    }

    const {
      data: pays,
      error: erreurPays
    } =
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

    if (erreurPays) {
      throw erreurPays;
    }

    this.pays =
      pays as Pays | null;
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

    this.telephonePortable = '';
    this.email = '';

    for (const moyen of moyens) {

      if (
        moyen.IdTypeMoyen === 2 &&
        moyen.Valeur
      ) {
        this.telephonePortable =
          this.formaterTelephone(
            moyen.Valeur
          );
      }

      if (
        moyen.IdTypeMoyen === 3 &&
        moyen.Valeur
      ) {
        this.email =
          moyen.Valeur;
      }
    }
  }

  private formaterTelephone(
    telephone: string
  ): string {

    const chiffres =
      telephone.replace(
        /\D/g,
        ''
      );

    if (chiffres.length !== 10) {
      return telephone;
    }

    return chiffres
      .replace(
        /(\d{2})(?=\d)/g,
        '$1 '
      )
      .trim();
  }

  private async calculerEligibilite(): Promise<void> {

    if (
      !this.donneur ||
      !this.selection
    ) {
      return;
    }

    this.calculerAge();

    const dateCollecte =
      this.creerDateLocale(
        this.selection.DateCollecte
      );

    if (!dateCollecte) {
      return;
    }

    const dateNaissance =
      this.creerDateLocale(
        this.donneur.DateNaissance
      );

    if (!dateNaissance) {

      this.ageOK = false;
      this.delaiDernierDonOK = false;
      this.nombreDons365OK = true;

      this.statutOK =
        this.donneur.Actif &&
        !this.donneur.EstDecede &&
        !this.donneur.NePeutVeutPlusDonner;

      this.eligible =
        this.ageOK &&
        this.delaiDernierDonOK &&
        this.nombreDons365OK &&
        this.statutOK;

      return;
    }

    let ageAnnees =
      dateCollecte.getFullYear() -
      dateNaissance.getFullYear();

    const mois =
      dateCollecte.getMonth() -
      dateNaissance.getMonth();

    if (
      mois < 0 ||
      (
        mois === 0 &&
        dateCollecte.getDate() <
        dateNaissance.getDate()
      )
    ) {
      ageAnnees--;
    }

    this.ageOK =
      ageAnnees >= 18 &&
      ageAnnees < 71;

    const date365 =
      new Date(dateCollecte);

    date365.setDate(
      date365.getDate() - 365
    );

    const { data, error } =
      await this.supabase.client
        .from('t_Dons')
        .select('DateDon')
        .eq(
          'IdDonneur',
          this.donneur.IdContact
        )
        .gte(
          'DateDon',
          this.dateToString(date365)
        )
        .lte(
          'DateDon',
          this.dateToString(dateCollecte)
        )
        .order(
          'DateDon',
          {
            ascending: false
          }
        );

    if (error) {
      throw error;
    }

    const dons =
      (data ?? []) as {
        DateDon: string;
      }[];

    this.nombreDons365 =
      dons.length;

    this.nombreDons365OK =
      this.nombreDons365 < 4;

    if (dons.length === 0) {

      this.dernierDon = null;
      this.delaiDernierDon = 'Aucun';
      this.delaiDernierDonOK = true;

    } else {

      this.dernierDon =
        dons[0].DateDon;

      const dernierDon =
        this.creerDateLocale(
          this.dernierDon
        );

      if (!dernierDon) {

        this.delaiDernierDon = '—';
        this.delaiDernierDonOK = false;

      } else {

        const difference =
          Math.floor(
            (
              dateCollecte.getTime() -
              dernierDon.getTime()
            ) /
            (1000 * 60 * 60 * 24)
          );

        this.delaiDernierDon =
          `${difference} jour${difference > 1 ? 's' : ''}`;

        this.delaiDernierDonOK =
          difference >= 56;
      }
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
      resultat.NomUsage ??
      resultat.NomdeNaissance ??
      '';

    const prenom =
      resultat.Prenom ??
      '';

    return `${nom} ${prenom}`.trim();
  }

  private libelleDonneur(
    donneur: Donneur
  ): string {

    const nom =
      donneur.NomUsage ??
      donneur.NomdeNaissance ??
      '';

    const prenom =
      donneur.Prenom ??
      '';

    return `${nom} ${prenom}`.trim();
  }

  afficherDate(
    date: string | null
  ): string {

    if (!date) {
      return '';
    }

    const dateLocale =
      this.creerDateLocale(date);

    if (!dateLocale) {
      return '';
    }

    return dateLocale.toLocaleDateString(
      'fr-FR'
    );
  }

  calculerAge(): void {

    if (
      !this.donneur?.DateNaissance ||
      !this.selection?.DateCollecte
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
      !collecte
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

      const dernierJourMoisPrecedent =
        new Date(
          collecte.getFullYear(),
          collecte.getMonth(),
          0
        ).getDate();

      jours +=
        dernierJourMoisPrecedent;
    }

    if (mois < 0) {

      annees--;
      mois += 12;
    }

    this.age =
      `${annees} an${annees > 1 ? 's' : ''} ` +
      `${mois} mois ${jours} jour${jours > 1 ? 's' : ''}`;
  }

  private creerDateLocale(
    date: string | null
  ): Date | null {

    if (!date) {
      return null;
    }

    const morceaux =
      date
        .substring(0, 10)
        .split('-');

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
      !annee ||
      !mois ||
      !jour
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
      ).padStart(
        2,
        '0'
      );

    const jour =
      String(
        date.getDate()
      ).padStart(
        2,
        '0'
      );

    return `${annee}-${mois}-${jour}`;
  }

  modifierPays(idPays: number | null): void {

    if (
      !this.adresse ||
      !this.modeEdition
    ) {
      return;
    }

    this.adresse.IdPays =
      idPays !== null
        ? Number(idPays)
        : null;

    console.log(
      'IdPays sélectionné :',
      this.adresse.IdPays
    );
  }

  modifier(): void {

    if (!this.donneur) {
      return;
    }

    this.erreur = '';
    this.modeEdition = true;

    this.changeDetectorRef.detectChanges();
  }

  modifierDateNaissance(
    date: string | null
  ): void {

    if (
      !this.donneur ||
      !this.modeEdition
    ) {
      return;
    }

    this.donneur.DateNaissance =
      date || null;

    this.calculerAge();

    void this.calculerEligibilite();
  }

  annuler(): void {

    if (!this.donneur) {
      return;
    }

    const idContact =
      this.donneur.IdContact;

    this.modeEdition = false;

    void this.selectionnerDonneur(
      idContact
    );
  }

  async enregistrer(): Promise<void> {

  if (
    !this.donneur ||
    !this.modeEdition
  ) {
    return;
  }

  this.enregistrementEnCours = true;
  this.erreur = '';

  try {

    const { error: erreurContact } =
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
            this.donneur.PrimoDon

        })
        .eq(
          'IdContact',
          this.donneur.IdContact
        );

    if (erreurContact) {
      throw erreurContact;
    }

    console.log('IdPays à enregistrer :', this.adresse?.IdPays);

    if (this.adresse) {

      const { error: erreurAdresse } =
        await this.supabase.client
          .from('t_Adresses')
          .update({

            Adresse1:
              this.adresse.Adresse1,
              
            Adresse2:
              this.adresse.Adresse2,

            IdPays:
              this.adresse.IdPays,
            
            Commentaire:
            this.adresse.Commentaire

          })
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
          );

      if (erreurAdresse) {
        throw erreurAdresse;
      }
    }

    this.modeEdition = false;

    await this.calculerEligibilite();

    this.changeDetectorRef.detectChanges();

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

formaterCodePostal(codePostal: string | null | undefined): string {

  if (!codePostal) {
    return '';
  }

  const code =
    codePostal.trim();

  if (/^\d{5}$/.test(code)) {
    return code.substring(0, 2) +
      ' ' +
      code.substring(2);
  }

  return code;
}

}