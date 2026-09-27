import { DatePipe } from '@angular/common';
import {
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnDestroy,
  Output,
  ViewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../../services/supabase';
import {
  RechercheContactController,
  ResultatRechercheContact,
} from '../../services/recherche-contact';

@Component({
  selector: 'app-recherche-contact',
  standalone: true,
  imports: [DatePipe, FormsModule],
  templateUrl: './recherche-contact.html',
  styleUrl: './recherche-contact.css',
})
export class RechercheContactComponent implements OnDestroy {
  @Input() inputId = 'rechercheContact';
  @Input() label = 'Recherche';

  @Output() contactSelected = new EventEmitter<ResultatRechercheContact>();
  @Output() searchError = new EventEmitter<unknown>();

  query = '';
  readonly controller: RechercheContactController;
  @ViewChild('searchInput') private searchInput?: ElementRef<HTMLInputElement>;

  constructor(
    supabase: SupabaseService,
    private cdr: ChangeDetectorRef,
  ) {
    this.controller = new RechercheContactController(supabase.client, this.cdr);
  }

  onQueryChange(query: string): void {
    this.query = query;
    this.controller.rechercher(query, (error) => this.searchError.emit(error));
  }

  selectionnerContact(contact: ResultatRechercheContact): void {
    this.controller.annuler();
    this.query = '';
    this.contactSelected.emit(contact);
  }

  clear(): void {
    this.controller.annuler();
    this.query = '';
  }

  focus(): void {
    this.searchInput?.nativeElement.focus();
  }

  ngOnDestroy(): void {
    this.controller.detruire();
  }
}
