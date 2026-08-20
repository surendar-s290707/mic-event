import { Link, Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import type { Role } from '../lib/types';
import { useSession } from '../store/session';
import { Button, EmptyState, LoadingState } from '../components/ui';

/**
 * Route gating for the UX only.
 *
 * The real boundary is the API: requireAuth / requireRole / ownership checks
 * run on every request, so hand-written calls to an organizer endpoint fail
 * with 401 or 403 regardless of what this component renders.
 */
export function RequireRole({ role, children }: { role: Role; children: ReactNode }) {
  const { user, status } = useSession();
  const location = useLocation();

  // Wait for /api/auth/me before deciding, or a refresh would bounce a
  // signed-in user to the login page for a frame.
  if (status === 'loading') {
    return (
      <div className="page">
        <LoadingState label="Checking your session…" />
      </div>
    );
  }

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
