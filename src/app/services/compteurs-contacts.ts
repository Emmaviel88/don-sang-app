import { Injectable, signal } from '@angular/core';
import { SupabaseService } from './supabase';

@Injectable({
  providedIn: 'root',
})
export class CompteursContactsService {
  readonly total = signal<number | null>(null);
  readonly actifs = signal<number | null>(null);

  constructor(private supabase: SupabaseService) {}

  async rafraichir(): Promise<void> {
    const [total, actifs] = await Promise.all([
      this.supabase.client.from('t_Contacts').select('*', { count: 'exact', head: true }),
      this.supabase.client
        .from('t_Contacts')
        .select('*', { count: 'exact', head: true })
        .eq('Actif', true),
    ]);

    if (total.error || actifs.error) {
      console.error('ERREUR COMPTAGE CONTACTS :', total.error ?? actifs.error);
      return;
    }

    this.total.set(total.count);
    this.actifs.set(actifs.count);
  }
}
