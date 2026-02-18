import React from 'react';
import type { NavModule, NavigationRules, NavigationSection } from '../types/navigation';

type Props = {
  modules: NavModule[];
  rules: NavigationRules;
  currentPath: string;
  sections?: NavigationSection[];
};

type GroupedModules = {
  key: string;
  label: string;
  items: NavModule[];
  order: number;
};

function normalize(input: string): string {
  return input
    .toLocaleLowerCase('cs-CZ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function ModuleNavigation({ modules, rules, currentPath, sections = [] }: Props): JSX.Element {
  const active = React.useMemo(() => modules.filter((module) => module.active), [modules]);
  const desktopLimit = Math.max(1, rules.maxTopLevelItemsDesktop);
  const tabletLimit = Math.max(1, rules.maxTopLevelItemsTablet ?? Math.max(1, desktopLimit - 2));

  const [overflowOpen, setOverflowOpen] = React.useState(false);
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const [isPhone, setIsPhone] = React.useState(false);
  const [isTablet, setIsTablet] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }

    const phoneQuery = window.matchMedia('(max-width: 767px)');
    const tabletQuery = window.matchMedia('(min-width: 768px) and (max-width: 1024px)');

    const sync = (): void => {
      setIsPhone(phoneQuery.matches);
      setIsTablet(tabletQuery.matches);
    };

    sync();
    phoneQuery.addEventListener('change', sync);
    tabletQuery.addEventListener('change', sync);

    return () => {
      phoneQuery.removeEventListener('change', sync);
      tabletQuery.removeEventListener('change', sync);
    };
  }, []);

  React.useEffect(() => {
    setOverflowOpen(false);
    setDrawerOpen(false);
    setSearch('');
  }, [currentPath]);

  const maxVisibleItems = isPhone ? 0 : isTablet ? tabletLimit : desktopLimit;
  const visibleItems = active.slice(0, maxVisibleItems);
  const overflow = active.slice(maxVisibleItems);

  const sectionMap = React.useMemo(() => new Map(sections.map((section) => [section.key, section])), [sections]);

  const grouped = React.useMemo(() => {
    if (!rules.grouping) {
      return [{ key: 'all', label: '', items: visibleItems, order: 0 }];
    }

    const bySection = new Map<string, GroupedModules>();
    const fallbackSectionKey = 'default';

    for (const module of visibleItems) {
      const sectionKey = module.section ?? fallbackSectionKey;
      const section = sectionMap.get(sectionKey);
      const label = section?.label ?? (sectionKey === 'default' ? 'Ostatní' : sectionKey);
      const order = section?.order ?? Number.MAX_SAFE_INTEGER;
      const existing = bySection.get(sectionKey);

      if (existing) {
        existing.items.push(module);
      } else {
        bySection.set(sectionKey, {
          key: sectionKey,
          label,
          items: [module],
          order,
        });
      }
    }

    return Array.from(bySection.values()).sort((a, b) => {
      if (a.order !== b.order) {
        return a.order - b.order;
      }
      return a.label.localeCompare(b.label, 'cs-CZ');
    });
  }, [rules.grouping, sectionMap, visibleItems]);

  const searchableItems = React.useMemo(() => {
    if (!rules.enableSearchInMenuOnPhone || !search.trim()) {
      return active;
    }

    const needle = normalize(search.trim());
    return active.filter((module) => normalize(module.label).includes(needle));
  }, [active, rules.enableSearchInMenuOnPhone, search]);

  return (
    <nav aria-label="Hlavní navigace" className="k-nav" data-testid="module-navigation">
      <div className="k-nav-desktop" data-testid="module-navigation-desktop">
        <div className="k-nav-row">
          {grouped.map((group) => (
            <React.Fragment key={group.key}>
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
              <button
                className="k-button secondary"
                type="button"
                aria-haspopup="menu"
                aria-expanded={overflowOpen}
                onClick={() => setOverflowOpen((v) => !v)}
              >
                {rules.overflowLabel}
              </button>
              {overflowOpen ? (
                <div className="k-nav-overflow-menu" role="menu" aria-label={rules.overflowLabel}>
                  {overflow.map((module) => (
                    <a className="k-nav-overflow-item" href={module.route} key={module.key} role="menuitem">
                      {module.label}
                    </a>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className="k-nav-phone" data-testid="module-navigation-phone">
        <button
          className="k-button secondary"
          type="button"
          aria-expanded={drawerOpen}
          aria-controls="k-nav-drawer"
          onClick={() => setDrawerOpen((v) => !v)}
        >
          {rules.phoneDrawerLabel ?? 'Menu'}
        </button>
        {drawerOpen ? (
          <div className="k-nav-drawer" id="k-nav-drawer" role="dialog" aria-label="Navigace">
            {rules.enableSearchInMenuOnPhone ? (
              <label className="k-nav-drawer-search">
                <span className="k-nav-sr-only">Hledat modul</span>
                <input
                  className="k-input"
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={rules.phoneSearchPlaceholder ?? 'Hledat v menu'}
                />
              </label>
            ) : null}
            <div className="k-nav-drawer-list" role="menu" aria-label="Moduly">
              {searchableItems.map((module) => (
                <a className="k-nav-overflow-item" href={module.route} key={module.key} role="menuitem">
                  {module.label}
                </a>
              ))}
              {searchableItems.length === 0 ? <p className="k-nav-empty">Žádné výsledky.</p> : null}
            </div>
          </div>
        ) : null}
      </div>
    </nav>
  );
}
