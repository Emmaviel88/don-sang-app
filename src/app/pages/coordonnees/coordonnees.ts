import { ChangeDetectorRef, Component, OnInit, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RechercheContactComponent } from '../../components/recherche-contact/recherche-contact';
import { SupabaseService } from '../../services/supabase';
import { CollecteSelectionService, CollecteSelectionnee } from '../../services/collecte-selection';
import { DonneurSelectionService } from '../../services/donneur-selection';
import { SessionService } from '../../services/session';
import { CompteursContactsService } from '../../services/compteurs-contacts';

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
  IdMoyen: number;
  IdTypeMoyen: number;
  Valeur: string | null;
  EstPrincipal: boolean;
  EstValide: boolean;
}

interface LigneContact {
  IdContact: number;
  Civilite: string | null;
  NomUsage: string | null;
  NomdeNaissance: string | null;
  Prenom: string | null;
  Sexe: string | null;
  DateNaissance: string | null;
  NbDonsAvant2013: number | null;
  EstDécédé: boolean;
  Actif: boolean;
  NePeutVeutPlusDonner: boolean;
  VolontairePlasma: boolean;
  PrimoDon: boolean;
  Commentaire: string | null;
}

@Component({
  selector: 'app-coordonnees',
  standalone: true,
  imports: [FormsModule, RechercheContactComponent],
  templateUrl: './coordonnees.html',
  styleUrl: './coordonnees.css',
})
export class Coordonnees implements OnInit {
  @ViewChild(RechercheContactComponent)
  controleRecherche?: RechercheContactComponent;

  donneur: Donneur | null = null;

  erreur = '';
  succes = '';

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

  idContactSaisi = '';
  chargementEnCours = false;
  private numeroSelection = 0;

  modeEdition = false;
  modeCreation = false;
  enregistrementEnCours = false;
  private idContactAvantCreation: number | null = null;
  private adresseExistante = false;
  private idMoyenTelephone: number | null = null;
  private idMoyenEmail: number | null = null;

