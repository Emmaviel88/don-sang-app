import { Injectable, effect, signal } from '@angular/core';

export type ModeTheme = 'light' | 'dark';

const CLE_STOCKAGE = 'donsang-theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly mode = signal<ModeTheme>(this.lireThemeInitial());

  constructor() {
    effect(() => {
      localStorage.setItem(CLE_STOCKAGE, this.mode());
    });
  }

  basculer(): void {
    this.mode.set(this.mode() === 'dark' ? 'light' : 'dark');
  }

  private lireThemeInitial(): ModeTheme {
    const valeur = localStorage.getItem(CLE_STOCKAGE);
    return valeur === 'dark' ? 'dark' : 'light';
  }
}
