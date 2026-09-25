import React from 'react';
import { t } from '@kajovo/shared';
import { Link } from 'react-router-dom';
import type { NavModule, NavigationRules, NavigationSection } from '../types/navigation';
import { Icon } from '../components/Icon';

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
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');

  const drawerButtonRef = React.useRef<HTMLButtonElement | null>(null);
  const wasDrawerOpenRef = React.useRef(false);
  const drawerContainerRef = React.useRef<HTMLDivElement | null>(null);
  const searchInputRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
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
    if (drawerOpen) {
      wasDrawerOpenRef.current = true;
    } else if (wasDrawerOpenRef.current && drawerButtonRef.current) {
      drawerButtonRef.current.focus();
      wasDrawerOpenRef.current = false;
    }
  }, [drawerOpen]);

  const sectionMap = React.useMemo(() => new Map(sections.map((section) => [section.key, section])), [sections]);

  const grouped = React.useMemo(() => {
    if (!rules.grouping) {
      return [{ key: 'all', label: '', items: active, order: 0 }];
    }

    const bySection = new Map<string, GroupedModules>();
    const defaultSectionKey = 'default';
    const defaultLabel = rules.defaultGroupLabel ?? t('Ostatní');

    for (const module of active) {
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
  }, [rules.grouping, sectionMap, active]);

  const searchableItems = React.useMemo(() => {
    if (!rules.enableSearchInMenuOnPhone || !search.trim()) {
      return active;
    }

    const needle = normalize(search.trim());
    return active.filter((module) => normalize(module.label).includes(needle));
  }, [active, rules.enableSearchInMenuOnPhone, search]);

  return (
    <nav
      role="navigation"
      aria-label={rules.ariaLabel ?? t('Hlavní navigace')}
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
                  aria-current={currentPath === module.route || (module.route !== '/' && currentPath.startsWith(`${module.route}/`)) ? 'page' : undefined}
                >
                  <Icon name={module.icon} className="k-nav-link__icon" />
                  <span>{module.label}</span>
                </Link>
              ))}
            </React.Fragment>
          ))}
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
          {rules.phoneDrawerLabel ?? t('Menu')}
        </button>
        {drawerOpen ? (
          <div
            ref={drawerContainerRef}
            className="k-nav-drawer"
            id="k-nav-drawer"
            role="dialog"
            aria-modal="true"
            aria-label={rules.ariaLabel ?? t('Navigace')}
          >
            {rules.enableSearchInMenuOnPhone ? (
              <label className="k-nav-drawer-search">
                <span className="k-nav-sr-only">{t("Hledat modul")}</span>
                <input
                  ref={searchInputRef}
                  className="k-input"
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={rules.phoneSearchPlaceholder ?? t('Hledat v menu')}
                />
              </label>
            ) : null}
            <div className="k-nav-drawer-list" role="menu" aria-label={t("Moduly")}>
              {searchableItems.map((module) => (
                <Link
                  className="k-nav-drawer-item"
                  to={module.route}
                  key={module.key}
                  role="menuitem"
                  onClick={() => setDrawerOpen(false)}
                >
                  <Icon name={module.icon} className="k-nav-link__icon" />
                  <span>{module.label}</span>
                </Link>
              ))}
              {searchableItems.length === 0 ? <p className="k-nav-empty">{t("Žádné výsledky.")}</p> : null}
            </div>
          </div>
        ) : null}
      </div>
    </nav>
  );
}
