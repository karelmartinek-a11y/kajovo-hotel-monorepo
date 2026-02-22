import React from 'react';
import '../tokens.css';
import { KajovoSign } from './KajovoSign';
import { ModuleNavigation } from '../navigation/ModuleNavigation';
import type { NavModule, NavigationRules, NavigationSection } from '../types/navigation';

type AppShellProps = {
  children: React.ReactNode;
  isPopup?: boolean;
  panelLayout?: 'admin' | 'portal';
  modules: NavModule[];
  navigationRules: NavigationRules;
  navigationSections?: NavigationSection[];
  currentPath: string;
};

export function AppShell({
  children,
  isPopup,
  panelLayout = 'portal',
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
      {!isPopup ? <KajovoSign /> : null}
    </div>
  );
}
