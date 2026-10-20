import { DOCUMENT } from '@angular/common';
import { Injectable, computed, inject, signal } from '@angular/core';

export type Theme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'theme';
const META_COLORS: Record<Theme, string> = { light: '#4f46e5', dark: '#0b1120' };

/**
 * Tema claro/oscuro. Respeta `prefers-color-scheme` hasta que la persona elige
 * uno, y entonces lo guarda en localStorage. El script en línea de index.html
 * aplica el mismo valor antes del primer pintado para evitar el destello.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly doc = inject(DOCUMENT);
  private readonly win = this.doc.defaultView;
  private readonly media = this.win?.matchMedia?.('(prefers-color-scheme: dark)') ?? null;

  readonly theme = signal<Theme>(this.initial());
  readonly isDark = computed(() => this.theme() === 'dark');

  constructor() {
    this.apply(this.theme());
    this.media?.addEventListener?.('change', (e) => {
      if (this.stored() === null) this.set(e.matches ? 'dark' : 'light', false);
    });
    this.win?.addEventListener('storage', (e) => {
      if (e.key === THEME_STORAGE_KEY && (e.newValue === 'light' || e.newValue === 'dark')) {
        this.set(e.newValue, false);
      }
    });
  }

  toggle(): void {
    this.set(this.isDark() ? 'light' : 'dark', true);
  }

  set(theme: Theme, persist = true): void {
    this.theme.set(theme);
    this.apply(theme);
    if (persist) {
      try {
        this.win?.localStorage.setItem(THEME_STORAGE_KEY, theme);
      } catch {
        /* almacenamiento no disponible */
      }
    }
  }

  private stored(): Theme | null {
    try {
      const v = this.win?.localStorage.getItem(THEME_STORAGE_KEY);
      return v === 'light' || v === 'dark' ? v : null;
    } catch {
      return null;
    }
  }

  private initial(): Theme {
    return this.stored() ?? (this.media?.matches ? 'dark' : 'light');
  }

  private apply(theme: Theme): void {
    const root = this.doc.documentElement;
    root.dataset['theme'] = theme;
    root.style.colorScheme = theme;
    this.doc.querySelector('meta[name="theme-color"]')?.setAttribute('content', META_COLORS[theme]);
  }
}
