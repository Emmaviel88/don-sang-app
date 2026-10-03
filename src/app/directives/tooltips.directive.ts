import { Directive, ElementRef, Input, OnDestroy, OnInit } from '@angular/core';

// Déclare l'objet Bootstrap global
declare var bootstrap: any;

@Directive({
  selector: '[appTooltip]',
  standalone: true,
})
export class TooltipDirective implements OnInit, OnDestroy {
  @Input('appTooltip') title: string = '';
  @Input() placement: 'top' | 'bottom' | 'left' | 'right' = 'bottom';

  private tooltipInstance: any;

  constructor(private el: ElementRef) {}

  ngOnInit(): void {
    // Initialise le tooltip Bootstrap sur l'élément actuel
    if (typeof bootstrap !== 'undefined' && this.title) {
      this.tooltipInstance = new bootstrap.Tooltip(this.el.nativeElement, {
        title: this.title,
        placement: this.placement,
        container: 'body',
        trigger: 'hover',
      });
    }
  }

  ngOnDestroy(): void {
    // Détruit proprement le tooltip si l'élément HTML est retiré (ex: déconnexion de l'admin)
    if (this.tooltipInstance) {
      this.tooltipInstance.dispose();
    }
  }
}
