import React from 'react';
import '../tokens.css';
import { KajovoSign } from './KajovoSign';
import { ModuleNavigation } from '../navigation/ModuleNavigation';
import type { NavModule, NavigationRules, NavigationSection } from '../types/navigation';

type AppShellProps = {
  children: React.ReactNode;
  isPopup?: boolean;
  modules: NavModule[];
  navigationRules: NavigationRules;
  navigationSections?: NavigationSection[];
  currentPath: string;
};

export function AppShell({
  children,
  isPopup,
  modules,
  navigationRules,
  navigationSections,
  currentPath,
}: AppShellProps): JSX.Element {
  return (
    <div className="k-app-shell">
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
