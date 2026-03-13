import React from 'react';
import '../tokens.css';
import { KajovoSign } from './KajovoSign';
import { KajovoWordmark } from './KajovoWordmark';
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
  headerLeadingControls?: React.ReactNode;
  headerControls?: React.ReactNode;
};

const MAIN_TARGET_ID = 'main-content';

export function AppShell({
  children,
  isPopup,
  panelLayout = 'admin',
  modules,
  navigationRules,
  navigationSections,
  currentPath,
  brandHref,
  headerLeadingControls,
  headerControls,
}: AppShellProps): JSX.Element {
  const wordmarkHref = brandHref ?? (panelLayout === 'admin' ? '/admin/' : '/');
  const signHref = wordmarkHref;
  const wordmarkVariant = panelLayout === 'admin' ? 'admin' : 'portal';
  const isIntroView = currentPath === '/intro' || currentPath.endsWith('/intro');

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
        <a className="k-skip-link" href={`#${MAIN_TARGET_ID}`} onClick={handleSkipToContent}>
          Přeskočit na obsah
        </a>
        {headerLeadingControls ? <div className="k-shell-header-leading">{headerLeadingControls}</div> : null}
        <div className="k-shell-inner k-shell-header">
          {!isIntroView ? <KajovoWordmark href={wordmarkHref} variant={wordmarkVariant} /> : null}
          <ModuleNavigation
            modules={modules}
            rules={navigationRules}
            sections={navigationSections}
            currentPath={currentPath}
          />
          {headerControls ? <div className="k-shell-header-controls">{headerControls}</div> : null}
        </div>
      </header>
      {children}
      {!isPopup ? <KajovoSign href={signHref} /> : null}
    </div>
  );
}
