import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';

export interface FonctionComite {
  IdFonction: number;
  Libelle: string;
  OrdreAffichage: number | null;
}

export interface AffectationComite {
  IdContactFonction: number;
  IdContact: number;
  IdFonction: number;
  DateDebut: string | null;
  Contact: {
    IdContact: number;
    NomUsage: string | null;
    NomdeNaissance: string | null;
    Prenom: string | null;
    DateNaissance: string | null;
    NbDonsAvant2013: number | null;
  };
  Fonction: FonctionComite;
}

@Injectable({
  providedIn: 'root',
})
export class SupabaseService {
  private supabase: SupabaseClient;

  constructor() {
    this.supabase = createClient(environment.supabaseUrl, environment.supabaseKey);
  }

  get client(): SupabaseClient {
    return this.supabase;
  }

  async getFonctionsComite(): Promise<FonctionComite[]> {
    const { data, error } = await this.supabase
      .from('t_Fonctions')
      .select('IdFonction, Libelle, OrdreAffichage')
      .eq('Actif', true)
      .order('OrdreAffichage', { ascending: true })
      .order('IdFonction', { ascending: true });

    if (error) {
      throw error;
    }

    return (data ?? []) as FonctionComite[];
  }

  async getAffectationsComiteActuelles(): Promise<AffectationComite[]> {
    const { data, error } = await this.supabase
      .from('t_ContactsFonctions')
      .select(
        `
          IdContactFonction,
          IdContact,
          IdFonction,
          "DateDébut",
          Contact:t_Contacts!t_ContactsFonctions_IdContact_fkey (
            IdContact,
            NomUsage,
            NomdeNaissance,
            Prenom,
            DateNaissance,
            NbDonsAvant2013
          ),
          Fonction:t_Fonctions!t_ContactsFonctions_IdFonction_fkey (
            IdFonction,
            Libelle,
            OrdreAffichage
          )
        `,
      )
      .is('DateFin', null);

    if (error) {
      throw error;
    }

    const lignes = (data ?? []) as unknown as Array<
      Omit<AffectationComite, 'DateDebut'> & { DateDébut: string | null }
    >;
    const affectations = lignes.map((ligne) => ({
      IdContactFonction: ligne.IdContactFonction,
      IdContact: ligne.IdContact,
      IdFonction: ligne.IdFonction,
      DateDebut: ligne['DateDébut'],
      Contact: ligne.Contact,
      Fonction: ligne.Fonction,
    }));

    return affectations.sort((a, b) => {
      const ordre =
        (a.Fonction?.OrdreAffichage ?? Number.MAX_SAFE_INTEGER) -
        (b.Fonction?.OrdreAffichage ?? Number.MAX_SAFE_INTEGER);

      if (ordre !== 0) {
        return ordre;
      }

      return this.nomComplet(a.Contact).localeCompare(this.nomComplet(b.Contact), 'fr');
    });
  }

  async ajouterMembreComite(
    idContact: number,
    idFonction: number,
    dateDebut: string,
  ): Promise<number> {
    const { data, error } = await this.supabase.rpc('ajouter_membre_comite', {
      p_id_contact: idContact,
      p_id_fonction: idFonction,
      p_date_debut: dateDebut,
    });

    if (error) {
      throw error;
    }

    return data as number;
  }

  async ajouterFonctionComite(
    idContact: number,
    idFonction: number,
    dateDebut: string,
  ): Promise<number> {
    const { data, error } = await this.supabase.rpc('ajouter_fonction_comite', {
      p_id_contact: idContact,
      p_id_fonction: idFonction,
      p_date_debut: dateDebut,
    });

    if (error) {
      throw error;
    }

    return data as number;
  }

  async modifierFonctionComite(
    idContactFonction: number,
    idFonction: number,
    dateEffet: string,
  ): Promise<number> {
    const { data, error } = await this.supabase.rpc('modifier_fonction_comite', {
      p_id_contact_fonction: idContactFonction,
      p_id_fonction: idFonction,
      p_date_effet: dateEffet,
    });

    if (error) {
      throw error;
    }

    return data as number;
  }

