import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Comite } from './comite';

describe('Comite', () => {
  let component: Comite;
  let fixture: ComponentFixture<Comite>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Comite],
    }).compileComponents();

    fixture = TestBed.createComponent(Comite);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