  constructor(
    private supabase: SupabaseService,
    private collecteSelection: CollecteSelectionService,
    private donneurSelection: DonneurSelectionService,
    private session: SessionService,
    private compteurs: CompteursContactsService,
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

  private requeteContact() {
    return this.supabase.client.from('t_Contacts').select(
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
    );
  }

  // `ligne` : contact déjà lu par l'appelant, pour éviter une seconde lecture.
  async selectionnerDonneur(
    idContact: number,
    options: { ligne?: LigneContact; focusRecherche?: boolean } = {},
  ): Promise<void> {
    const numero = ++this.numeroSelection;

    this.controleRecherche?.clear();
    this.erreur = '';
    this.succes = '';
    this.modeEdition = false;
    this.chargementEnCours = true;
    this.changeDetectorRef.detectChanges();

    try {
      let data: LigneContact | null = options.ligne ?? null;

      if (!data) {
        const resultat = await this.requeteContact().eq('IdContact', idContact).maybeSingle();

        if (numero !== this.numeroSelection) {
          return;
        }

        if (resultat.error) {
          throw resultat.error;
        }

        data = resultat.data as LigneContact | null;
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
      this.adresseExistante = false;
      this.pays = null;

      this.telephonePortable = '';
      this.email = '';
      this.idMoyenTelephone = null;
      this.idMoyenEmail = null;

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

      if (numero !== this.numeroSelection) {
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

      this.chargementEnCours = false;
      this.changeDetectorRef.detectChanges();

      if (!this.modeEdition && options.focusRecherche !== false) {
        setTimeout(() => {
          this.controleRecherche?.focus();
        });
      }
    } catch (error) {
      if (numero !== this.numeroSelection) {
        return;
      }

      console.error('ERREUR CHARGEMENT DONNEUR :', error);

      this.erreur = 'Impossible de charger le donneur.';
    } finally {
      if (numero === this.numeroSelection && this.chargementEnCours) {
        this.chargementEnCours = false;
        this.changeDetectorRef.detectChanges();
      }
    }
  }

  gererErreurRecherche(error: unknown): void {
    console.error('ERREUR RECHERCHE DONNEUR :', error);
    this.erreur = 'Erreur pendant la recherche.';
    this.changeDetectorRef.detectChanges();
  }

  private async chargerAdresse(): Promise<void> {
    const donneur = this.donneur;

    if (!donneur) {
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
      .eq('IdContact', donneur.IdContact)
      .eq('EstPrincipale', true)
      .eq('EstValide', true)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (this.donneur !== donneur) {
      return;
    }

    this.adresse = data as Adresse | null;
    this.adresseExistante = data !== null;

    const idPays = this.adresse?.IdPays;

    this.pays = idPays ? (this.paysDisponibles.find((p) => p.IdPays === idPays) ?? null) : null;
  }

  private async chargerMoyensContact(): Promise<void> {
    const donneur = this.donneur;

    if (!donneur) {
      return;
    }

    const { data, error } = await this.supabase.client
      .from('t_MoyensContact')
      .select(
        `
          IdMoyen,
          IdTypeMoyen,
          Valeur,
          EstPrincipal,
          EstValide
        `,
      )
      .eq('IdContact', donneur.IdContact)
      .eq('EstPrincipal', true)
      .eq('EstValide', true)
      .in('IdTypeMoyen', [2, 3]);

    if (error) {
      throw error;
    }

    if (this.donneur !== donneur) {
      return;
    }

    const moyens = (data ?? []) as MoyenContact[];

    const portable = moyens.find((moyen) => moyen.IdTypeMoyen === 2);

    const mail = moyens.find((moyen) => moyen.IdTypeMoyen === 3);

    this.idMoyenTelephone = portable?.IdMoyen ?? null;
    this.idMoyenEmail = mail?.IdMoyen ?? null;
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
    const donneur = this.donneur;

    if (!donneur || !this.selection || !this.selection.DateCollecte) {
      return;
    }

    const dateCollecte = this.creerDateLocale(this.selection.DateCollecte);

    if (!dateCollecte) {
      return;
    }

    this.calculerAge();

    const naissance = donneur.DateNaissance ? this.creerDateLocale(donneur.DateNaissance) : null;

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
      .eq('IdDonneur', donneur.IdContact)
      .lte('DateDon', this.dateToString(dateCollecte))
      .order('DateDon', {
        ascending: false,
      });

    if (error) {
      throw error;
    }

    if (this.donneur !== donneur) {
      return;
    }

    const dons = data ?? [];

    this.nombreDons365 = dons.filter((don) => {
      const dateDon = this.creerDateLocale(don['DateDon'] ?? '');

      return dateDon !== null && dateDon >= dateLimite365;
    }).length;

    const maximumDons365 = donneur.Sexe === 'M' ? 6 : 4;

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

      this.delaiDernierDon = 'Aucun don';

      this.delaiDernierDonOK = true;
    }

    this.statutOK = donneur.Actif && !donneur.EstDecede && !donneur.NePeutVeutPlusDonner;

    this.eligible = this.ageOK && this.delaiDernierDonOK && this.nombreDons365OK && this.statutOK;
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

  async parcourirDonneurs(
    sens: 'premier' | 'precedent' | 'suivant' | 'dernier',
    pas = 1,
  ): Promise<void> {
    if (!this.donneur || this.modeEdition || this.enregistrementEnCours || this.chargementEnCours) {
      return;
    }

    try {
      const ascendant = sens === 'premier' || sens === 'suivant';

      let requete = this.requeteContact();

      if (sens === 'suivant') {
        requete = requete.gt('IdContact', this.donneur.IdContact);
      } else if (sens === 'precedent') {
        requete = requete.lt('IdContact', this.donneur.IdContact);
      }

      const { data, error } = await requete
        .order('IdContact', { ascending: ascendant })
        .range(pas - 1, pas - 1);

      if (error) {
        throw error;
      }

      const ligne = (data?.[0] ?? null) as LigneContact | null;

      if (!ligne) {
        // Moins de `pas` donneurs dans ce sens : aller à l'extrémité.
        if (pas > 1) {
          await this.parcourirDonneurs(sens === 'suivant' ? 'dernier' : 'premier');
        }

        return;
      }

      if (ligne.IdContact !== this.donneur.IdContact) {
        await this.selectionnerDonneur(ligne.IdContact, { ligne, focusRecherche: false });
      }
    } catch (error) {
      console.error('ERREUR PARCOURS DONNEURS :', error);

      this.erreur = 'Impossible de charger le donneur.';
    }
  }

  async allerAIdContact(): Promise<void> {
    if (this.modeEdition || this.enregistrementEnCours || this.chargementEnCours) {
      return;
    }

    const texte = this.idContactSaisi.trim();

    if (!texte) {
      return;
    }

    const idContact = Number(texte);

    if (!Number.isInteger(idContact) || idContact <= 0) {
      this.erreur = 'IdContact invalide.';
      return;
    }

    try {
      const { data, error } = await this.requeteContact().eq('IdContact', idContact).maybeSingle();

      if (error) {
        throw error;
      }

      if (!data) {
        this.erreur = `Aucun donneur avec l'IdContact ${idContact}.`;
        return;
      }

      this.idContactSaisi = '';
      await this.selectionnerDonneur(idContact, {
        ligne: data as LigneContact,
        focusRecherche: false,
      });
    } catch (error) {
      console.error('ERREUR RECHERCHE IDCONTACT :', error);

      this.erreur = 'Impossible de charger le donneur.';
    }
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
    if (!this.adresse) {
      this.adresse = this.adresseVide();
    }
    this.modeEdition = true;

    this.changeDetectorRef.detectChanges();
  }

  nouveauDonneur(): void {
    if (this.modeEdition || this.enregistrementEnCours) {
      return;
    }

    this.idContactAvantCreation = this.donneur?.IdContact ?? null;
    this.controleRecherche?.clear();
    this.donneurSelection.effacerDonneur();
    this.erreur = '';
    this.succes = '';
    this.modeCreation = true;
    this.modeEdition = true;
    this.adresseExistante = false;
    this.idMoyenTelephone = null;
    this.idMoyenEmail = null;
    this.donneur = {
      IdContact: 0,
      Civilite: 'Mme',
      NomUsage: '',
      NomdeNaissance: '',
      Prenom: '',
      Sexe: 'F',
      DateNaissance: null,
      NbDonsAvant2013: 0,
      EstDecede: false,
      Actif: true,
      NePeutVeutPlusDonner: false,
      VolontairePlasma: false,
      PrimoDon: false,
      Commentaire: null,
    };
    this.adresse = this.adresseVide();
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
    this.changeDetectorRef.detectChanges();
  }

  private adresseVide(): Adresse {
    return {
      Adresse1: null,
      Adresse2: null,
      CodePostal: null,
      Commune: null,
      IdPays: null,
      Commentaire: null,
      EstPrincipale: true,
      EstValide: true,
    };
  }

  modifierCodePostal(codePostal: string): void {
    if (this.adresse && this.modeEdition) {
      this.adresse.CodePostal = codePostal || null;
    }
  }

  modifierCommune(commune: string): void {
    if (this.adresse && this.modeEdition) {
      this.adresse.Commune = commune || null;
    }
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

    if (this.modeCreation) {
      const idContact = this.idContactAvantCreation;
      this.modeCreation = false;
      this.idContactAvantCreation = null;
      this.modeEdition = false;

      if (idContact !== null) {
        void this.selectionnerDonneur(idContact);
      } else {
        this.donneur = null;
        this.adresse = null;
        this.pays = null;
        this.donneurSelection.effacerDonneur();
      }
      return;
    }

    const idContact = this.donneur.IdContact;

    this.modeEdition = false;

    void this.selectionnerDonneur(idContact);
  }

  peutSupprimerDonneur(): boolean {
    const role = this.session.utilisateur()?.Role;
    return (
      !!this.donneur &&
      !this.modeCreation &&
      !this.modeEdition &&
      !this.enregistrementEnCours &&
      (role === 'Admin' || role === 'SA')
    );
  }

  async supprimerDonneur(): Promise<void> {
    if (!this.peutSupprimerDonneur() || !this.donneur) {
      return;
    }

    const nom = this.libelleDonneur() || `contact ${this.donneur.IdContact}`;
    const confirmation = window.confirm(
      `Supprimer définitivement ${nom} et ses dons, adhésions, fonctions, adresses et moyens de contact ? Aucun compte utilisateur/Auth ne sera supprimé. Cette action est irréversible.`,
    );
    if (!confirmation) {
      return;
    }

    this.enregistrementEnCours = true;
    this.erreur = '';
    this.succes = '';

    try {
      const { error } = await this.supabase.client.rpc('supprimer_donneur_complet', {
        p_id_contact: this.donneur.IdContact,
      });
      if (error) {
        throw error;
      }

      this.controleRecherche?.clear();
      this.donneurSelection.effacerDonneur();
      this.donneur = null;
      this.adresse = null;
      this.pays = null;
      this.telephonePortable = '';
      this.email = '';
      this.idMoyenTelephone = null;
      this.idMoyenEmail = null;
      this.adresseExistante = false;
      this.modeEdition = false;
      this.modeCreation = false;
      this.succes = 'Le donneur et toutes ses données ont été supprimés.';
      void this.compteurs.rafraichir();
    } catch (error) {
      console.error('ERREUR SUPPRESSION DONNEUR :', error);
      const message =
        error && typeof error === 'object' && 'message' in error
          ? String(error.message)
          : 'Erreur inconnue.';
      this.erreur = `Impossible de supprimer le donneur. ${message}`;
    } finally {
      this.enregistrementEnCours = false;
      this.changeDetectorRef.detectChanges();
    }
  }

  async enregistrer(): Promise<void> {
    if (!this.donneur || !this.modeEdition) {
      return;
    }

    this.enregistrementEnCours = true;

    this.erreur = '';
    this.succes = '';

    try {
      if (this.modeCreation) {
        if (!this.donneur.NomUsage?.trim() || !this.donneur.Prenom?.trim()) {
          this.erreur = 'Le nom et le prénom sont obligatoires.';
          return;
        }

        const { data, error } = await this.supabase.client
          .from('t_Contacts')
          .insert({
            Civilite: this.donneur.Civilite,
            NomUsage: this.donneur.NomUsage.trim(),
            NomdeNaissance: this.donneur.NomdeNaissance?.trim() || null,
            Prenom: this.donneur.Prenom.trim(),
            Sexe: this.donneur.Sexe,
            DateNaissance: this.donneur.DateNaissance,
            NbDonsAvant2013: this.donneur.NbDonsAvant2013,
            EstDécédé: this.donneur.EstDecede,
            Actif: this.donneur.Actif,
            NePeutVeutPlusDonner: this.donneur.NePeutVeutPlusDonner,
            VolontairePlasma: this.donneur.VolontairePlasma,
            PrimoDon: this.donneur.PrimoDon,
            Commentaire: this.donneur.Commentaire,
          })
          .select('IdContact')
          .single();

        if (error) {
          throw error;
        }

        this.donneur.IdContact = data.IdContact;
        this.modeCreation = false;
        this.idContactAvantCreation = null;
      } else {
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
      }

      if (this.adresse) {
        await this.enregistrerAdresse();
      }

      this.telephonePortable = this.formaterTelephone(this.telephonePortable);
      this.idMoyenTelephone = await this.enregistrerMoyenContact(
        2,
        this.telephonePortable,
        this.idMoyenTelephone,
      );
      this.idMoyenEmail = await this.enregistrerMoyenContact(3, this.email, this.idMoyenEmail);

      this.modeEdition = false;

      void this.compteurs.rafraichir();

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

  private async enregistrerAdresse(): Promise<void> {
    if (!this.donneur || !this.adresse) {
      return;
    }

    const champsAdresse = [
      this.adresse.Adresse1,
      this.adresse.Adresse2,
      this.adresse.CodePostal,
      this.adresse.Commune,
      this.adresse.Commentaire,
    ];
    const contientAdresse =
      champsAdresse.some((valeur) => !!valeur?.trim()) || this.adresse.IdPays !== null;

    if (!contientAdresse) {
      if (this.adresseExistante) {
        const { error } = await this.supabase.client
          .from('t_Adresses')
          .update({ EstPrincipale: false, EstValide: false })
          .eq('IdContact', this.donneur.IdContact)
          .eq('EstPrincipale', true)
          .eq('EstValide', true);

        if (error) {
          throw error;
        }
        this.adresseExistante = false;
      }
      return;
    }

    const valeurs = {
      Adresse1: this.adresse.Adresse1?.trim() || null,
      Adresse2: this.adresse.Adresse2?.trim() || null,
      CodePostal: this.adresse.CodePostal?.trim() || null,
      Commune: this.adresse.Commune?.trim() || null,
      IdPays: this.adresse.IdPays,
      Commentaire: this.adresse.Commentaire?.trim() || null,
      EstPrincipale: true,
      EstValide: true,
    };

    const result = this.adresseExistante
      ? await this.supabase.client
          .from('t_Adresses')
          .update(valeurs)
          .eq('IdContact', this.donneur.IdContact)
          .eq('EstPrincipale', true)
          .eq('EstValide', true)
      : await this.supabase.client
          .from('t_Adresses')
          .insert({ ...valeurs, IdContact: this.donneur.IdContact });

    if (result.error) {
      throw result.error;
    }

    this.adresseExistante = true;
  }

  private async enregistrerMoyenContact(
    idTypeMoyen: number,
    valeur: string,
    idMoyen: number | null,
  ): Promise<number | null> {
    if (!this.donneur) {
      return idMoyen;
    }

    const valeurNettoyee = valeur.trim();
    if (idMoyen !== null) {
      const { error } = await this.supabase.client
        .from('t_MoyensContact')
        .update(
          valeurNettoyee
            ? { Valeur: valeurNettoyee, EstPrincipal: true, EstValide: true }
            : { EstPrincipal: false, EstValide: false },
        )
        .eq('IdMoyen', idMoyen);

      if (error) {
        throw error;
      }

      return valeurNettoyee ? idMoyen : null;
    }

    if (!valeurNettoyee) {
      return null;
    }

    const { data, error } = await this.supabase.client
      .from('t_MoyensContact')
      .insert({
        IdContact: this.donneur.IdContact,
        IdTypeMoyen: idTypeMoyen,
        Valeur: valeurNettoyee,
        EstPrincipal: true,
        EstValide: true,
      })
      .select('IdMoyen')
      .single();

    if (error) {
      throw error;
    }

    return data.IdMoyen;
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
