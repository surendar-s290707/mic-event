import { Link, Navigate } from 'react-router-dom';
import { useApp } from '../store/context';
import { Button, Card } from '../components/ui';

export function Landing() {
  const { user } = useApp();

  // Already signed in? Go straight to the right home screen.
  if (user) return <Navigate to={user.role === 'ORGANIZER' ? '/organizer' : '/attendee'} replace />;

  return (
    <>
      <section className="hero">
        <p className="eyebrow">MIC Development Department</p>
        <h1>
          Events, without the <span className="hero__accent">chaos.</span>
        </h1>
        <p className="hero__sub">
          Create a campus event, let people register, and check them in with a scan at the door.
          The count updates while the queue moves.
        </p>
        <div className="hero__cta">
          <Link to="/login">
            <Button variant="primary" size="lg">
              Get started
            </Button>
          </Link>
          <Link to="/login">
            <Button size="lg">I have a ticket</Button>
          </Link>
        </div>
      </section>

      <section className="usecases">
        <Card>
          <h3>Running an event</h3>
          <div className="usecase__steps">
            <span>Create the event and set a capacity.</span>
            <span>Scan tickets at the door with your phone.</span>
            <span>Watch check-ins land on the dashboard.</span>
          </div>
        </Card>
        <Card>
          <h3>Going to one</h3>
          <div className="usecase__steps">
            <span>Register in two taps.</span>
            <span>Get your own QR ticket.</span>
            <span>Show it at the entrance. That’s it.</span>
          </div>
        </Card>
      </section>
    </>
  );
}
