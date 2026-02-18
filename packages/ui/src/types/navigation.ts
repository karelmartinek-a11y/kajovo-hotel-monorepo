export type NavModule = {
  key: string;
  label: string;
  route: string;
  active: boolean;
  icon?: string;
  section?: string;
  permissions?: string[];
};

export type NavigationSection = {
  key: string;
  label: string;
  icon?: string;
  order?: number;
  permissions?: string[];
};

export type NavigationRules = {
  maxTopLevelItemsDesktop: number;
  maxTopLevelItemsTablet?: number;
  overflowLabel: string;
  phoneDrawerLabel?: string;
  phoneSearchPlaceholder?: string;
  enableSearchInMenuOnPhone?: boolean;
  grouping: boolean;
};
