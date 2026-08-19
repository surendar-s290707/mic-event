import { Link } from 'react-router-dom';
import { EmptyState, Button } from '../components/ui';

export function NotFound() {
  return (
    <div className="page">
      <EmptyState
        title="This page doesn’t exist"
        body="The link may be old, or the event may have been removed."
        action={
          <Link to="/">
            <Button variant="primary">Back to start</Button>
          </Link>
        }
      />
    </div>
  );
}
