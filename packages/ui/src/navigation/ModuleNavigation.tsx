import React from 'react';
import type { NavModule, NavigationRules } from '../types/navigation';

type Props = {
  modules: NavModule[];
  rules: NavigationRules;
  currentPath: string;
};

export function ModuleNavigation({ modules, rules, currentPath }: Props): JSX.Element {
  const active = modules.filter((module) => module.active);
  const topLevel = active.slice(0, rules.maxTopLevelItemsDesktop);
  const overflow = active.slice(rules.maxTopLevelItemsDesktop);
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    setOpen(false);
  }, [currentPath]);

  const grouped = rules.grouping
    ? [
        { label: 'Provoz', items: topLevel.filter((module) => module.key !== 'dashboard') },
        { label: 'Přehled', items: topLevel.filter((module) => module.key === 'dashboard') },
      ]
    : [{ label: '', items: topLevel }];

  return (
    <nav aria-label="Hlavní navigace" className="k-nav-row">
      {grouped.map((group) => (
        <React.Fragment key={group.label || 'all'}>
          {group.label ? <span className="k-nav-group-label">{group.label}</span> : null}
          {group.items.map((module) => (
            <a
              key={module.key}
              className="k-nav-link"
              href={module.route}
              aria-current={currentPath === module.route ? 'page' : undefined}
            >
              {module.label}
            </a>
          ))}
        </React.Fragment>
      ))}
      {overflow.length > 0 ? (
        <div className="k-nav-overflow">
          <button className="k-button secondary" type="button" onClick={() => setOpen((v) => !v)}>
            {rules.overflowLabel}
          </button>
          {open ? (
            <div className="k-nav-overflow-menu" role="menu">
              {overflow.map((module) => (
                <a className="k-nav-overflow-item" href={module.route} key={module.key}>
                  {module.label}
                </a>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </nav>
  );
}
