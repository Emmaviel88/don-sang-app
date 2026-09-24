import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class SupabaseService {

  private supabase: SupabaseClient;

  constructor() {
    this.supabase = createClient(
      environment.supabaseUrl,
      environment.supabaseKey
    );
  }

  get client(): SupabaseClient {
    return this.supabase;
  }

  async getLogins(): Promise<string[]> {
    const { data, error } = await this.supabase.functions.invoke('liste-login');

    if (error) {
      throw error;
    }

    return data.logins;
  }

  async testerLectureContacts(): Promise<number> {
    const { data, error } = await this.supabase
      .from('t_Contacts')
      .select('IdContact');

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
    const { data, error } = await this.supabase
      .from('t_Collectes')
      .select('*');

    if (error) {
      throw error;
    }

    return data
      .map(ligne => ({
        IdCollecte: ligne.IdCollecte,
        annee: ligne['AnnéeCollecte'],
        NumCollecte: ligne.NumCollecte,
        DateCollecte: ligne.DateCollecte
      }))
      .sort((a, b) => {
        if (a.annee !== b.annee) {
          return b.annee - a.annee;
        }

        return b.NumCollecte - a.NumCollecte;
      });
  }
}