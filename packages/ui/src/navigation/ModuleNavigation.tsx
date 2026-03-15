import React from 'react';
import { Link } from 'react-router-dom';
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

function mediaMatches(query: string): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  const width = window.innerWidth;
  if (query === '(max-width: 767px)') {
    return width <= 767;
  }
  if (query === '(min-width: 768px) and (max-width: 1024px)') {
    return width >= 768 && width <= 1024;
  }
  if (typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia(query).matches;
}

function normalize(input: string): string {
  return input
    .toLocaleLowerCase('cs-CZ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function focusFirstInteractive(root: HTMLElement | null): void {
  if (!root) {
    return;
  }
  const candidate = root.querySelector<HTMLElement>(
    'input, button, a[href], [tabindex]:not([tabindex="-1"])',
  );
  candidate?.focus();
}

export function ModuleNavigation({ modules, rules, currentPath, sections = [] }: Props): JSX.Element {
  const active = React.useMemo(() => modules.filter((module) => module.active), [modules]);
  const desktopLimit = Math.max(1, rules.maxTopLevelItemsDesktop);
  const tabletLimit = Math.max(1, rules.maxTopLevelItemsTablet ?? Math.max(1, desktopLimit - 2));

  const [overflowOpen, setOverflowOpen] = React.useState(false);
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const [isPhone, setIsPhone] = React.useState(() => mediaMatches('(max-width: 767px)'));
  const [isTablet, setIsTablet] = React.useState(() =>
    mediaMatches('(min-width: 768px) and (max-width: 1024px)'),
  );

  const drawerButtonRef = React.useRef<HTMLButtonElement | null>(null);
  const drawerContainerRef = React.useRef<HTMLDivElement | null>(null);
  const searchInputRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const sync = (): void => {
      const width = window.innerWidth;
      setIsPhone(width <= 767);
      setIsTablet(width >= 768 && width <= 1024);
    };

    sync();
    window.addEventListener('resize', sync);

    return () => {
      window.removeEventListener('resize', sync);
    };
  }, []);

  React.useEffect(() => {
    setOverflowOpen(false);
    setDrawerOpen(false);
    setSearch('');
  }, [currentPath]);

  React.useEffect(() => {
    if (!drawerOpen) {
      return;
    }

    const handler = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setDrawerOpen(false);
      }
    };
    document.addEventListener('keydown', handler);
    const nextFrame = window.requestAnimationFrame(() => {
      if (rules.enableSearchInMenuOnPhone && searchInputRef.current) {
        searchInputRef.current.focus();
      } else {
        focusFirstInteractive(drawerContainerRef.current);
      }
    });

    return () => {
      document.removeEventListener('keydown', handler);
      window.cancelAnimationFrame(nextFrame);
    };
  }, [drawerOpen, rules.enableSearchInMenuOnPhone]);

  React.useEffect(() => {
    if (!drawerOpen && drawerButtonRef.current) {
      drawerButtonRef.current.focus();
    }
  }, [drawerOpen]);

  const width = typeof window !== 'undefined' ? window.innerWidth : null;
  const maxVisibleItems =
    width !== null
      ? width <= 767
        ? 0
        : width <= 1024
          ? tabletLimit
          : desktopLimit
      : isPhone
        ? 0
        : isTablet
          ? tabletLimit
          : desktopLimit;
  const visibleItems = active.slice(0, maxVisibleItems);
  const overflow = active.slice(maxVisibleItems);

  const sectionMap = React.useMemo(() => new Map(sections.map((section) => [section.key, section])), [sections]);

  const grouped = React.useMemo(() => {
    if (!rules.grouping) {
      return [{ key: 'all', label: '', items: visibleItems, order: 0 }];
    }

    const bySection = new Map<string, GroupedModules>();
    const defaultSectionKey = 'default';
    const defaultLabel = rules.defaultGroupLabel ?? 'Ostatní';

    for (const module of visibleItems) {
      const sectionKey = module.section ?? defaultSectionKey;
      const section = sectionMap.get(sectionKey);
      const label = section?.label ?? (sectionKey === defaultSectionKey ? defaultLabel : sectionKey);
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

  const handleOverflowKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      setOverflowOpen(false);
      const button = event.currentTarget.closest('.k-nav-overflow')?.querySelector<HTMLButtonElement>('button');
      button?.focus();
    }
  };

  return (
    <nav
      role="navigation"
      aria-label={rules.ariaLabel ?? 'Hlavní navigace'}
      className="k-nav"
      data-testid="module-navigation"
    >
      <div className="k-nav-desktop" data-testid="module-navigation-desktop">
        <div className="k-nav-row">
          {grouped.map((group) => (
            <React.Fragment key={group.key}>
              {group.label ? <span className="k-nav-group-label">{group.label}</span> : null}
              {group.items.map((module) => (
                <Link
                  key={module.key}
                  className="k-nav-link"
                  to={module.route}
                  aria-current={currentPath === module.route ? 'page' : undefined}
                  onClick={() => setOverflowOpen(false)}
                >
                  {module.label}
                </Link>
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
                onClick={() => setOverflowOpen((value) => !value)}
              >
                {rules.overflowLabel}
              </button>
              {overflowOpen ? (
                <div
                  className="k-nav-overflow-menu"
                  role="menu"
                  aria-label={rules.overflowLabel}
                  onKeyDown={handleOverflowKeyDown}
                >
                  {overflow.map((module) => (
                    <Link
                      className="k-nav-overflow-item"
                      to={module.route}
                      key={module.key}
                      role="menuitem"
                      onClick={() => setOverflowOpen(false)}
                    >
                      {module.label}
                    </Link>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className="k-nav-phone" data-testid="module-navigation-phone">
        <button
          ref={drawerButtonRef}
          className="k-button secondary"
          type="button"
          aria-expanded={drawerOpen}
          aria-controls="k-nav-drawer"
          onClick={() => setDrawerOpen((value) => !value)}
        >
          {rules.phoneDrawerLabel ?? 'Menu'}
        </button>
        {drawerOpen ? (
          <div
            ref={drawerContainerRef}
            className="k-nav-drawer"
            id="k-nav-drawer"
            role="dialog"
            aria-modal="true"
            aria-label={rules.ariaLabel ?? 'Navigace'}
          >
            {rules.enableSearchInMenuOnPhone ? (
              <label className="k-nav-drawer-search">
                <span className="k-nav-sr-only">Hledat modul</span>
                <input
                  ref={searchInputRef}
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
                <Link
                  className="k-nav-overflow-item"
                  to={module.route}
                  key={module.key}
                  role="menuitem"
                  onClick={() => setDrawerOpen(false)}
                >
                  {module.label}
                </Link>
              ))}
              {searchableItems.length === 0 ? <p className="k-nav-empty">Žádné výsledky.</p> : null}
            </div>
          </div>
        ) : null}
      </div>
    </nav>
  );
}
