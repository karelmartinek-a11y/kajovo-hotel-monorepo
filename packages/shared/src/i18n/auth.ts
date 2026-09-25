export type AuthLocale = 'cs' | 'en' | 'uk';

export type AuthContext = 'portal' | 'admin';

export type NavigationCopy = {
  ariaLabel: string;
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

type AuthDictionary = { portal: Record<AuthLocale, AuthCopy>; admin: Record<'cs', AuthCopy> };

const AUTH_STRINGS: AuthDictionary = {
  portal: {
    cs: {
      eyebrow: 'Kájovo Hotel · Portál',
      title: 'Přihlášení uživatele',
      description: 'Přihlaste se pracovním účtem. Uživatelské jméno je vždy emailová adresa.',
      emailLabel: 'Email',
      passwordLabel: 'Heslo',
      loginAction: 'Přihlásit se',
      loginError: 'Neplatné přihlašovací údaje.',
      loginErrorTitle: 'Přihlášení se nezdařilo',
      loginErrorHelp: 'Zkontrolujte email a heslo, případně použijte odblokování účtu.',
      accountLockedError: 'Účet je dočasně uzamčen. Použijte odkaz pro odblokování účtu.',
      forgotAction: 'Reset hesla řeší admin',
      forgotInfo: 'Reset hesla odesílá pouze administrátor ze správy uživatelů.',
      forgotLockedInfo: 'Při blokaci přijde na e-mail odkaz pro odblokování účtu.',
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
      eyebrow: 'Kájovo Hotel · Portal',
      title: 'User sign-in',
      description: 'Sign in with your work account. The username is always your email address.',
      emailLabel: 'Email',
      passwordLabel: 'Password',
      loginAction: 'Sign in',
      loginError: 'Invalid credentials.',
      loginErrorTitle: 'Sign-in failed',
      loginErrorHelp: 'Check your email and password, or use account unlock.',
      accountLockedError: 'Account is temporarily locked. Use the unlock link.',
      forgotAction: 'Admin reset only',
      forgotInfo: 'Password reset can only be sent by an administrator from user management.',
      forgotLockedInfo: 'When the account is locked, an unlock link is sent by email.',
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
    uk: {
      eyebrow: 'Kájovo Hotel · Портал',
      title: 'Вхід до порталу',
      description: 'Увійдіть із робочим обліковим записом. Ваше ім’я користувача — адреса електронної пошти.',
      emailLabel: 'Електронна пошта', passwordLabel: 'Пароль', loginAction: 'Увійти',
      loginError: 'Неправильні облікові дані.', loginErrorTitle: 'Не вдалося увійти',
      loginErrorHelp: 'Перевірте адресу електронної пошти й пароль або розблокуйте обліковий запис.',
      accountLockedError: 'Обліковий запис тимчасово заблоковано. Скористайтеся посиланням для розблокування.',
      forgotAction: 'Пароль відновлює адміністратор',
      forgotInfo: 'Лише адміністратор може надіслати посилання для відновлення пароля.',
      forgotLockedInfo: 'Якщо обліковий запис заблоковано, посилання для розблокування надійде електронною поштою.',
      emailRequired: 'Введіть адресу електронної пошти.', credentialsRequired: 'Введіть адресу електронної пошти й пароль.',
      roleSelectTitle: 'Оберіть роль', roleSelectDescription: 'Оберіть роль, у якій працюватимете.',
      roleSelectError: 'Не вдалося обрати роль.', continueAs: (roleLabel) => `Продовжити як ${roleLabel}`,
      accessDeniedTitle: 'Доступ заборонено',
      accessDeniedModule: (moduleLabel, roleLabel, userId) => `Роль ${roleLabel} (користувач ${userId}) не має доступу до модуля ${moduleLabel}.`,
      accessDeniedNoModules: (roleLabel, userId) => `Для ролі ${roleLabel} (користувач ${userId}) немає доступних модулів.`,
    },
  },
  admin: {
    cs: {
      eyebrow: 'Kájovo Hotel · Admin',
      title: 'Přihlášení administrace',
      description: 'Použijte pevný admin účet pro správu uživatelů a nastavení provozu.',
      emailLabel: 'Email',
      passwordLabel: 'Heslo',
      loginAction: 'Přihlásit se',
      loginError: 'Neplatné přihlašovací údaje.',
      loginErrorTitle: 'Přihlášení se nezdařilo',
      loginErrorHelp: 'Zkontrolujte email a heslo. Pokud je účet zablokován, použijte odkaz pro odblokování. Pokud jste heslo zapomněli, pošlete si připomenutí.',
      accountLockedError: 'Účet je dočasně uzamčen. Použijte odkaz pro odblokování účtu.',
      forgotAction: 'Připomenout heslo',
      forgotInfo: 'Pokud účet existuje, byl odeslán e-mail s připomenutím, kde admin heslo najdete.',
      emailRequired: 'Vyplňte email.',
      credentialsRequired: 'Vyplňte email i heslo.',
      hintAction: 'Poslat připomenutí hesla',
      hintInfo: 'Pokud účet existuje, byl odeslán e-mail s připomenutím, kde admin heslo najdete.',
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
  uk: { admin: 'Адміністратор', recepce: 'Рецепція', pokojská: 'Покоївка', údržba: 'Технічна служба', snídaně: 'Сніданки', sklad: 'Склад' },
};

const MODULE_LABELS: Record<AuthLocale, Record<string, string>> = {
  cs: {
    dashboard: 'Přehled',
    breakfast: 'Snídaně',
    housekeeping: 'Pokoje',
    lost_found: 'Ztráty a nálezy',
    issues: 'Závady',
    inventory: 'Skladové hospodářství',
    reports: 'Hlášení',
    users: 'Uživatelé',
    settings: 'Nastavení',
    profile: 'Profil',
    other: 'Další',
  },
  en: {
    dashboard: 'Overview',
    breakfast: 'Breakfast',
    housekeeping: 'Rooms',
    lost_found: 'Lost & found',
    issues: 'Issues',
    inventory: 'Inventory',
    reports: 'Reports',
    users: 'Users',
    settings: 'Settings',
    profile: 'Profile',
    other: 'More',
  },
  uk: { dashboard: 'Огляд', breakfast: 'Сніданки', housekeeping: 'Номери', lost_found: 'Бюро знахідок', issues: 'Несправності', inventory: 'Склад', reports: 'Звіти', users: 'Користувачі', settings: 'Налаштування', profile: 'Профіль', other: 'Інше' },
};

const NAVIGATION_COPY: Record<AuthLocale, NavigationCopy> = {
  cs: {
    ariaLabel: 'Hlavní navigace',
    phoneDrawerLabel: 'Menu',
    phoneSearchPlaceholder: 'Hledat v menu',
  },
  en: {
    ariaLabel: 'Main navigation',
    phoneDrawerLabel: 'Menu',
    phoneSearchPlaceholder: 'Search the menu',
  },
  uk: { ariaLabel: 'Головна навігація', phoneDrawerLabel: 'Меню', phoneSearchPlaceholder: 'Пошук у меню' },
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
  uk: { overview: 'Огляд', operations: 'Робота готелю', records: 'Облік' },
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
  if (normalized.startsWith('uk')) {
    return 'uk';
  }
  return 'cs';
}

export function getAuthBundle(context: AuthContext, localeHint?: string | null): AuthBundle {
  const locale = context === 'admin' ? 'cs' : resolveAuthLocale(localeHint);
  return {
    locale,
    copy: context === 'admin' ? AUTH_STRINGS.admin.cs : AUTH_STRINGS.portal[locale],
    roleLabels: ROLE_LABELS[locale],
    moduleLabels: MODULE_LABELS[locale],
    navigation: NAVIGATION_COPY[locale],
    sectionLabels: NAVIGATION_SECTIONS[locale],
  };
}
