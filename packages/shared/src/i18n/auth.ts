export type AuthLocale = 'cs' | 'en';

export type AuthContext = 'portal' | 'admin';

export type NavigationCopy = {
  ariaLabel: string;
  overflowLabel: string;
  phoneDrawerLabel: string;
  phoneSearchPlaceholder: string;
};

type AuthCopy = {
  eyebrow: string;
  title: string;
  description: string;
  emailLabel: string;
  passwordLabel: string;
  loginAction: string;
  loginError?: string;
  loginErrorTitle?: string;
  loginErrorHelp?: string;
  accountLockedError?: string;
  forgotAction: string;
  forgotInfo: string;
  forgotLockedInfo?: string;
  emailRequired?: string;
  credentialsRequired?: string;
  hintAction?: string;
  hintInfo?: string;
  roleSelectTitle?: string;
  roleSelectDescription?: string;
  roleSelectError?: string;
  continueAs?: (roleLabel: string) => string;
  accessDeniedTitle?: string;
  accessDeniedModule?: (moduleLabel: string, roleLabel: string, userId: string) => string;
  accessDeniedNoModules?: (roleLabel: string, userId: string) => string;
};

type AuthDictionary = Record<AuthContext, Record<AuthLocale, AuthCopy>>;

const AUTH_STRINGS: AuthDictionary = {
  portal: {
    cs: {
      eyebrow: 'KájovoHotel · Portál',
      title: 'Přihlášení uživatele',
      description: 'Přihlaste se pracovním účtem. Uživatelské jméno je vždy emailová adresa.',
      emailLabel: 'Email',
      passwordLabel: 'Heslo',
      loginAction: 'Přihlásit se',
      loginError: 'Neplatné přihlašovací údaje.',
      loginErrorTitle: 'Přihlášení se nezdařilo',
      loginErrorHelp: 'Zkontrolujte email a heslo, případně použijte odblokování účtu.',
      accountLockedError: 'Účet je dočasně uzamčen. Použijte odkaz pro odblokování účtu.',
      forgotAction: 'Zapomenuté heslo',
      forgotInfo: 'Pokud účet existuje, byl odeslán odkaz pro obnovu.',
      forgotLockedInfo: 'Pokud je účet odemčený, byl odeslán odkaz pro obnovu.',
      emailRequired: 'Vyplňte email.',
      credentialsRequired: 'Vyplňte email i heslo.',
      roleSelectTitle: 'Vyberte roli',
      roleSelectDescription: 'Pro pokračování zvolte roli, ve které budete pracovat.',
      roleSelectError: 'Výběr role selhal.',
      continueAs: (roleLabel: string) => `Pokračovat jako ${roleLabel}`,
      accessDeniedTitle: 'Přístup odepřen',
      accessDeniedModule: (moduleLabel, roleLabel, userId) =>
        `Role ${roleLabel} (uživatel ${userId}) nemá oprávnění pro modul ${moduleLabel}.`,
      accessDeniedNoModules: (roleLabel, userId) =>
        `Role ${roleLabel} (uživatel ${userId}) nemá žádné dostupné moduly.`,
    },
    en: {
      eyebrow: 'KájovoHotel · Portal',
      title: 'User sign-in',
      description: 'Sign in with your work account. The username is always your email address.',
      emailLabel: 'Email',
      passwordLabel: 'Password',
      loginAction: 'Sign in',
      loginError: 'Invalid credentials.',
      loginErrorTitle: 'Sign-in failed',
      loginErrorHelp: 'Check your email and password, or use account unlock.',
      accountLockedError: 'Account is temporarily locked. Use the unlock link.',
      forgotAction: 'Forgotten password',
      forgotInfo: 'If the account exists, a recovery link has been sent.',
      forgotLockedInfo: 'If the account is unlocked, a recovery link has been sent.',
      emailRequired: 'Enter your email.',
      credentialsRequired: 'Enter both email and password.',
      roleSelectTitle: 'Choose a role',
      roleSelectDescription: 'Select the role you will use for this session.',
      roleSelectError: 'Role selection failed.',
      continueAs: (roleLabel: string) => `Continue as ${roleLabel}`,
      accessDeniedTitle: 'Access denied',
      accessDeniedModule: (moduleLabel, roleLabel, userId) =>
        `Role ${roleLabel} (user ${userId}) doesn't have permission for ${moduleLabel}.`,
      accessDeniedNoModules: (roleLabel, userId) =>
        `Role ${roleLabel} (user ${userId}) has no available modules.`,
    },
  },
  admin: {
    cs: {
      eyebrow: 'KájovoHotel · Admin',
      title: 'Přihlášení administrace',
      description: 'Použijte pevný admin účet pro správu uživatelů a nastavení provozu.',
      emailLabel: 'Email',
      passwordLabel: 'Heslo',
      loginAction: 'Přihlásit se',
      loginError: 'Neplatné přihlašovací údaje.',
      loginErrorTitle: 'Přihlášení se nezdařilo',
      loginErrorHelp: 'Zkontrolujte email a heslo, případně použijte odblokování účtu.',
      accountLockedError: 'Účet je dočasně uzamčen. Použijte odkaz pro odblokování účtu.',
      forgotAction: 'Odblokovat účet',
      forgotInfo: 'Pokud účet existuje, byl odeslán odkaz pro odblokování.',
      emailRequired: 'Vyplňte email.',
      credentialsRequired: 'Vyplňte email i heslo.',
      hintAction: 'Zaslat odkaz pro odblokování',
      hintInfo: 'Pokud účet existuje, byl odeslán odkaz pro odblokování.',
    },
    en: {
      eyebrow: 'KájovoHotel · Admin',
      title: 'Administration sign-in',
      description: 'Use the dedicated admin account to manage users and operational settings.',
      emailLabel: 'Email',
      passwordLabel: 'Password',
      loginAction: 'Sign in',
      loginError: 'Invalid credentials.',
      loginErrorTitle: 'Sign-in failed',
      loginErrorHelp: 'Check your email and password, or use account unlock.',
      accountLockedError: 'Account is temporarily locked. Use the unlock link.',
      forgotAction: 'Unlock account',
      forgotInfo: 'If the account exists, an unlock link has been sent.',
      emailRequired: 'Enter your email.',
      credentialsRequired: 'Enter both email and password.',
      hintAction: 'Send unlock link',
      hintInfo: 'If the account exists, an unlock link has been sent.',
    },
  },
};

