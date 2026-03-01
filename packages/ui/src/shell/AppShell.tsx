import React from 'react';
import '../tokens.css';
import { KajovoSign } from './KajovoSign';
import { KajovoMascot } from './KajovoMascot';
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
};

export function AppShell({
  children,
  isPopup,
  panelLayout = 'admin',
  modules,
  navigationRules,
  navigationSections,
  currentPath,
}: AppShellProps): JSX.Element {
  const figureByRoute: Array<{ match: RegExp; src: string; alt: string }> = [
    { match: /^\/sklad(?:\/|$)/, src: '/brand/panel/menu_pokojská_sklad.png', alt: 'Kája pro skladové hospodářství' },
    { match: /^\/zavady(?:\/|$)/, src: '/brand/panel/menu_údržba.png', alt: 'Kája pro závady a údržbu' },
    { match: /^\/ztraty-a-nalezy(?:\/|$)/, src: '/brand/panel/menu_recepce_nálezy.png', alt: 'Kája pro ztráty a nálezy' },
    { match: /^\/snidane(?:\/|$)/, src: '/brand/panel/menu_recepce_snídaně.png', alt: 'Kája pro snídaňový servis' },
    { match: /^\/uzivatele(?:\/|$)/, src: '/brand/panel/menu_admin.png', alt: 'Kája pro správu uživatelů' },
  ];
  const fallbackFigure = panelLayout === 'admin'
    ? { src: '/brand/panel/menu_admin.png', alt: 'Kája pro administraci' }
    : { src: '/brand/panel/menu_recepční.png', alt: 'Kája pro uživatelský portál' };
  const matched = figureByRoute.find((item) => item.match.test(currentPath));
  const figure = matched ?? fallbackFigure;

  return (
    <div className="k-app-shell" data-panel-layout={panelLayout}>
      <header className="k-app-header">
        <div className="k-shell-inner">
          <ModuleNavigation
            modules={modules}
            rules={navigationRules}
            sections={navigationSections}
            currentPath={currentPath}
          />
        </div>
      </header>
      {children}
      {!isPopup ? (
        <aside className="k-shell-figure" aria-label="Personifikace Kája" data-brand-element="true">
          <img src={figure.src} alt={figure.alt} loading="lazy" />
        </aside>
      ) : null}
      {!isPopup ? <KajovoSign /> : null}
    </div>
  );
}
