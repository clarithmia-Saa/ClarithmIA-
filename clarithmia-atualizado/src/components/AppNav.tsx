import { useEffect } from 'react';
import type { Translation } from '@/i18n';
import { Icon, type IconName } from '@/components/icons';

export const MENU_DESTINATIONS = ['main', 'sources', 'reports', 'settings', 'billing'] as const;
type MenuDestination = (typeof MENU_DESTINATIONS)[number];

const MENU_ICONS: Record<MenuDestination, IconName> = {
  main: 'layout',
  sources: 'database',
  reports: 'fileText',
  settings: 'building',
  billing: 'card',
};

export function MobileNav({
  t,
  active,
  menuOpen,
  onSelect,
  onOpenMenu,
}: {
  t: Translation;
  active: string;
  menuOpen: boolean;
  onSelect: (id: string) => void;
  onOpenMenu: () => void;
}) {
  const inMenuSection = (MENU_DESTINATIONS as readonly string[]).includes(active);
  return (
    <nav className="mn-bar" aria-label={t.appNav.navLabel}>
      <button
        type="button"
        className={`mn-item ${active === 'inbox' && !menuOpen ? 'active' : ''}`}
        aria-current={active === 'inbox' ? 'page' : undefined}
        onClick={() => onSelect('inbox')}
      >
        <Icon name="inbox" size={22} />
        <span>{t.appNav.inbox}</span>
      </button>

      <button
        type="button"
        className={`mn-item ${active === 'insights' && !menuOpen ? 'active' : ''}`}
        aria-current={active === 'insights' ? 'page' : undefined}
        onClick={() => onSelect('insights')}
      >
        <Icon name="sparkles" size={22} />
        <span>{t.appNav.assistant}</span>
      </button>

      <button
        type="button"
        className={`mn-item ${menuOpen || inMenuSection ? 'active' : ''}`}
        aria-haspopup="dialog"
        aria-expanded={menuOpen}
        onClick={onOpenMenu}
      >
        <Icon name="grid" size={22} />
        <span>{t.appNav.menu}</span>
      </button>
    </nav>
  );
}

export function MenuDrawer({
  t,
  active,
  workspaceName,
  onSelect,
  onClose,
  onExit,
}: {
  t: Translation;
  active: string;
  workspaceName: string;
  onSelect: (id: string) => void;
  onClose: () => void;
  onExit: () => void;
}) {
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  const name = workspaceName.trim() || 'ClarithmIA';

  return (
    <div
      className="mn-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="mn-sheet" role="dialog" aria-modal="true" aria-labelledby="mn-title">
        <span className="mn-grab" aria-hidden="true" />
        <header className="mn-head">
          <div className="mn-workspace">
            <span className="mn-logo">{name.charAt(0).toUpperCase()}</span>
            <div>
              <h2 id="mn-title">{name}</h2>
              <small>{t.appNav.menuTitle}</small>
            </div>
          </div>
          <button type="button" className="mn-close" aria-label={t.appNav.menuClose} onClick={onClose}>
            <Icon name="x" size={18} />
          </button>
        </header>

        <ul className="mn-list">
          {MENU_DESTINATIONS.map((id) => (
            <li key={id}>
              <button
                type="button"
                className={`mn-link ${active === id ? 'active' : ''}`}
                onClick={() => onSelect(id)}
              >
                <span className="mn-link-icon"><Icon name={MENU_ICONS[id]} size={20} /></span>
                <span className="mn-link-text">
                  <strong>{t.appNav.items[id].title}</strong>
                  <small>{t.appNav.items[id].desc}</small>
                </span>
                <Icon name="chevronRight" size={18} />
              </button>
            </li>
          ))}
        </ul>

        <button type="button" className="mn-exit" onClick={onExit}>
          <Icon name="logOut" size={17} />
          {t.appNav.backToSite}
        </button>
      </div>
    </div>
  );
}
