import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Collectes } from './collectes';

describe('Collectes', () => {
  let component: Collectes;
  let fixture: ComponentFixture<Collectes>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Collectes],
    }).compileComponents();

    fixture = TestBed.createComponent(Collectes);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
