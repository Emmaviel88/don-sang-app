import { Directive, HostListener, output } from '@angular/core';

// Éléments sur lesquels un clic ne doit jamais désélectionner la ligne (tableaux, commandes, saisie)
const ELEMENTS_EXCLUS =
  'table, button, a, input, select, textarea, label, option, .btn, [role="button"], app-recherche-contact';

@Directive({
  selector: '[appDeselectionHorsTableau]',
  standalone: true,
})
export class DeselectionHorsTableauDirective {
  readonly deselection = output<void>();

  @HostListener('click', ['$event'])
  surClic(event: MouseEvent): void {
    const cible = event.target as Element | null;

    if (cible && !cible.closest(ELEMENTS_EXCLUS)) {
      this.deselection.emit();
    }
  }
}
