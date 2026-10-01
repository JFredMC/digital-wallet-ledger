import { ChangeDetectionStrategy, Component, inject, OnInit } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { DemoBannerComponent } from '../../shared/ui/demo-banner.component';
import { IconComponent, type IconName } from '../../shared/ui/icon.component';
import { AuthService } from '../auth/auth.service';
import { WalletStore } from '../state/wallet.store';

interface NavItem {
  path: string;
  label: string;
  icon: IconName;
}

/** Authenticated layout: top bar on desktop, bottom tab bar on mobile. */
@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, IconComponent, DemoBannerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.scss',
})
export class ShellComponent implements OnInit {
  protected readonly auth = inject(AuthService);
  private readonly wallet = inject(WalletStore);

  protected readonly nav: NavItem[] = [
    { path: '/inicio', label: 'Inicio', icon: 'home' },
    { path: '/depositar', label: 'Depositar', icon: 'plus' },
    { path: '/transferir', label: 'Transferir', icon: 'send' },
    { path: '/movimientos', label: 'Movimientos', icon: 'list' },
  ];

  ngOnInit(): void {
    void this.wallet.ensureLoaded();
  }

  protected logout(): void {
    this.auth.logout().subscribe();
  }
}
