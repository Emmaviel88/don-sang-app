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

    const donnees = await this.chargerToutesLesPages((from, to) =>
      this.supabase.client
        .from('t_Adresses')
        .select('IdContact, Adresse1, CodePostal, Commune, EstPrincipale, EstValide')
        .in('IdContact', idsContacts)
        .eq('EstPrincipale', true)
        .eq('EstValide', true)
        .range(from, to),
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

    const donnees = await this.chargerToutesLesPages((from, to) =>
      this.supabase.client
        .from('t_MoyensContact')
        .select('IdContact, IdTypeMoyen, Valeur, EstPrincipal, EstValide')
        .in('IdContact', idsContacts)
        .eq('EstPrincipal', true)
        .eq('EstValide', true)
        .in('IdTypeMoyen', [2, 3])
        .range(from, to),
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

    const donnees = await this.chargerToutesLesPages((from, to) =>
      this.supabase.client
        .from('t_Dons')
        .select('IdDonneur, DateDon')
        .in('IdDonneur', idsContacts)
        .range(from, to),
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
