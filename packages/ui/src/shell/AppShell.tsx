import React from 'react';
import { Link } from 'react-router-dom';
import { t } from '@kajovo/shared';
import '../tokens.css';
import { KajovoWordmark } from './KajovoWordmark';
import { Icon } from '../components/Icon';
import type { PanelLayout } from './panelLayout';
import { ModuleNavigation } from '../navigation/ModuleNavigation';
import type { NavModule, NavigationRules, NavigationSection } from '../types/navigation';

type AppShellProps = {
  children: React.ReactNode;
  isPopup?: boolean;
  modules: NavModule[];
  navigationRules: NavigationRules;
  navigationSections?: NavigationSection[];
  currentPath: string;
  panelLayout?: PanelLayout;
  brandHref?: string;
  headerControls?: React.ReactNode;
  profileLabel?: string;
  portalTabs?: React.ReactNode;
};

const MAIN_TARGET_ID = 'main-content';

export function AppShell({
  children,
  panelLayout = 'admin',
  modules,
  navigationRules,
  navigationSections,
  currentPath,
  brandHref,
  headerControls,
  profileLabel,
  portalTabs,
}: AppShellProps): JSX.Element {
  const wordmarkHref = brandHref ?? (panelLayout === 'admin' ? '/admin/' : '/');
  const wordmarkVariant = panelLayout === 'admin' ? 'admin' : 'portal';
  const isIntroView = currentPath === '/intro' || currentPath.endsWith('/intro');
  const portalModules = modules.filter((module) => module.active && module.key !== 'profile');

  React.useEffect(() => {
    const main =
      document.querySelector<HTMLElement>(`#${MAIN_TARGET_ID}`) ??
      document.querySelector<HTMLElement>('main, [role="main"]');
    if (main && main.id === '') {
      main.id = MAIN_TARGET_ID;
    }
  }, [currentPath]);

  const handleSkipToContent = (event: React.MouseEvent<HTMLAnchorElement>): void => {
    const target =
      document.getElementById(MAIN_TARGET_ID) ??
      document.querySelector<HTMLElement>('main, [role="main"]');
    if (!target) {
      return;
    }
    event.preventDefault();
    if (!target.hasAttribute('tabindex')) {
      target.setAttribute('tabindex', '-1');
    }
    target.focus({ preventScroll: true });
    const reducedMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    target.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
  };

  return (
    <div className="k-app-shell" data-panel-layout={panelLayout}>
      <header className="k-app-header">
        <div className="k-app-header__ribbon">
          <div className="k-shell-inner k-app-header__ribbon-inner">
            <span className="k-app-header__ribbon-item">
              <Icon name="briefcase" className="k-app-header__ribbon-icon" />
              <span>{panelLayout === 'admin' ? t('Administrace hotelu') : t('Provozní portál hotelu')}</span>
            </span>
            <span className="k-app-header__ribbon-item">
              <Icon name="tool" className="k-app-header__ribbon-icon" />
              <span>{t("Navigace podle aktuální role")}</span>
            </span>
          </div>
        </div>
        <a className="k-skip-link" href={`#${MAIN_TARGET_ID}`} onClick={handleSkipToContent}>{t("Přeskočit na obsah")}{' '}</a>
        <div className="k-shell-inner k-shell-header">
          {!isIntroView ? <KajovoWordmark href={wordmarkHref} variant={wordmarkVariant} /> : null}
          {panelLayout === 'admin' ? <ModuleNavigation
            modules={portalModules}
            rules={navigationRules}
            sections={navigationSections}
            currentPath={currentPath}
          /> : null}
          {panelLayout === 'admin' ? <Link className="k-shell-profile-link" to="/profil" aria-current={currentPath === '/profil' ? 'page' : undefined}>
            <Icon name="users" className="k-nav-link__icon" />
            <span>{profileLabel ?? t('Profil')}</span>
          </Link> : null}
          {headerControls ? <div className="k-shell-header-controls">{headerControls}</div> : null}
        </div>
      </header>
      {panelLayout === 'portal' ? <nav className="k-portal-mobile-tabs" aria-label={navigationRules.ariaLabel ?? t('Hlavní navigace')} data-testid="portal-mobile-tabs">{portalTabs}</nav> : null}
      {children}
    </div>
  );
}
