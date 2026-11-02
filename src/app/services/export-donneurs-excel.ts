import { Injectable } from '@angular/core';
import ExcelJS from 'exceljs';
import { SupabaseService } from './supabase';
import { CollecteSelectionnee } from './collecte-selection';

const CHEMIN_MODELE = '/Modèle liste xls/Modèle Liste donneurs collecte 2026-09-18.xlsx';
const NOM_FEUILLE = 'Donneurs';
const PREMIERE_LIGNE_DONNEES = 3;
const PREMIERE_ANNEE_COLONNE = 11;
const NB_COLONNES_ANNEES = 8;
const COLONNE_TOTAL = 19;
const COLONNE_DATE_COLLECTE = 20;
const COLONNE_DON_PLASMA = 21;

interface ContactBrut {
  IdContact: number;
  NomUsage: string | null;
  NomdeNaissance: string | null;
  Prenom: string | null;
  Sexe: string | null;
  DateNaissance: string | null;
  NbDonsAvant2013: number | null;
  VolontairePlasma: boolean | null;
}

interface LigneExport {
  NomUsage: string | null;
  Prenom: string | null;
  NomdeNaissance: string | null;
  Adresse: string | null;
  CodePostal: number | null;
  Commune: string | null;
  Mobile: string | null;
  Mail: string | null;
  DateNaissance: string | null;
  Age: string;
  DonsParAnnee: number[];
  Total: number;
  VolontairePlasma: boolean;
}

interface ContactAdherent {
  IdContact: number;
  Civilite: string;
  Nom: string;
  Prenom: string;
  Mail: string;
  Adresse: AdresseAdherent;
  IdConjoint: number | null;
}

interface AdresseAdherent {
  Adresse: string;
  CodePostal: string;
  Commune: string;
}

@Injectable({ providedIn: 'root' })
export class ExportDonneursExcelService {
  constructor(private supabase: SupabaseService) {}

  async exporterDonneursEligibles(collecte: CollecteSelectionnee): Promise<void> {
    const dateCollecte = this.creerDateLocale(collecte.DateCollecte);

    if (!dateCollecte) {
      throw new Error('Date de collecte invalide.');
    }

    const contacts = await this.chargerContactsActifs();
    const idsContacts = contacts.map((contact) => contact.IdContact);

    const [adresses, moyensContact, dons] = await Promise.all([
      this.chargerAdresses(idsContacts),
      this.chargerMoyensContact(idsContacts),
      this.chargerDons(idsContacts),
    ]);

    const anneeFin = dateCollecte.getFullYear();
    const anneeDebut = anneeFin - (NB_COLONNES_ANNEES - 1);

    const lignes = contacts
      .map((contact) =>
        this.construireLigne(contact, dateCollecte, anneeDebut, adresses, moyensContact, dons),
      )
      .filter((ligne): ligne is LigneExport => ligne !== null)
      .sort((a, b) => {
        const nomA = `${a.NomUsage ?? ''} ${a.Prenom ?? ''}`;
        const nomB = `${b.NomUsage ?? ''} ${b.Prenom ?? ''}`;

        return nomA.localeCompare(nomB, 'fr');
      });

    const workbook = await this.chargerModele();
    const feuille = workbook.getWorksheet(NOM_FEUILLE);

    if (!feuille) {
      throw new Error('La feuille « Donneurs » est introuvable dans le modèle Excel.');
    }

    this.remplirFeuille(feuille, lignes, dateCollecte, anneeDebut);

    const buffer = await workbook.xlsx.writeBuffer();
    const nomFichier = `Liste donneurs collecte ${this.dateToString(dateCollecte)}.xlsx`;

    this.declencherTelechargement(buffer, nomFichier);
  }

