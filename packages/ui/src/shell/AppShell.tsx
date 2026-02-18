import React from 'react';
import '../tokens.css';
import { KajovoSign } from './KajovoSign';
import { ModuleNavigation } from '../navigation/ModuleNavigation';
import type { NavModule, NavigationRules } from '../types/navigation';

type AppShellProps = {
  children: React.ReactNode;
  isPopup?: boolean;
  modules: NavModule[];
  navigationRules: NavigationRules;
  currentPath: string;
};

export function AppShell({ children, isPopup, modules, navigationRules, currentPath }: AppShellProps): JSX.Element {
  return (
    <div className="k-app-shell">
      <header className="k-app-header">
        <div className="k-shell-inner">
          <ModuleNavigation modules={modules} rules={navigationRules} currentPath={currentPath} />
        </div>
      </header>
      {children}
      {!isPopup ? <KajovoSign /> : null}
    </div>
  );
}
