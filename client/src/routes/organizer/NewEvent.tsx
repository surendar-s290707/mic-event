import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useApp } from '../../store/context';
import { fromDateTimeInputs } from '../../lib/format';
import { Banner, Button, Card, DevNote, Field, Input, Textarea } from '../../components/ui';

interface FormState {
  name: string;
  date: string;
  time: string;
  venue: string;
  capacity: string;
  description: string;
}

type Errors = Partial<Record<keyof FormState, string>>;

const EVENT_LENGTH_HOURS = 2;

function validate(form: FormState): Errors {
  const errors: Errors = {};

  if (form.name.trim().length < 3) errors.name = 'Give your event a name (at least 3 characters)';
  if (!form.venue.trim()) errors.venue = 'Where is it happening?';

  if (!form.date) errors.date = 'Pick a date';
  if (!form.time) errors.time = 'Pick a start time';

  const startsAt = fromDateTimeInputs(form.date, form.time);
  if (form.date && form.time) {
    if (!startsAt) errors.date = 'That date and time don’t look right';
    else if (new Date(startsAt).getTime() < Date.now() - 60_000) errors.date = 'Pick a time in the future';
  }

  const capacity = Number(form.capacity);
  if (!form.capacity.trim()) errors.capacity = 'How many people can come?';
  else if (!Number.isInteger(capacity) || capacity < 1) errors.capacity = 'Capacity must be a whole number above 0';
  else if (capacity > 5000) errors.capacity = 'That’s more than we can seat (max 5000)';

  return errors;
}

export function NewEvent() {
  const { createEvent } = useApp();
  const navigate = useNavigate();

  const [form, setForm] = useState<FormState>({
    name: '',
    date: '',
    time: '',
    venue: '',
    capacity: '',
    description: '',
  });
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);

  function update<K extends keyof FormState>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }));
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const nextErrors = validate(form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    const startsAt = fromDateTimeInputs(form.date, form.time);
    if (!startsAt) return;

    setSubmitting(true);
    // MOCK: adds the event to in-memory state. Becomes POST /api/events.
    const event = createEvent({
      name: form.name,
      description: form.description,
      venue: form.venue,
      startsAt,
      endsAt: new Date(new Date(startsAt).getTime() + EVENT_LENGTH_HOURS * 3600_000).toISOString(),
      capacity: Number(form.capacity),
    });
    navigate(`/organizer/events/${event.id}`, { state: { created: true }, replace: true });
  }

  const hasErrors = Object.values(errors).some(Boolean);

  return (
    <div className="page" style={{ maxWidth: 640 }}>
      <div className="pagehead">
        <div className="pagehead__title">
          <h1>Create event</h1>
          <p className="muted">Takes about a minute. You can share it right after.</p>
        </div>
      </div>

      <Card>
        <form className="stack" onSubmit={onSubmit} noValidate>
          <Field label="Event name" htmlFor="name" error={errors.name}>
            <Input
              id="name"
              value={form.name}
              invalid={Boolean(errors.name)}
              placeholder="VITSION Screening Night"
              onChange={(e) => update('name', e.target.value)}
            />
          </Field>

          <div className="row" style={{ gap: 16, alignItems: 'flex-start' }}>
            <div style={{ flex: '1 1 180px' }}>
              <Field label="Date" htmlFor="date" error={errors.date}>
                <Input
                  id="date"
                  type="date"
                  value={form.date}
                  invalid={Boolean(errors.date)}
                  onChange={(e) => update('date', e.target.value)}
                />
              </Field>
            </div>
            <div style={{ flex: '1 1 140px' }}>
              <Field
                label="Start time"
                htmlFor="time"
                error={errors.time}
                hint={`Runs for about ${EVENT_LENGTH_HOURS} hours`}
              >
                <Input
                  id="time"
                  type="time"
                  value={form.time}
                  invalid={Boolean(errors.time)}
                  onChange={(e) => update('time', e.target.value)}
                />
              </Field>
            </div>
          </div>

          <Field label="Venue" htmlFor="venue" error={errors.venue}>
            <Input
              id="venue"
              value={form.venue}
              invalid={Boolean(errors.venue)}
              placeholder="Anna Auditorium"
              onChange={(e) => update('venue', e.target.value)}
            />
          </Field>

          <Field
            label="Capacity"
            htmlFor="capacity"
            error={errors.capacity}
            hint="Registration closes when this many people are in"
          >
            <Input
              id="capacity"
              type="number"
              inputMode="numeric"
              min={1}
              value={form.capacity}
              invalid={Boolean(errors.capacity)}
              placeholder="100"
              onChange={(e) => update('capacity', e.target.value)}
            />
          </Field>

          <Field label="Short description" htmlFor="description" hint="One or two lines. Optional.">
            <Textarea
              id="description"
              value={form.description}
              placeholder="What’s happening, who it’s for, anything to bring."
              onChange={(e) => update('description', e.target.value)}
            />
          </Field>

          {hasErrors && <Banner tone="error">Check the highlighted fields and try again.</Banner>}

          <div className="row" style={{ justifyContent: 'flex-end', gap: 12 }}>
            <Link to="/organizer/events">
              <Button type="button" variant="ghost">
                Cancel
              </Button>
            </Link>
            <Button type="submit" variant="primary" loading={submitting}>
              Create event
            </Button>
          </div>
        </form>
      </Card>

      <div style={{ marginTop: 16 }}>
        <DevNote>
          The event is stored in browser memory for now, so it disappears on reload. The form already
          sends the exact shape POST /api/events will take.
        </DevNote>
      </div>
    </div>
  );
}
