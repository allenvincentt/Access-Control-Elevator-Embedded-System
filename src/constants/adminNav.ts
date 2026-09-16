import type { IconName } from '@/components/ui/Icon';

export type AdminSection = 'home' | 'logs' | 'staff' | 'me';

export type AdminNavItem = {
  section: AdminSection;
  label: string;
  shortLabel?: string;
  icon: IconName;
};

export type AdminNavGroup = {
  label: string;
  items: AdminNavItem[];
};

export const adminNavigation: AdminNavGroup[] = [
  {
    label: 'Overview',
    items: [
      { section: 'home', label: 'Home', icon: 'home' },
      { section: 'logs', label: 'Access logs', shortLabel: 'Logs', icon: 'logs' },
    ],
  },
  {
    label: 'Directory',
    items: [{ section: 'staff', label: 'Staff', icon: 'staff' }],
  },
  {
    label: 'Account',
    items: [{ section: 'me', label: 'Me', icon: 'me' }],
  },
];

export const adminNavFlat: AdminNavItem[] = adminNavigation.flatMap((group) => group.items);
