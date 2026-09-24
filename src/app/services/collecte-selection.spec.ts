import { TestBed } from '@angular/core/testing';
import { CollecteSelection } from '../collecte-selection';

describe('CollecteSelection', () => {
  let service: CollecteSelection;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(CollecteSelection);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
