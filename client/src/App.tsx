import { Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { Landing } from './routes/Landing';
import { Login } from './routes/Login';
import { NotFound } from './routes/NotFound';
import { RequireRole } from './routes/RequireRole';
import { EventDetail } from './routes/EventDetail';
import { OrganizerHome } from './routes/organizer/OrganizerHome';
import { OrganizerEvents } from './routes/organizer/OrganizerEvents';
import { NewEvent } from './routes/organizer/NewEvent';
import { ScanPage } from './routes/organizer/ScanPage';
import { EventDashboard } from './routes/organizer/EventDashboard';
import { AttendeeHome } from './routes/attendee/AttendeeHome';
import { AttendeeEvents } from './routes/attendee/AttendeeEvents';
import { Ticket } from './routes/attendee/Ticket';

/** Route table. Role gating is one wrapper per branch — see RequireRole. */
export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        {/* Public */}
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />

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
              <ScanPage />
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
              <Ticket />
            </RequireRole>
          }
        />

        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
