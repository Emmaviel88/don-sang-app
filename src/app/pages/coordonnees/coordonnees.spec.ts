import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Coordonnees } from './coordonnees';

describe('Coordonnees', () => {
  let component: Coordonnees;
  let fixture: ComponentFixture<Coordonnees>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Coordonnees],
    }).compileComponents();

    fixture = TestBed.createComponent(Coordonnees);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
