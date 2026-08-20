import { useState, type FormEvent } from 'react';
import { ApiError, api } from '../lib/api';
import { formatTime } from '../lib/format';
import type { InsightAnswer } from '../lib/types';
import { Badge, Button, Card, Input } from './ui';

/**
 * "Ask about this event" — plain-English questions answered from figures the
 * server computed. The answer always arrives: if the model is unreachable the
 * server sends the same numbers as plain text, marked so the organizer knows
 * which they are looking at.
 */

const SUGGESTIONS = [
  'How many people have checked in so far?',
  'What percentage of registered attendees are no-shows?',
  'What time did check-ins peak?',
  'How many spots are left?',
];

export function InsightsCard({ eventId }: { eventId: string }) {
  const [question, setQuestion] = useState('');
  const [result, setResult] = useState<InsightAnswer | null>(null);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ask(text: string) {
    const trimmed = text.trim();
    if (!trimmed || asking) return;

    setAsking(true);
    setError(null);
    try {
      setResult(await api.insights(eventId, trimmed));
    } catch (caught) {
      setResult(null);
      setError(
        caught instanceof ApiError ? caught.message : 'We couldn’t answer that just now.',
      );
    } finally {
      setAsking(false);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void ask(question);
  }

  return (
    <Card>
      <div className="spread" style={{ marginBottom: 12 }}>
        <h3>Ask about this event</h3>
        {result?.source === 'fallback' && <Badge tone="warn">Raw numbers</Badge>}
      </div>

      <form className="row" style={{ gap: 8, flexWrap: 'nowrap' }} onSubmit={onSubmit}>
        <Input
          aria-label="Ask a question about this event"
          placeholder="How many people have checked in?"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
        />
        <Button type="submit" variant="primary" loading={asking} disabled={!question.trim()}>
          Ask
        </Button>
      </form>

      <div className="row" style={{ gap: 6, marginTop: 10 }}>
        {SUGGESTIONS.map((suggestion) => (
          <Button
            key={suggestion}
            size="sm"
            variant="ghost"
            disabled={asking}
            onClick={() => {
              setQuestion(suggestion);
              void ask(suggestion);
            }}
          >
            {suggestion}
          </Button>
        ))}
      </div>

      {asking && (
        <div className="row" style={{ gap: 10, marginTop: 16 }} role="status">
          <span className="spinner" aria-hidden="true" />
          <span className="muted" style={{ fontSize: '0.9rem' }}>
            Reading the numbers for this event…
          </span>
        </div>
      )}

      {error && !asking && (
        <div className="banner banner--error" style={{ marginTop: 16 }} role="alert">
          {error}
        </div>
      )}

      {result && !asking && (
        <div style={{ marginTop: 16 }}>
          <p style={{ fontSize: '0.98rem' }}>{result.answer}</p>

          {result.source === 'fallback' && (
            <p className="muted" style={{ fontSize: '0.8rem', marginTop: 8 }}>
              {result.fallbackReason === 'not_configured'
                ? 'No AI key is configured, so these are the raw figures from the database.'
                : result.fallbackReason === 'timeout'
                  ? 'The AI took too long, so these are the raw figures from the database.'
                  : 'The AI is unavailable, so these are the raw figures from the database.'}
            </p>
          )}

          {/* What the answer was based on — the organizer can check the maths. */}
          <div className="row" style={{ gap: 6, marginTop: 12 }}>
            <Badge tone="outline">{result.facts.checkedInCount} checked in</Badge>
            <Badge tone="outline">{result.facts.registeredCount} registered</Badge>
            <Badge tone="outline">{result.facts.noShowCount} no-shows</Badge>
            <Badge tone="outline">{result.facts.spotsLeft} spots left</Badge>
            {result.facts.peakWindow && (
              <Badge tone="outline">peak {formatTime(result.facts.peakWindow.startsAt)}</Badge>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
