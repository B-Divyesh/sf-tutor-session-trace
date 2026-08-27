import { describe, expect, it } from 'vitest';
import { sessionMarkdown, studentRecap, type TraceSession } from './model';

const session: TraceSession = {
  id: 'one', student: 'Mina', topic: 'Recursive trees', date: '2026-08-27', createdAt: '2026-08-27T10:00:00Z', summary: 'Clear base cases first.', consent: true,
  moments: [
    { id: 'a', at: '2026-08-27T10:02:00Z', kind: 'attempt', outcome: 'stuck', note: 'Public observation', private: false },
    { id: 'b', at: '2026-08-27T10:03:00Z', kind: 'handoff', outcome: 'progressing', note: 'Tutor-only note', private: true }
  ],
  tasks: [{ id: 't', text: 'Trace two calls', done: false }]
};

describe('recaps', () => {
  it('never exposes private tutor observations', () => {
    const recap = studentRecap(session);
    expect(recap.moments).toHaveLength(1);
    expect(JSON.stringify(recap)).not.toContain('Tutor-only');
  });

  it('produces portable markdown with practice tasks', () => {
    const markdown = sessionMarkdown(session);
    expect(markdown).toContain('# Recursive trees');
    expect(markdown).toContain('- [ ] Trace two calls');
    expect(markdown).not.toContain('Tutor-only');
  });
});
