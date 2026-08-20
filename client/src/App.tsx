import { Suspense, lazy } from 'react';
import { Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { Landing } from './routes/Landing';
import { Login } from './routes/Login';
import { Signup } from './routes/Signup';
import { NotFound } from './routes/NotFound';
import { RequireRole } from './routes/RequireRole';
import { EventDetail } from './routes/EventDetail';
import { OrganizerHome } from './routes/organizer/OrganizerHome';
import { OrganizerEvents } from './routes/organizer/OrganizerEvents';
import { NewEvent } from './routes/organizer/NewEvent';
import { EventDashboard } from './routes/organizer/EventDashboard';
import { LoadingState } from './components/ui';

// The QR scanning library is ~600 kB and only the scanner needs it, so this
// route is split out of the main bundle.
const ScanPage = lazy(() =>
  import('./routes/organizer/ScanPage').then((m) => ({ default: m.ScanPage })),
);

// Same reason: the QR generator only matters on the ticket screen.
const Ticket = lazy(() => import('./routes/attendee/Ticket').then((m) => ({ default: m.Ticket })));
import { AttendeeHome } from './routes/attendee/AttendeeHome';
import { AttendeeEvents } from './routes/attendee/AttendeeEvents';

/** Route table. Role gating is one wrapper per branch — see RequireRole. */
export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        {/* Public */}
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />

        {/* Organizer */}
        <Route
          path="/organizer"
          element={
            <RequireRole role="ORGANIZER">
              <OrganizerHome />
            </RequireRole>
          }
        />
        <Route
          path="/organizer/events"
          element={
            <RequireRole role="ORGANIZER">
              <OrganizerEvents />
            </RequireRole>
          }
        />
        <Route
          path="/organizer/events/new"
          element={
            <RequireRole role="ORGANIZER">
              <NewEvent />
            </RequireRole>
          }
        />
        <Route
          path="/organizer/events/:id"
          element={
            <RequireRole role="ORGANIZER">
              <EventDetail />
            </RequireRole>
          }
        />
        <Route
          path="/organizer/events/:id/scan"
          element={
            <RequireRole role="ORGANIZER">
              <Suspense
                fallback={
                  <div className="page">
                    <LoadingState label="Loading the scanner…" />
                  </div>
                }
              >
                <ScanPage />
              </Suspense>
            </RequireRole>
          }
        />
        <Route
          path="/organizer/events/:id/dashboard"
          element={
            <RequireRole role="ORGANIZER">
              <EventDashboard />
            </RequireRole>
          }
        />

        {/* Attendee */}
        <Route
          path="/attendee"
          element={
            <RequireRole role="ATTENDEE">
              <AttendeeHome />
            </RequireRole>
          }
        />
        <Route
          path="/attendee/events"
          element={
            <RequireRole role="ATTENDEE">
              <AttendeeEvents />
            </RequireRole>
          }
        />
        <Route
          path="/attendee/events/:id"
          element={
            <RequireRole role="ATTENDEE">
              <EventDetail />
            </RequireRole>
          }
        />
        <Route
          path="/attendee/ticket/:id"
          element={
            <RequireRole role="ATTENDEE">
              <Suspense
                fallback={
                  <div className="page">
                    <LoadingState label="Loading your ticket…" />
                  </div>
                }
              >
                <Ticket />
              </Suspense>
            </RequireRole>
          }
        />

        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
