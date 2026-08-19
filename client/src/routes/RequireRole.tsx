import { Link, Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import type { Role } from '../lib/types';
import { useApp } from '../store/context';
import { Button, EmptyState } from '../components/ui';

/**
 * CURRENT MOCK FUNCTIONALITY — client-side route gating only.
 *
 * This hides screens; it does not protect data. Real authorization is a
 * server concern: milestone 3 verifies the JWT and the user's role inside the
 * API handlers, so a hand-written request cannot reach an organizer endpoint
 * even if someone edits the frontend.
 */
export function RequireRole({ role, children }: { role: Role; children: ReactNode }) {
  const { user } = useApp();
  const location = useLocation();

  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;

  if (user.role !== role) {
    const home = user.role === 'ORGANIZER' ? '/organizer' : '/attendee';
    return (
      <div className="page">
        <EmptyState
          title="That area is for a different role"
          body={`You're signed in as ${user.role === 'ORGANIZER' ? 'an organizer' : 'an attendee'}, so this page isn't yours.`}
          action={
            <Link to={home}>
              <Button variant="primary">Go to my dashboard</Button>
            </Link>
          }
        />
      </div>
    );
  }

  return <>{children}</>;
}
