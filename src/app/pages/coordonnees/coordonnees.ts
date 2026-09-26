import { ChangeDetectorRef, Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../../services/supabase';
import { CollecteSelectionService, CollecteSelectionnee } from '../../services/collecte-selection';
import { DonneurSelectionService } from '../../services/donneur-selection';

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
  NbDonsAvant2013: number;
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
  styleUrl: './coordonnees.css',
})
export class Coordonnees implements OnInit {
  @ViewChild('controleRecherche')
  controleRecherche!: ElementRef<HTMLInputElement>;

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

  private minuterieRecherche: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private supabase: SupabaseService,
    private collecteSelection: CollecteSelectionService,
    private donneurSelection: DonneurSelectionService,
    private changeDetectorRef: ChangeDetectorRef,
  ) {}

  async ngOnInit(): Promise<void> {
    await this.chargerCollecteSelectionnee();
    await this.chargerPays();

    const donneurSelectionne = this.donneurSelection.donneur();

    if (donneurSelectionne) {
      await this.selectionnerDonneur(donneurSelectionne.IdContact);
    } else {
      await this.selectionnerDonneur(1);
    }
  }

  private async chargerPays(): Promise<void> {
    try {
      const { data, error } = await this.supabase.client
        .from('t_Pays')
        .select(
          `
            IdPays,
            NomPays,
            CodeISO
          `,
        )
        .order('NomPays', {
          ascending: true,
        });

      if (error) {
        throw error;
      }

      this.paysDisponibles = (data ?? []) as Pays[];
    } catch (error) {
      console.error('ERREUR CHARGEMENT PAYS :', error);

      this.paysDisponibles = [];
    }
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
        .filter((collecte) => {
          const dateCollecte = this.creerDateLocale(collecte.DateCollecte);

          return dateCollecte !== null && dateCollecte >= maintenant;
        })
        .sort((a, b) => {
          const dateA = this.creerDateLocale(a.DateCollecte);

          const dateB = this.creerDateLocale(b.DateCollecte);

          if (!dateA || !dateB) {
            return 0;
          }

          return dateA.getTime() - dateB.getTime();
        });

      if (prochaines.length > 0) {
        const collecte = prochaines[0];

        this.selection = {
          IdCollecte: collecte.IdCollecte,
          annee: collecte.annee,
          NumCollecte: collecte.NumCollecte,
          DateCollecte: collecte.DateCollecte,
        };

        this.calculerAge();
      }
    } catch (error) {
      console.error('ERREUR CHARGEMENT COLLECTE :', error);

      this.erreur = 'Impossible de charger la collecte.';
    }
  }

  async selectionnerDonneur(idContact: number): Promise<void> {
    this.erreur = '';
    this.modeEdition = false;

    this.resultats = [];
    this.rechercheEffectuee = false;
    this.recherche = '';

    try {
      const { data, error } = await this.supabase.client
        .from('t_Contacts')
        .select(
          `
            IdContact,
            Civilite,
            NomUsage,
            NomdeNaissance,
            Prenom,
            Sexe,
            DateNaissance,
            NbDonsAvant2013,
            "EstDécédé",
            Actif,
            NePeutVeutPlusDonner,
            VolontairePlasma,
            PrimoDon,
            Commentaire
          `,
        )
        .eq('IdContact', idContact)
        .maybeSingle();

      if (error) {
        throw error;
      }

      if (!data) {
        this.donneur = null;
        this.donneurSelection.effacerDonneur();
        this.erreur = 'Donneur introuvable.';
        return;
      }

      this.donneur = {
        IdContact: data.IdContact,
        Civilite: data.Civilite,
        NomUsage: data.NomUsage,
        NomdeNaissance: data.NomdeNaissance,
        Prenom: data.Prenom,
        Sexe: data.Sexe,
        DateNaissance: data.DateNaissance,
        NbDonsAvant2013: data.NbDonsAvant2013 ?? 0,
        EstDecede: data['EstDécédé'],
        Actif: data.Actif,
        NePeutVeutPlusDonner: data.NePeutVeutPlusDonner,
        VolontairePlasma: data.VolontairePlasma,
        PrimoDon: data.PrimoDon,
        Commentaire: data.Commentaire,
      };

      this.donneurSelection.definirDonneur({
        IdContact: this.donneur.IdContact,
        NomUsage: this.donneur.NomUsage,
        Prenom: this.donneur.Prenom,
        DateNaissance: this.donneur.DateNaissance,
        NbDonsAvant2013: this.donneur.NbDonsAvant2013,
        eligible: this.eligible,
      });

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

      this.calculerAge();

      await Promise.all([
        this.chargerAdresse(),
        this.chargerMoyensContact(),
        this.calculerEligibilite(),
      ]);

      this.donneurSelection.definirDonneur({
        IdContact: this.donneur.IdContact,
        NomUsage: this.donneur.NomUsage,
        Prenom: this.donneur.Prenom,
        DateNaissance: this.donneur.DateNaissance,
        NbDonsAvant2013: this.donneur.NbDonsAvant2013,
        eligible: this.eligible,
      });

      this.changeDetectorRef.detectChanges();

      if (!this.modeEdition) {
        setTimeout(() => {
          this.controleRecherche?.nativeElement.focus();
        });
      }
    } catch (error) {
      console.error('ERREUR CHARGEMENT DONNEUR :', error);

      this.erreur = 'Impossible de charger le donneur.';
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

  private async executerRecherche(texte: string): Promise<void> {
    const debutRecherche = performance.now();

    try {
      const terme = `${texte}%`;

      const { data, error } = await this.supabase.client
        .from('t_Contacts')
        .select(
          `
            IdContact,
            Civilite,
            NomUsage,
            NomdeNaissance,
            Prenom,
            DateNaissance
          `,
        )
        .or(`NomUsage.ilike.${terme},NomdeNaissance.ilike.${terme}`)
        .order('NomUsage', {
          ascending: true,
        })
        .order('Prenom', {
          ascending: true,
        })
        .order('DateNaissance', {
          ascending: true,
        })
        .limit(50);

      console.log('Temps requête Supabase :', performance.now() - debutRecherche, 'ms');

      if (error) {
        throw error;
      }

      this.resultats = (data ?? []) as ResultatRecherche[];

      this.rechercheEffectuee = true;
    } catch (error) {
      console.error('ERREUR RECHERCHE DONNEUR :', error);

      this.erreur = 'Erreur pendant la recherche.';
    } finally {
      this.rechercheEnCours = false;

      this.changeDetectorRef.detectChanges();
    }
  }

  private async chargerAdresse(): Promise<void> {
    if (!this.donneur) {
      return;
    }

    const { data, error } = await this.supabase.client
      .from('t_Adresses')
      .select(
        `
          Adresse1,
          Adresse2,
          CodePostal,
          Commune,
          IdPays,
          Commentaire,
          EstPrincipale,
          EstValide
        `,
      )
      .eq('IdContact', this.donneur.IdContact)
      .eq('EstPrincipale', true)
      .eq('EstValide', true)
      .maybeSingle();

    if (error) {
      throw error;
    }

    this.adresse = data as Adresse | null;

    this.pays = null;

    if (!this.adresse?.IdPays) {
      return;
    }

    const { data: pays, error: erreurPays } = await this.supabase.client
      .from('t_Pays')
      .select(
        `
          IdPays,
          NomPays,
          CodeISO
        `,
      )
      .eq('IdPays', this.adresse.IdPays)
      .maybeSingle();

    if (erreurPays) {
      throw erreurPays;
    }

    this.pays = pays as Pays | null;
  }

  private async chargerMoyensContact(): Promise<void> {
    if (!this.donneur) {
      return;
    }

    const { data, error } = await this.supabase.client
      .from('t_MoyensContact')
      .select(
        `
          IdTypeMoyen,
          Valeur,
          EstPrincipal,
          EstValide
        `,
      )
      .eq('IdContact', this.donneur.IdContact)
      .eq('EstPrincipal', true)
      .eq('EstValide', true)
      .in('IdTypeMoyen', [2, 3]);

    if (error) {
      throw error;
    }

    const moyens = (data ?? []) as MoyenContact[];

    const portable = moyens.find((moyen) => moyen.IdTypeMoyen === 2);

    const mail = moyens.find((moyen) => moyen.IdTypeMoyen === 3);

    this.telephonePortable = this.formaterTelephone(portable?.Valeur ?? '');

    this.email = mail?.Valeur ?? '';
  }

  private formaterTelephone(telephone: string): string {
    const valeur = telephone.trim();

    if (!valeur) {
      return '';
    }

    const nettoye = valeur.replace(/[^\d+]/g, '');

    if (nettoye.startsWith('+352')) {
      const numero = nettoye.substring(4).replace(/\D/g, '');

      if (!numero) {
        return '+352';
      }

      const groupes = numero.match(/.{1,3}/g);

      return `+352 ${groupes?.join(' ') ?? numero}`;
    }

    if (nettoye.startsWith('+33')) {
      const numero = nettoye.substring(3).replace(/\D/g, '');

      if (numero.length === 9) {
        return (
          `+33 ` +
          `${numero.substring(0, 1)} ` +
          `${numero.substring(1, 3)} ` +
          `${numero.substring(3, 5)} ` +
          `${numero.substring(5, 7)} ` +
          `${numero.substring(7, 9)}`
        );
      }

      return `+33 ${numero}`;
    }

    const numero = nettoye.replace(/\D/g, '');

    if (numero.length === 10) {
      const groupes = numero.match(/.{1,2}/g);

      return groupes?.join(' ') ?? numero;
    }

    return valeur;
  }

  private async calculerEligibilite(): Promise<void> {
    if (!this.donneur || !this.selection || !this.selection.DateCollecte) {
      return;
    }

    const dateCollecte = this.creerDateLocale(this.selection.DateCollecte);

    if (!dateCollecte) {
      return;
    }

    this.calculerAge();

    const naissance = this.donneur.DateNaissance
      ? this.creerDateLocale(this.donneur.DateNaissance)
      : null;

    if (!naissance) {
      this.ageOK = false;
    } else {
      let age = dateCollecte.getFullYear() - naissance.getFullYear();

      const mois = dateCollecte.getMonth() - naissance.getMonth();

      const jours = dateCollecte.getDate() - naissance.getDate();

      if (mois < 0 || (mois === 0 && jours < 0)) {
        age--;
      }

      this.ageOK = age >= 18 && age < 71;
    }

    const dateLimite56 = new Date(dateCollecte);

    dateLimite56.setDate(dateLimite56.getDate() - 56);

    const dateLimite365 = new Date(dateCollecte);

    dateLimite365.setDate(dateLimite365.getDate() - 365);

    const { data, error } = await this.supabase.client
      .from('t_Dons')
      .select(
        `
          DateDon
        `,
      )
      .eq('IdDonneur', this.donneur.IdContact)
      .gte('DateDon', this.dateToString(dateLimite365))
      .lte('DateDon', this.dateToString(dateCollecte))
      .order('DateDon', {
        ascending: false,
      });

    if (error) {
      throw error;
    }

    const dons = data ?? [];

    this.nombreDons365 = dons.length;

    const maximumDons365 = this.donneur.Sexe === 'M' ? 6 : 4;

    this.nombreDons365OK = this.nombreDons365 < maximumDons365;

    if (dons.length > 0) {
      this.dernierDon = dons[0]['DateDon'] ?? null;

      const dernierDonDate = this.creerDateLocale(this.dernierDon ?? '');

      if (dernierDonDate) {
        const diff = dateCollecte.getTime() - dernierDonDate.getTime();

        const jours = Math.floor(diff / (1000 * 60 * 60 * 24));

        this.delaiDernierDon = `${jours} jours`;

        this.delaiDernierDonOK = jours >= 56;
      } else {
        this.delaiDernierDonOK = false;
      }
    } else {
      this.dernierDon = null;

      this.delaiDernierDon = 'Aucun don dans les 365 derniers jours';

      this.delaiDernierDonOK = true;
    }

    this.statutOK =
      this.donneur.Actif && !this.donneur.EstDecede && !this.donneur.NePeutVeutPlusDonner;

    this.eligible = this.ageOK && this.delaiDernierDonOK && this.nombreDons365OK && this.statutOK;
  }

  afficherResultat(resultat: ResultatRecherche): string {
    return [resultat.NomUsage, resultat.Prenom]
      .filter((valeur) => valeur !== null && valeur !== '')
      .join(' ');
  }

  libelleDonneur(): string {
    if (!this.donneur) {
      return '';
    }

    return [this.donneur.Civilite, this.donneur.NomUsage, this.donneur.Prenom]
      .filter((valeur) => valeur !== null && valeur !== '')
      .join(' ');
  }

  afficherDate(date: string | null): string {
    if (!date) {
      return '';
    }

    const valeur = this.creerDateLocale(date);

    if (!valeur) {
      return '';
    }

    return valeur.toLocaleDateString('fr-FR');
  }

  calculerAge(): void {
    if (!this.donneur || !this.selection) {
      this.age = '—';
      return;
    }

    const naissance = this.creerDateLocale(this.donneur.DateNaissance);

    const collecte = this.creerDateLocale(this.selection.DateCollecte);

    if (!naissance || !collecte) {
      this.age = '—';
      return;
    }

    if (collecte.getTime() < naissance.getTime()) {
      this.age = '—';
      return;
    }

    let annees = collecte.getFullYear() - naissance.getFullYear();

    let mois = collecte.getMonth() - naissance.getMonth();

    let jours = collecte.getDate() - naissance.getDate();

    if (jours < 0) {
      mois--;

      const dernierJourMoisPrecedent = new Date(
        collecte.getFullYear(),
        collecte.getMonth(),
        0,
      ).getDate();

      jours += dernierJourMoisPrecedent;
    }

    if (mois < 0) {
      annees--;
      mois += 12;
    }

    this.age = `${annees} ans ${mois} mois ${jours} jours`;
  }

  private creerDateLocale(date: string | null): Date | null {
    if (!date) {
      return null;
    }

    const parties = date.substring(0, 10).split('-');

    if (parties.length !== 3) {
      return null;
    }

    const annee = Number(parties[0]);

    const mois = Number(parties[1]);

    const jour = Number(parties[2]);

    if (!annee || !mois || !jour) {
      return null;
    }

    return new Date(annee, mois - 1, jour);
  }

  private dateToString(date: Date): string {
    const annee = date.getFullYear();

    const mois = String(date.getMonth() + 1).padStart(2, '0');

    const jour = String(date.getDate()).padStart(2, '0');

    return `${annee}-${mois}-${jour}`;
  }

  modifierPays(idPays: number | null): void {
    if (!this.adresse || !this.modeEdition) {
      return;
    }

    this.adresse.IdPays = idPays !== null ? Number(idPays) : null;

    console.log('IdPays sélectionné :', this.adresse.IdPays);
  }

  modifier(): void {
    if (!this.donneur) {
      return;
    }

    this.erreur = '';
    this.modeEdition = true;

    this.changeDetectorRef.detectChanges();
  }

  modifierDateNaissance(date: string | null): void {
    if (!this.donneur || !this.modeEdition) {
      return;
    }

    this.donneur.DateNaissance = date || null;

    this.calculerAge();

    void this.calculerEligibilite().then(() => {
      if (!this.donneur) {
        return;
      }

      this.donneurSelection.definirDonneur({
        IdContact: this.donneur.IdContact,
        NomUsage: this.donneur.NomUsage,
        Prenom: this.donneur.Prenom,
        DateNaissance: this.donneur.DateNaissance,
        NbDonsAvant2013: this.donneur.NbDonsAvant2013,
        eligible: this.eligible,
      });

      this.changeDetectorRef.detectChanges();
    });
  }

  annuler(): void {
    if (!this.donneur) {
      return;
    }

    const idContact = this.donneur.IdContact;

    this.modeEdition = false;

    void this.selectionnerDonneur(idContact);
  }

  async enregistrer(): Promise<void> {
    if (!this.donneur || !this.modeEdition) {
      return;
    }

    this.enregistrementEnCours = true;

    this.erreur = '';

    try {
      const { error: erreurContact } = await this.supabase.client
        .from('t_Contacts')
        .update({
          Civilite: this.donneur.Civilite,
          NomUsage: this.donneur.NomUsage,
          NomdeNaissance: this.donneur.NomdeNaissance,
          Prenom: this.donneur.Prenom,
          Sexe: this.donneur.Sexe,
          DateNaissance: this.donneur.DateNaissance,
          EstDécédé: this.donneur.EstDecede,
          Actif: this.donneur.Actif,
          NePeutVeutPlusDonner: this.donneur.NePeutVeutPlusDonner,
          VolontairePlasma: this.donneur.VolontairePlasma,
          PrimoDon: this.donneur.PrimoDon,
        })
        .eq('IdContact', this.donneur.IdContact);

      if (erreurContact) {
        throw erreurContact;
      }

      if (this.adresse) {
        console.log('IdPays à enregistrer :', this.adresse.IdPays);

        const { error: erreurAdresse } = await this.supabase.client
          .from('t_Adresses')
          .update({
            Adresse1: this.adresse.Adresse1,
            Adresse2: this.adresse.Adresse2,
            IdPays: this.adresse.IdPays,
            Commentaire: this.adresse.Commentaire,
          })
          .eq('IdContact', this.donneur.IdContact)
          .eq('EstPrincipale', true)
          .eq('EstValide', true);

        if (erreurAdresse) {
          throw erreurAdresse;
        }
      }

      this.modeEdition = false;

      await this.calculerEligibilite();

      this.donneurSelection.definirDonneur({
        IdContact: this.donneur.IdContact,
        NomUsage: this.donneur.NomUsage,
        Prenom: this.donneur.Prenom,
        DateNaissance: this.donneur.DateNaissance,
        NbDonsAvant2013: this.donneur.NbDonsAvant2013,
        eligible: this.eligible,
      });

      this.changeDetectorRef.detectChanges();
    } catch (error) {
      console.error('ERREUR ENREGISTREMENT DONNEUR :', error);

      this.erreur = 'Impossible d’enregistrer les modifications.';
    } finally {
      this.enregistrementEnCours = false;

      this.changeDetectorRef.detectChanges();
    }
  }

  formaterCodePostal(codePostal: string | null | undefined): string {
    if (!codePostal) {
      return '';
    }

    const code = codePostal.trim();

    if (/^\d{5}$/.test(code)) {
      return code.substring(0, 2) + ' ' + code.substring(2);
    }

    return code;
  }
}
