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
  showFigure?: boolean;
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
}: AppShellProps): JSX.Element {
  const wordmarkHref = brandHref ?? (panelLayout === 'admin' ? '/admin/' : '/');
  const wordmarkVariant = panelLayout === 'admin' ? 'admin' : 'portal';

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
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="k-app-shell" data-panel-layout={panelLayout}>
      <header className="k-app-header">
        <a className="k-skip-link" href={`#${MAIN_TARGET_ID}`} onClick={handleSkipToContent}>
          Přeskočit na obsah
        </a>
        <div className="k-shell-inner k-shell-header">
          <KajovoWordmark href={wordmarkHref} variant={wordmarkVariant} />
          <ModuleNavigation
            modules={modules}
            rules={navigationRules}
            sections={navigationSections}
            currentPath={currentPath}
          />
        </div>
      </header>
      {children}
      {!isPopup ? <KajovoSign /> : null}
    </div>
  );
}
