import { TestBed } from '@angular/core/testing';
import { DonneurSelection } from './donneur-selection';

describe('DonneurSelection', () => {
  let service: DonneurSelection;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(DonneurSelection);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
