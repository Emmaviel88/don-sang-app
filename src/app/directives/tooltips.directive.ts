import {
  Directive,
  ElementRef,
  Input,
  OnDestroy,
  OnInit,
  OnChanges,
  SimpleChanges,
} from '@angular/core';

declare var bootstrap: any;

@Directive({
  selector: '[appTooltip]',
  standalone: true,
})
export class TooltipDirective implements OnInit, OnChanges, OnDestroy {
  @Input('appTooltip') title: string = '';
  @Input() placement: 'top' | 'bottom' | 'left' | 'right' = 'bottom';

  private tooltipInstance: any;

  constructor(private el: ElementRef) {}

  ngOnInit(): void {
    // Supprime l'attribut title natif du navigateur pour éviter le double affichage (bulle claire par défaut)
    this.el.nativeElement.removeAttribute('title');

    // Attend que l'élément soit totalement injecté dans le DOM pour initialiser Bootstrap
    setTimeout(() => {
      if (typeof bootstrap !== 'undefined' && this.title) {
        this.tooltipInstance = new bootstrap.Tooltip(this.el.nativeElement, {
          title: this.title,
          placement: this.placement,
          container: 'body',
          trigger: 'hover',
        });
      }
    }, 50);
  }

  // Écoute les changements dynamiques (ex: bascule du mode sombre/clair sur le bouton de thème)
  ngOnChanges(changes: SimpleChanges): void {
    if (changes['title'] && this.tooltipInstance) {
      const currentTitle = changes['title'].currentValue;

      // Met à jour dynamiquement le contenu de la bulle Bootstrap existante
      this.tooltipInstance.setContent({ '.tooltip-inner': currentTitle });
    }
  }

  ngOnDestroy(): void {
    // Nettoie l'instance de Bootstrap pour éviter les fuites de mémoire
    if (this.tooltipInstance) {
      this.tooltipInstance.dispose();
    }
  }
}