  // Nouveau donneur = donneur ayant donné à cette collecte et dont c'est le seul don à ce jour
  // (même définition que les statistiques), ou dont la case Primo-don est cochée : cela inclut
  // les anciens donneurs revenus, dont l'adresse mail a pu changer.
  async exporterNouveauxDonneurs(collecte: CollecteSelectionnee): Promise<number> {
    const dateCollecte = this.creerDateLocale(collecte.DateCollecte);

    if (!dateCollecte) {
      throw new Error('Date de collecte invalide.');
    }

    const donsCollecte = await this.chargerToutesLesPages((from, to) =>
      this.supabase.client
        .from('t_Dons')
        .select('IdDonneur')
        .eq('AnnéeDon', collecte.annee)
        .eq('NumCollecte', collecte.NumCollecte)
        .range(from, to),
    );

    const idsDonneurs = [...new Set(donsCollecte.map((don) => don.IdDonneur as number))];

    const [contacts, dons, moyensContact] = await Promise.all([
      this.chargerParLotsDIds(idsDonneurs, (lotIds) =>
        this.chargerToutesLesPages((from, to) =>
          this.supabase.client
            .from('t_Contacts')
            .select('IdContact, NomUsage, Prenom, NbDonsAvant2013, PrimoDon')
            .in('IdContact', lotIds)
            .range(from, to),
        ),
      ),
      this.chargerParLotsDIds(idsDonneurs, (lotIds) =>
        this.chargerToutesLesPages((from, to) =>
          this.supabase.client
            .from('t_Dons')
            .select('IdDonneur, "AnnéeDon", NumCollecte')
            .in('IdDonneur', lotIds)
            .range(from, to),
        ),
      ),
      this.chargerMoyensContact(idsDonneurs),
    ]);

    const nbDonsJusquaCollecte = new Map<number, number>();

    for (const don of dons) {
      const annee = don['AnnéeDon'] as number;
      const jusquaCollecte =
        annee < collecte.annee ||
        (annee === collecte.annee && (don.NumCollecte as number) <= collecte.NumCollecte);

      if (jusquaCollecte) {
        nbDonsJusquaCollecte.set(don.IdDonneur, (nbDonsJusquaCollecte.get(don.IdDonneur) ?? 0) + 1);
      }
    }

    const lignes = contacts
      .filter(
        (contact) =>
          contact.PrimoDon === true ||
          (contact.NbDonsAvant2013 ?? 0) + (nbDonsJusquaCollecte.get(contact.IdContact) ?? 0) === 1,
      )
      .map((contact) => ({
        NomUsage: (contact.NomUsage as string | null) ?? '',
        Prenom: (contact.Prenom as string | null) ?? '',
        Mail: moyensContact.get(contact.IdContact)?.Mail ?? '',
      }))
      .sort((a, b) => `${a.NomUsage} ${a.Prenom}`.localeCompare(`${b.NomUsage} ${b.Prenom}`, 'fr'));

    const workbook = new ExcelJS.Workbook();
    const feuille = workbook.addWorksheet('Nouveaux donneurs');

    feuille.columns = [
      { header: "Nom d'usage", key: 'NomUsage', width: 28 },
      { header: 'Prénom', key: 'Prenom', width: 24 },
      { header: 'Adresse mail', key: 'Mail', width: 40 },
    ];
    feuille.getRow(1).font = { bold: true };
    feuille.addRows(lignes);

    const buffer = await workbook.xlsx.writeBuffer();

    this.declencherTelechargement(
      buffer,
      `Nouveaux donneurs collecte ${this.dateToString(dateCollecte)}.xlsx`,
    );

    return lignes.length;
  }

