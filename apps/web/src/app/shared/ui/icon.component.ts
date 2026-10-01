import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type IconName =
  | 'home'
  | 'plus'
  | 'send'
  | 'list'
  | 'logout'
  | 'copy'
  | 'check'
  | 'arrow-down'
  | 'arrow-up'
  | 'search'
  | 'wallet';

/** Minimal inline SVG icon set (stroke icons, inherit currentColor). */
@Component({
  selector: 'app-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true', style: 'display:inline-flex' },
  template: `
    <svg
      [attr.width]="size()"
      [attr.height]="size()"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      @switch (name()) {
        @case ('home') {
          <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />
        }
        @case ('plus') {
          <path d="M12 5v14M5 12h14" />
        }
        @case ('send') {
          <path d="M22 2 11 13M22 2l-7 20-4-9-9-4z" />
        }
        @case ('list') {
          <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
        }
        @case ('logout') {
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
        }
        @case ('copy') {
          <rect x="9" y="9" width="13" height="13" rx="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        }
        @case ('check') {
          <path d="M20 6 9 17l-5-5" />
        }
        @case ('arrow-down') {
          <path d="M12 5v14M19 12l-7 7-7-7" />
        }
        @case ('arrow-up') {
          <path d="M12 19V5M5 12l7-7 7 7" />
        }
        @case ('search') {
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4.3-4.3" />
        }
        @case ('wallet') {
          <path
            d="M20 7V5a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H5a2 2 0 0 1-2-2V6"
          />
          <path d="M17 13h.01" />
        }
      }
    </svg>
  `,
})
export class IconComponent {
  readonly name = input.required<IconName>();
  readonly size = input(20);
}