const ROLE_LABELS: Record<AuthLocale, Record<string, string>> = {
  cs: {
    admin: 'Admin',
    recepce: 'Recepce',
    pokojská: 'Pokojská',
    údržba: 'Údržba',
    snídaně: 'Snídaně',
    sklad: 'Sklad',
  },
  en: {
    admin: 'Admin',
    recepce: 'Front desk',
    pokojská: 'Housekeeping',
    údržba: 'Maintenance',
    snídaně: 'Breakfast',
    sklad: 'Inventory',
  },
};

const MODULE_LABELS: Record<AuthLocale, Record<string, string>> = {
  cs: {
    dashboard: 'Přehled',
    breakfast: 'Snídaně',
    housekeeping: 'Pokojská',
    lost_found: 'Ztráty a nálezy',
    issues: 'Závady',
    inventory: 'Skladové hospodářství',
    reports: 'Hlášení',
    users: 'Uživatelé',
    settings: 'Nastavení',
    other: 'Další',
  },
  en: {
    dashboard: 'Overview',
    breakfast: 'Breakfast',
    housekeeping: 'Housekeeping',
    lost_found: 'Lost & found',
    issues: 'Issues',
    inventory: 'Inventory',
    reports: 'Reports',
    users: 'Users',
    settings: 'Settings',
    other: 'More',
  },
};

const NAVIGATION_COPY: Record<AuthLocale, NavigationCopy> = {
  cs: {
    ariaLabel: 'Hlavní navigace',
    overflowLabel: 'Další',
    phoneDrawerLabel: 'Menu',
    phoneSearchPlaceholder: 'Hledat v menu',
  },
  en: {
    ariaLabel: 'Main navigation',
    overflowLabel: 'More',
    phoneDrawerLabel: 'Menu',
    phoneSearchPlaceholder: 'Search the menu',
  },
};

const NAVIGATION_SECTIONS: Record<AuthLocale, Record<string, string>> = {
  cs: {
    overview: 'Přehled',
    operations: 'Provoz',
    records: 'Evidence',
  },
  en: {
    overview: 'Overview',
    operations: 'Operations',
    records: 'Records',
  },
};

export type AuthBundle = {
  locale: AuthLocale;
  copy: AuthCopy;
  roleLabels: Record<string, string>;
  moduleLabels: Record<string, string>;
  navigation: NavigationCopy;
  sectionLabels: Record<string, string>;
};

export function resolveAuthLocale(source?: string | null): AuthLocale {
  if (!source) {
    return 'cs';
  }
  const normalized = source.trim().toLowerCase();
  if (normalized.startsWith('en')) {
    return 'en';
  }
  return 'cs';
}

export function getAuthBundle(context: AuthContext, localeHint?: string | null): AuthBundle {
  const locale = resolveAuthLocale(localeHint);
  return {
    locale,
    copy: AUTH_STRINGS[context][locale],
    roleLabels: ROLE_LABELS[locale],
    moduleLabels: MODULE_LABELS[locale],
    navigation: NAVIGATION_COPY[locale],
    sectionLabels: NAVIGATION_SECTIONS[locale],
  };
}