  async enleverFonctionComite(idContactFonction: number, dateFin: string): Promise<void> {
    const { data, error } = await this.supabase
      .from('t_ContactsFonctions')
      .update({ DateFin: dateFin })
      .eq('IdContactFonction', idContactFonction)
      .is('DateFin', null)
      .select('IdContactFonction')
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      throw new Error('La fonction sélectionnée n’est plus active. Actualisez le tableau.');
    }
  }

  async enleverMembreComite(idContact: number, dateFin: string): Promise<number> {
    const { data, error } = await this.supabase.rpc('enlever_membre_comite', {
      p_id_contact: idContact,
      p_date_fin: dateFin,
    });

    if (error) {
      throw error;
    }

    return data as number;
  }

  private nomComplet(contact: AffectationComite['Contact']): string {
    return [contact.NomUsage || contact.NomdeNaissance, contact.Prenom]
      .filter((valeur) => valeur !== null && valeur !== '')
      .join(' ');
  }

  async getLogins(): Promise<string[]> {
    const { data, error } = await this.supabase.functions.invoke('liste-login');

    if (error) {
      throw error;
    }

    return data.logins;
  }

  async gererUtilisateurs<TResponse>(requete: Record<string, unknown>): Promise<TResponse> {
    const { data, error } = await this.supabase.functions.invoke('gestion-users', {
      body: requete,
    });

    if (error) {
      throw error;
    }

    return data as TResponse;
  }

  async testerLectureContacts(): Promise<number> {
    const { data, error } = await this.supabase.from('t_Contacts').select('IdContact');

    if (error) {
      throw error;
    }

    return data.length;
  }

  async seDeconnecter(): Promise<void> {
    const { error } = await this.supabase.auth.signOut();

    if (error) {
      throw error;
    }
  }

  async getCollectes() {
    const { data, error } = await this.supabase.from('t_Collectes').select('*');

    if (error) {
      throw error;
    }

    return data
      .map((ligne) => ({
        IdCollecte: ligne.IdCollecte,
        annee: ligne['AnnéeCollecte'],
        NumCollecte: ligne.NumCollecte,
        DateCollecte: ligne.DateCollecte,
      }))
      .sort((a, b) => {
        if (a.annee !== b.annee) {
          return b.annee - a.annee;
        }

        return b.NumCollecte - a.NumCollecte;
      });
  }

  async getDons(IdContact: number) {
    const { data, error } = await this.supabase
      .from('t_Dons')
      .select('IdDon, IdDonneur, "AnnéeDon", NumCollecte, DateDon, IdSourceDon')
      .eq('IdDonneur', IdContact)
      .order('DateDon', { ascending: false });

    if (error) {
      throw error;
    }

    return data.map((ligne) => ({
      IdDon: ligne.IdDon,
      IdDonneur: ligne.IdDonneur,
      annee: ligne['AnnéeDon'],
      NumCollecte: ligne.NumCollecte,
      DateDon: ligne.DateDon,
      IdSourceDon: ligne.IdSourceDon,
    }));
  }

  async getAdhesions(IdContact: number) {
    const { data, error } = await this.supabase
      .from('t_Adhesions')
      .select('IdAdhesion, IdContact, "Année", DateAdhesion, Cotisation, Statut')
      .eq('IdContact', IdContact)
      .order('Année', { ascending: true });

    if (error) {
      throw error;
    }

    return data.map((ligne) => ({
      IdAdhesion: ligne.IdAdhesion,
      IdContact: ligne.IdContact,
      annee: ligne['Année'],
      DateAdhesion: ligne.DateAdhesion,
      Cotisation: ligne.Cotisation,
      Statut: ligne.Statut,
    }));
  }

  async getNbAdherents(annee: number): Promise<number> {
    const { data, error } = await this.supabase
      .from('t_Adhesions')
      .select('IdContact')
      .eq('Année', annee);

    if (error) {
      throw error;
    }

    return new Set(data.map((ligne) => ligne.IdContact)).size;
  }

  async ajouterAdhesion(IdContact: number, annee: number) {
    const aujourdHui = new Date();

    const DateAdhesion = `${aujourdHui.getFullYear()}-${String(aujourdHui.getMonth() + 1).padStart(2, '0')}-${String(aujourdHui.getDate()).padStart(2, '0')}`;

    const { data, error } = await this.supabase
      .from('t_Adhesions')
      .insert({
        IdContact: IdContact,
        Année: annee,
        DateAdhesion: DateAdhesion,
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    return data;
  }

  async supprimerAdhesion(IdAdhesion: number): Promise<void> {
    const { error } = await this.supabase.from('t_Adhesions').delete().eq('IdAdhesion', IdAdhesion);

    if (error) {
      throw error;
    }
  }

  async ajouterDon(IdContact: number, annee: number, NumCollecte: number, DateDon: string) {
    const { data, error } = await this.supabase
      .from('t_Dons')
      .insert({
        IdDonneur: IdContact,
        AnnéeDon: annee,
        NumCollecte: NumCollecte,
        DateDon: DateDon,
        IdSourceDon: 2,
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    return data;
  }

  async supprimerDon(IdDon: number): Promise<void> {
    const { error } = await this.supabase.from('t_Dons').delete().eq('IdDon', IdDon);

    if (error) {
      throw error;
    }
  }
}
