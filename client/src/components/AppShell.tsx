import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useApp } from '../store/context';
import { initials } from '../lib/format';
import { ApiStatus } from './ApiStatus';
import { Button } from './ui';

interface NavItem {
  to: string;
  label: string;
  icon: string;
  end?: boolean;
}

const organizerNav: NavItem[] = [
  { to: '/organizer', label: 'Home', icon: '◎', end: true },
  { to: '/organizer/events', label: 'Events', icon: '▤' },
  { to: '/organizer/events/new', label: 'Create', icon: '＋' },
];

const attendeeNav: NavItem[] = [
  { to: '/attendee', label: 'Home', icon: '◎', end: true },
  { to: '/attendee/events', label: 'Events', icon: '▤' },
];

export function AppShell() {
  const { user, signOut } = useApp();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const navItems = user?.role === 'ORGANIZER' ? organizerNav : user?.role === 'ATTENDEE' ? attendeeNav : [];
  const home = user?.role === 'ORGANIZER' ? '/organizer' : user?.role === 'ATTENDEE' ? '/attendee' : '/';

  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [menuOpen]);

  return (
    <div className="shell">
      <header className="topbar">
        <div className="topbar__inner">
          <Link to={home} className="brand">
            <span className="brand__mark" aria-hidden="true">
              M
            </span>
            MIC Event
          </Link>

          {navItems.length > 0 && (
            <nav className="nav" aria-label="Main">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) => `nav__link ${isActive ? 'nav__link--active' : ''}`}
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
          )}

          <div className="topbar__end">
            <ApiStatus />
            {user ? (
              <div className="usermenu" ref={menuRef}>
                <button
                  className="usermenu__trigger"
                  onClick={() => setMenuOpen((open) => !open)}
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                >
                  <span className="avatar" aria-hidden="true">
                    {initials(user.name)}
                  </span>
                  <span className="usermenu__name">{user.name.split(' ')[0]}</span>
                </button>
                {menuOpen && (
                  <div className="usermenu__panel" role="menu">
                    <div className="usermenu__meta">
                      <div style={{ fontWeight: 560 }}>{user.name}</div>
                      <div className="muted" style={{ fontSize: '0.82rem' }}>
                        {user.email}
                      </div>
                      <div className="muted" style={{ fontSize: '0.82rem' }}>
                        Signed in as {user.role === 'ORGANIZER' ? 'organizer' : 'attendee'}
                      </div>
                    </div>
                    <button
                      className="usermenu__item"
                      role="menuitem"
                      onClick={() => {
                        setMenuOpen(false);
                        signOut();
                        navigate('/');
                      }}
                    >
                      Log out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <Button size="sm" variant="primary" onClick={() => navigate('/login')}>
                Log in
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="shell__main">
        <Outlet />
      </main>

      {navItems.length > 0 && (
        <nav className="mobilenav" aria-label="Main (mobile)">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `mobilenav__link ${isActive ? 'mobilenav__link--active' : ''}`}
            >
              <span className="mobilenav__icon" aria-hidden="true">
                {item.icon}
              </span>
              {item.label}
            </NavLink>
          ))}
        </nav>
      )}
    </div>
  );
}
