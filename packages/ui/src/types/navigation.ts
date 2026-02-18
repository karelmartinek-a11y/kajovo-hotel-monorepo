export type NavModule = {
  key: string;
  label: string;
  route: string;
  active: boolean;
};

export type NavigationRules = {
  maxTopLevelItemsDesktop: number;
  overflowLabel: string;
  grouping: boolean;
};
