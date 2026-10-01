import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';
import { query, settle, text } from '../../../testing/fixtures';
import { AuthService } from '../../core/auth/auth.service';
import { DEMO_MODE, type DemoMode } from '../../core/demo/demo-mode';
import { DemoBannerComponent } from './demo-banner.component';

describe('DemoBannerComponent', () => {
  const demo: DemoMode = { credentials: [], reset: vi.fn(() => Promise.resolve()) };
  const logout = vi.fn(() => of(undefined));

  function render(provideDemo: boolean, realNotice = false) {
    TestBed.configureTestingModule({
      imports: [DemoBannerComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { logout } },
        ...(provideDemo ? [{ provide: DEMO_MODE, useValue: demo }] : []),
      ],
    });
    const fixture = TestBed.createComponent(DemoBannerComponent);
    fixture.componentRef.setInput('realNotice', realNotice);
    return fixture;
  }

  beforeEach(() => vi.clearAllMocks());

  it('shows "Modo demo · datos simulados" in the demo build', async () => {
    const fixture = render(true);
    await fixture.whenStable();
    expect(text(query(fixture, '[data-testid="demo-banner"]'))).toContain(
      'Modo demo · datos simulados',
    );
  });

  it('shows only the generic notice (or nothing) with the real API', async () => {
    const withNotice = render(false, true);
    await withNotice.whenStable();
    expect(query(withNotice, '[data-testid="demo-banner"]')).toBeNull();
    expect(text(withNotice.nativeElement as HTMLElement)).toBe(
      'Proyecto demo · el dinero es ficticio',
    );
    TestBed.resetTestingModule();
    const without = render(false);
    await without.whenStable();
    expect(text(without.nativeElement as HTMLElement)).toBe('');
  });

  it('"Restablecer demo" asks first, resets, logs out and returns to login', async () => {
    const fixture = render(true);
    await fixture.whenStable();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const confirm = vi
      .spyOn(window, 'confirm')
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    const button = query(fixture, 'button') as HTMLButtonElement;

    button.click();
    await settle(fixture);
    expect(demo.reset).not.toHaveBeenCalled();

    button.click();
    await settle(fixture);
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(demo.reset).toHaveBeenCalledTimes(1);
    expect(logout).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith(['/ingresar'], {
      queryParams: { demo: 'restablecida' },
    });
  });
});
