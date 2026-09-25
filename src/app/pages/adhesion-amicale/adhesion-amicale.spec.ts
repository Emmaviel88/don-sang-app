import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AdhesionAmicale } from './adhesion-amicale';

describe('AdhesionAmicale', () => {
  let component: AdhesionAmicale;
  let fixture: ComponentFixture<AdhesionAmicale>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdhesionAmicale],
    }).compileComponents();

    fixture = TestBed.createComponent(AdhesionAmicale);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
