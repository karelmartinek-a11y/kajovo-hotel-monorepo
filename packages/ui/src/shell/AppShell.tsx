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
      {!isPopup ? <KajovoMascot /> : null}
      {!isPopup ? <KajovoSign /> : null}
    </div>
  );
}