  // Adhérents des années [anneeFin-3 ; anneeFin] ∪ membres actuels du comité.
  // Chaque adhérent est associé à son conjoint (IdConjoint), même non adhérent, sur une même ligne.
  async exporterAdherents(anneeFin: number): Promise<{ nbTotal: number; nbMails: number }> {
    const anneeDebut = anneeFin - 3;

    const [adhesions, fonctions] = await Promise.all([
      this.chargerToutesLesPages((from, to) =>
        this.supabase.client
          .from('t_Adhesions')
          .select('IdContact')
          .gte('Année', anneeDebut)
          .lte('Année', anneeFin)
          .range(from, to),
      ),
      this.chargerToutesLesPages((from, to) =>
        this.supabase.client
          .from('t_ContactsFonctions')
          .select('IdContact')
          .is('DateFin', null)
          .range(from, to),
      ),
    ]);

    const idsAdherents = new Set(
      [...adhesions, ...fonctions].map((ligne) => ligne.IdContact as number),
    );
    const chargerContacts = (ids: number[], colonne: 'IdContact' | 'IdConjoint') =>
      this.chargerParLotsDIds(ids, (lotIds) =>
        this.chargerToutesLesPages((from, to) =>
          this.supabase.client
            .from('t_Contacts')
            .select(
              'IdContact, Civilite, NomUsage, NomdeNaissance, Prenom, IdConjoint, "EstDécédé"',
            )
            .in(colonne, lotIds)
            .range(from, to),
        ),
      );

    const contactsAdherents = await chargerContacts([...idsAdherents], 'IdContact');

    // Conjoints : lien porté par la fiche de l'adhérent ou par celle du conjoint
    const idsConjointsConnus = contactsAdherents
      .map((ligne) => ligne.IdConjoint as number | null)
      .filter((id): id is number => id !== null && !idsAdherents.has(id));
    const [conjointsDirects, conjointsInverses] = await Promise.all([
      chargerContacts([...new Set(idsConjointsConnus)], 'IdContact'),
      chargerContacts([...idsAdherents], 'IdConjoint'),
    ]);

    const contactsBruts = [...contactsAdherents, ...conjointsDirects, ...conjointsInverses];
    const idsContacts = [...new Set(contactsBruts.map((ligne) => ligne.IdContact as number))];

    const [adresses, moyensContact] = await Promise.all([
      this.chargerAdressesCompletes(idsContacts),
      this.chargerMoyensContact(idsContacts),
    ]);

    const contacts = new Map<number, ContactAdherent>();

    for (const ligne of contactsBruts) {
      if (ligne['EstDécédé'] === true) {
        continue;
      }

      contacts.set(ligne.IdContact, {
        IdContact: ligne.IdContact,
        Civilite: (ligne.Civilite as string | null) ?? '',
        Nom: ((ligne.NomUsage || ligne.NomdeNaissance || '') as string).toUpperCase(),
        Prenom: (ligne.Prenom as string | null) ?? '',
        Mail: moyensContact.get(ligne.IdContact)?.Mail ?? '',
        Adresse: adresses.get(ligne.IdContact) ?? { Adresse: '', CodePostal: '', Commune: '' },
        IdConjoint: ligne.IdConjoint as number | null,
      });
    }

    const dejaTraites = new Set<number>();
    const lignes: Array<{ personne: ContactAdherent; conjoint: ContactAdherent | null }> = [];

    const trier = (a: ContactAdherent, b: ContactAdherent) =>
      `${a.Nom} ${a.Prenom}`.localeCompare(`${b.Nom} ${b.Prenom}`, 'fr');
    const tousContacts = [...contacts.values()].sort(trier);
    const contactsTries = tousContacts.filter((contact) => idsAdherents.has(contact.IdContact));

    for (const personne of contactsTries) {
      if (dejaTraites.has(personne.IdContact)) {
        continue;
      }

      dejaTraites.add(personne.IdContact);

      let conjoint: ContactAdherent | null = null;

      if (personne.IdConjoint !== null) {
        conjoint = contacts.get(personne.IdConjoint) ?? null;
      }

      if (!conjoint) {
        conjoint =
          tousContacts.find(
            (autre) => autre.IdConjoint === personne.IdContact && !dejaTraites.has(autre.IdContact),
          ) ?? null;
      }

      if (conjoint && !dejaTraites.has(conjoint.IdContact)) {
        dejaTraites.add(conjoint.IdContact);
      } else {
        conjoint = null;
      }

      lignes.push({ personne, conjoint });
    }

    lignes.sort(
      (a, b) =>
        a.personne.Nom.localeCompare(b.personne.Nom, 'fr') ||
        a.personne.Prenom.localeCompare(b.personne.Prenom, 'fr'),
    );

    const workbook = new ExcelJS.Workbook();
    const feuille = workbook.addWorksheet('Adhérents');

    feuille.columns = [
      { header: 'Civilité', key: 'Civilite', width: 12 },
      { header: 'NOM', key: 'Nom', width: 24 },
      { header: 'Prénom', key: 'Prenom', width: 20 },
      { header: 'Adresse mail', key: 'Mail', width: 36 },
      { header: 'Adresse', key: 'Adresse', width: 44 },
      { header: 'Code postal', key: 'CodePostal', width: 12 },
      { header: 'Commune', key: 'Commune', width: 28 },
      { header: 'Civilité conjoint(e)', key: 'CiviliteConjoint', width: 18 },
      { header: 'NOM conjoint(e)', key: 'NomConjoint', width: 24 },
      { header: 'Prénom conjoint(e)', key: 'PrenomConjoint', width: 20 },
      { header: 'Adresse mail conjoint(e)', key: 'MailConjoint', width: 36 },
    ];

    let nbTotal = 0;
    let nbMails = 0;

    for (const { personne, conjoint } of lignes) {
      nbTotal += conjoint ? 2 : 1;
      nbMails += (personne.Mail ? 1 : 0) + (conjoint?.Mail ? 1 : 0);

      const adresse = personne.Adresse.Adresse
        ? personne.Adresse
        : (conjoint?.Adresse ?? personne.Adresse);

      feuille.addRow({
        Civilite: personne.Civilite,
        Nom: personne.Nom,
        Prenom: personne.Prenom,
        Mail: personne.Mail,
        Adresse: adresse.Adresse,
        CodePostal: adresse.CodePostal,
        Commune: adresse.Commune,
        CiviliteConjoint: conjoint?.Civilite ?? '',
        NomConjoint: conjoint?.Nom ?? '',
        PrenomConjoint: conjoint?.Prenom ?? '',
        MailConjoint: conjoint?.Mail ?? '',
      });
    }

    const bordure: Partial<ExcelJS.Borders> = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' },
    };

    feuille.eachRow((ligne, numeroLigne) => {
      ligne.eachCell({ includeEmpty: true }, (cellule) => {
        cellule.border = bordure;
        cellule.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: {
            argb: numeroLigne === 1 ? 'FF000000' : numeroLigne % 2 === 0 ? 'FFFFFFFF' : 'FFE7E6E6',
          },
        };
      });
    });
    feuille.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };

    feuille.addRow({});

    const totaux = feuille.addRow({
      Nom: `Nb total : ${nbTotal}`,
      Mail: `Nb de mails connus : ${nbMails}`,
    });

    totaux.font = { bold: true };

    const buffer = await workbook.xlsx.writeBuffer();

    this.declencherTelechargement(
      buffer,
      `Liste adhérents et membres ${anneeDebut}-${anneeFin}.xlsx`,
    );

    return { nbTotal, nbMails };
  }

  private async chargerAdressesCompletes(
    idsContacts: number[],
  ): Promise<Map<number, AdresseAdherent>> {
    const carte = new Map<number, AdresseAdherent>();

    if (idsContacts.length === 0) {
      return carte;
    }

    const donnees = await this.chargerParLotsDIds(idsContacts, (lotIds) =>
      this.chargerToutesLesPages((from, to) =>
        this.supabase.client
          .from('t_Adresses')
          .select('IdContact, Adresse1, Adresse2, CodePostal, Commune')
          .in('IdContact', lotIds)
          .eq('EstPrincipale', true)
          .eq('EstValide', true)
          .range(from, to),
      ),
    );

    for (const ligne of donnees) {
      const texte = (valeur: unknown) => (valeur ?? '').toString().trim();

      carte.set(ligne.IdContact, {
        Adresse: [texte(ligne.Adresse1), texte(ligne.Adresse2)].filter((p) => p !== '').join(', '),
        CodePostal: texte(ligne.CodePostal),
        Commune: texte(ligne.Commune),
      });
    }

    return carte;
  }

  private async chargerModele(): Promise<ExcelJS.Workbook> {
    const reponse = await fetch(encodeURI(CHEMIN_MODELE));

    if (!reponse.ok) {
      throw new Error('Impossible de charger le modèle Excel.');
    }

    const buffer = await reponse.arrayBuffer();
    const workbook = new ExcelJS.Workbook();

    await workbook.xlsx.load(buffer);

    return workbook;
  }

  private async chargerContactsActifs(): Promise<ContactBrut[]> {
    const donnees = await this.chargerToutesLesPages((from, to) =>
      this.supabase.client
        .from('t_Contacts')
        .select(
          `
            IdContact,
            NomUsage,
            NomdeNaissance,
            Prenom,
            Sexe,
            DateNaissance,
            NbDonsAvant2013,
            VolontairePlasma,
            "EstDécédé",
            Actif,
            NePeutVeutPlusDonner
          `,
        )
        .eq('Actif', true)
        .eq('EstDécédé', false)
        .eq('NePeutVeutPlusDonner', false)
        .range(from, to),
    );

    return donnees.map((ligne) => ({
      IdContact: ligne.IdContact,
      NomUsage: ligne.NomUsage,
      NomdeNaissance: ligne.NomdeNaissance,
      Prenom: ligne.Prenom,
      Sexe: ligne.Sexe,
      DateNaissance: ligne.DateNaissance,
      NbDonsAvant2013: ligne.NbDonsAvant2013,
      VolontairePlasma: ligne.VolontairePlasma,
    }));
  }

  // Les requêtes .in() avec trop d'ids génèrent une URL trop longue pour Kong (stack Supabase locale).
  private async chargerParLotsDIds<T>(
    idsContacts: number[],
    executerLot: (lotIds: number[]) => Promise<T[]>,
  ): Promise<T[]> {
    const TAILLE_LOT = 200;
    const resultat: T[] = [];

    for (let i = 0; i < idsContacts.length; i += TAILLE_LOT) {
      const lotIds = idsContacts.slice(i, i + TAILLE_LOT);

      resultat.push(...(await executerLot(lotIds)));
    }

    return resultat;
  }

  private async chargerToutesLesPages<T>(
    executerPage: (
      from: number,
      to: number,
    ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  ): Promise<T[]> {
    const TAILLE_PAGE = 1000;
    const resultat: T[] = [];
    let page = 0;

    for (;;) {
      const from = page * TAILLE_PAGE;
      const to = from + TAILLE_PAGE - 1;
      const { data, error } = await executerPage(from, to);

      if (error) {
        throw error;
      }

      const lignes = data ?? [];

      resultat.push(...lignes);

      if (lignes.length < TAILLE_PAGE) {
        break;
      }

      page++;
    }

    return resultat;
  }

  private async chargerAdresses(
    idsContacts: number[],
  ): Promise<
    Map<number, { Adresse1: string | null; CodePostal: number | null; Commune: string | null }>
  > {
    const carte = new Map<
      number,
      { Adresse1: string | null; CodePostal: number | null; Commune: string | null }
    >();

    if (idsContacts.length === 0) {
      return carte;
    }

    const donnees = await this.chargerParLotsDIds(idsContacts, (lotIds) =>
      this.chargerToutesLesPages((from, to) =>
        this.supabase.client
          .from('t_Adresses')
          .select('IdContact, Adresse1, CodePostal, Commune, EstPrincipale, EstValide')
          .in('IdContact', lotIds)
          .eq('EstPrincipale', true)
          .eq('EstValide', true)
          .range(from, to),
      ),
    );

    for (const ligne of donnees) {
      carte.set(ligne.IdContact, {
        Adresse1: ligne.Adresse1,
        CodePostal: ligne.CodePostal,
        Commune: ligne.Commune,
      });
    }

    return carte;
  }

  private async chargerMoyensContact(
    idsContacts: number[],
  ): Promise<Map<number, { Mobile: string | null; Mail: string | null }>> {
    const carte = new Map<number, { Mobile: string | null; Mail: string | null }>();

    if (idsContacts.length === 0) {
      return carte;
    }

    const donnees = await this.chargerParLotsDIds(idsContacts, (lotIds) =>
      this.chargerToutesLesPages((from, to) =>
        this.supabase.client
          .from('t_MoyensContact')
          .select('IdContact, IdTypeMoyen, Valeur, EstPrincipal, EstValide')
          .in('IdContact', lotIds)
          .eq('EstPrincipal', true)
          .eq('EstValide', true)
          .in('IdTypeMoyen', [2, 3])
          .range(from, to),
      ),
    );

    for (const ligne of donnees) {
      const entree = carte.get(ligne.IdContact) ?? { Mobile: null, Mail: null };

      if (ligne.IdTypeMoyen === 2) {
        entree.Mobile = ligne.Valeur;
      } else if (ligne.IdTypeMoyen === 3) {
        entree.Mail = ligne.Valeur;
      }

      carte.set(ligne.IdContact, entree);
    }

    return carte;
  }

  private async chargerDons(idsContacts: number[]): Promise<Map<number, string[]>> {
    const carte = new Map<number, string[]>();

    if (idsContacts.length === 0) {
      return carte;
    }

    const donnees = await this.chargerParLotsDIds(idsContacts, (lotIds) =>
      this.chargerToutesLesPages((from, to) =>
        this.supabase.client
          .from('t_Dons')
          .select('IdDonneur, DateDon')
          .in('IdDonneur', lotIds)
          .range(from, to),
      ),
    );

    for (const ligne of donnees) {
      const dates = carte.get(ligne.IdDonneur) ?? [];

      dates.push(ligne.DateDon);
      carte.set(ligne.IdDonneur, dates);
    }

    return carte;
  }

  private construireLigne(
    contact: ContactBrut,
    dateCollecte: Date,
    anneeDebut: number,
    adresses: Map<
      number,
      { Adresse1: string | null; CodePostal: number | null; Commune: string | null }
    >,
    moyensContact: Map<number, { Mobile: string | null; Mail: string | null }>,
    dons: Map<number, string[]>,
  ): LigneExport | null {
    const naissance = this.creerDateLocale(contact.DateNaissance);

    if (!naissance || dateCollecte.getTime() < naissance.getTime()) {
      return null;
    }

    let age = dateCollecte.getFullYear() - naissance.getFullYear();

    const mois = dateCollecte.getMonth() - naissance.getMonth();
    const jours = dateCollecte.getDate() - naissance.getDate();

    if (mois < 0 || (mois === 0 && jours < 0)) {
      age--;
    }

    const ageOK = age >= 18 && age < 71;

    if (contact.Sexe !== 'M' && contact.Sexe !== 'F') {
      return null;
    }

    const datesDons = (dons.get(contact.IdContact) ?? [])
      .map((date) => this.creerDateLocale(date))
      .filter((date): date is Date => date !== null);

    const dateLimite365 = new Date(dateCollecte);

    dateLimite365.setDate(dateLimite365.getDate() - 365);

    const dons365 = datesDons.filter(
      (date) =>
        date.getTime() >= dateLimite365.getTime() && date.getTime() <= dateCollecte.getTime(),
    );

    const maximumDons365 = contact.Sexe === 'M' ? 6 : 4;
    const nombreDons365OK = dons365.length < maximumDons365;

    const donsAvantCollecte = datesDons
      .filter((date) => date.getTime() <= dateCollecte.getTime())
      .sort((a, b) => b.getTime() - a.getTime());

    let delaiDernierDonOK = true;

    if (donsAvantCollecte.length > 0) {
      const diffJours = Math.floor(
        (dateCollecte.getTime() - donsAvantCollecte[0].getTime()) / (1000 * 60 * 60 * 24),
      );

      delaiDernierDonOK = diffJours >= 56;
    }

    const donsParAnnee: number[] = [];

    for (let index = 0; index < NB_COLONNES_ANNEES; index++) {
      const annee = anneeDebut + index;

      donsParAnnee.push(datesDons.filter((date) => date.getFullYear() === annee).length);
    }

    // Aligné sur la règle Access historique : le donneur doit avoir donné au moins une fois sur les 8 dernières années.
    const aDonneSur8Ans = donsParAnnee.some((nb) => nb > 0);

    const eligible = ageOK && nombreDons365OK && delaiDernierDonOK && aDonneSur8Ans;

    if (!eligible) {
      return null;
    }

    const total = (contact.NbDonsAvant2013 ?? 0) + datesDons.length;

    const adresse = adresses.get(contact.IdContact);
    const moyens = moyensContact.get(contact.IdContact);

    return {
      NomUsage: contact.NomUsage,
      Prenom: contact.Prenom,
      NomdeNaissance:
        contact.NomdeNaissance && contact.NomdeNaissance !== contact.NomUsage
          ? contact.NomdeNaissance
          : null,
      Adresse: adresse?.Adresse1 ?? null,
      CodePostal: adresse?.CodePostal ?? null,
      Commune: adresse?.Commune ?? null,
      Mobile: moyens?.Mobile ?? null,
      Mail: moyens?.Mail ?? null,
      DateNaissance: contact.DateNaissance,
      Age: `${age} ans ${mois < 0 ? mois + 12 : mois} mois ${jours < 0 ? jours + 31 : jours} jours`,
      DonsParAnnee: donsParAnnee,
      Total: total,
      VolontairePlasma: contact.VolontairePlasma === true,
    };
  }

  private remplirFeuille(
    feuille: ExcelJS.Worksheet,
    lignes: LigneExport[],
    dateCollecte: Date,
    anneeDebut: number,
  ): void {
    const ligneTitre = feuille.getRow(1);

    ligneTitre.getCell(1).value =
      `Liste des donneurs éligibles pour la collecte de sang du ${this.formaterDateLongue(dateCollecte)}`;

    const ligneEntete = feuille.getRow(2);

    for (let index = 0; index < NB_COLONNES_ANNEES; index++) {
      ligneEntete.getCell(PREMIERE_ANNEE_COLONNE + index).value = anneeDebut + index;
    }

    ligneEntete.getCell(COLONNE_DATE_COLLECTE).value = dateCollecte;

    const ligneModele = feuille.getRow(PREMIERE_LIGNE_DONNEES);
    const stylesParColonne = new Map<number, Partial<ExcelJS.Style>>();

    ligneModele.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      stylesParColonne.set(colNumber, { ...cell.style });
    });

    // Repère la ligne de pied de page existante ("Nombre total de donneurs : ...").
    let ligneFooterAncienne = feuille.rowCount;

    while (ligneFooterAncienne > PREMIERE_LIGNE_DONNEES) {
      const valeur = feuille.getRow(ligneFooterAncienne).getCell(1).value;

      if (typeof valeur === 'string' && valeur.startsWith('Nombre total')) {
        break;
      }

      ligneFooterAncienne--;
    }

    const styleFooter = { ...feuille.getRow(ligneFooterAncienne).getCell(1).style };

    feuille.unMergeCells(`A${ligneFooterAncienne}:U${ligneFooterAncienne}`);

    // Vide toutes les lignes de données et l'ancien pied de page avant réécriture.
    for (
      let numeroLigne = PREMIERE_LIGNE_DONNEES;
      numeroLigne <= ligneFooterAncienne;
      numeroLigne++
    ) {
      const row = feuille.getRow(numeroLigne);

      for (let colonne = 1; colonne <= COLONNE_DON_PLASMA; colonne++) {
        row.getCell(colonne).value = null;
      }
    }

    lignes.forEach((ligne, index) => {
      const numeroLigne = PREMIERE_LIGNE_DONNEES + index;
      const row = feuille.getRow(numeroLigne);

      const valeurs: Record<number, unknown> = {
        1: ligne.NomUsage,
        2: ligne.Prenom,
        3: ligne.NomdeNaissance,
        4: ligne.Adresse,
        5: ligne.CodePostal,
        6: ligne.Commune,
        7: ligne.Mobile,
        8: ligne.Mail,
        9: this.creerDateLocale(ligne.DateNaissance),
        10: ligne.Age,
        [COLONNE_TOTAL]: ligne.Total,
        [COLONNE_DATE_COLLECTE]: '☐',
        [COLONNE_DON_PLASMA]: ligne.VolontairePlasma ? '☑' : '☐',
      };

      ligne.DonsParAnnee.forEach((nb, decalage) => {
        valeurs[PREMIERE_ANNEE_COLONNE + decalage] = nb;
      });

      for (let colonne = 1; colonne <= COLONNE_DON_PLASMA; colonne++) {
        const cell = row.getCell(colonne);
        const style = stylesParColonne.get(colonne);

        if (style) {
          cell.style = style;
        }

        if (colonne in valeurs) {
          cell.value = valeurs[colonne] as ExcelJS.CellValue;
        }
      }
    });

    const numeroLigneFooter = PREMIERE_LIGNE_DONNEES + lignes.length;
    const ligneFooter = feuille.getRow(numeroLigneFooter);

    for (let colonne = 1; colonne <= COLONNE_DON_PLASMA; colonne++) {
      ligneFooter.getCell(colonne).style = styleFooter;
    }

    ligneFooter.getCell(1).value = `Nombre total de donneurs éligibles : ${lignes.length}`;
    feuille.mergeCells(`A${numeroLigneFooter}:U${numeroLigneFooter}`);

    const derniereLigneDonnees = numeroLigneFooter - 1;
    const feuilleAvecRegles = feuille as ExcelJS.Worksheet & {
      conditionalFormattings: ExcelJS.ConditionalFormattingOptions[];
    };
    const reglesConditionnelles = [...feuilleAvecRegles.conditionalFormattings];

    feuille.removeConditionalFormatting(() => false);

    if (lignes.length > 0) {
      for (const regle of reglesConditionnelles) {
        const ref = regle.ref.replace(
          /(:\$?[A-Z]{1,3}\$?)\d+$/,
          (_correspondance, colonneFin: string) => `${colonneFin}${derniereLigneDonnees}`,
        );

        feuille.addConditionalFormatting({ ...regle, ref });
      }
    }

    feuille.autoFilter = `A2:U${Math.max(PREMIERE_LIGNE_DONNEES - 1, derniereLigneDonnees)}`;

    // ExcelJS spliceRows ne tronque pas les lignes allouées en fin de feuille.
    const lignesAllouees = feuille as ExcelJS.Worksheet & { _rows: unknown[] };
    lignesAllouees._rows.length = numeroLigneFooter;
  }

  private declencherTelechargement(buffer: ExcelJS.Buffer, nomFichier: string): void {
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    const url = URL.createObjectURL(blob);
    const lien = document.createElement('a');

    lien.href = url;
    lien.download = nomFichier;
    lien.style.display = 'none';

    document.body.appendChild(lien);
    lien.click();
    document.body.removeChild(lien);

    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  private formaterDateLongue(date: Date): string {
    return new Intl.DateTimeFormat('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(date);
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
}
