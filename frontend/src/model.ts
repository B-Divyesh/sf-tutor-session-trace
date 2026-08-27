export type MomentKind = 'attempt' | 'breakthrough' | 'handoff';
export type Outcome = 'progressing' | 'stuck' | 'solved';

export interface Moment {
  id: string;
  at: string;
  kind: MomentKind;
  outcome: Outcome;
  note: string;
  attachment?: { type: 'link' | 'code'; value: string };
  private: boolean;
}

export interface PracticeTask { id: string; text: string; done: boolean }

export interface TraceSession {
  id: string;
  student: string;
  topic: string;
  date: string;
  createdAt: string;
  summary: string;
  consent: boolean;
  moments: Moment[];
  tasks: PracticeTask[];
  share?: { id: string; url: string; deleteKey: string; expiresAt: string; opens: number };
}

export interface TraceStore { sessions: TraceSession[]; activeId?: string }

export const emptyStore = (): TraceStore => ({ sessions: [] });

export function newId(): string {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function studentRecap(session: TraceSession) {
  return {
    student_name: session.student,
    session_title: session.topic,
    session_date: session.date,
    summary: session.summary.trim(),
    moments: session.moments.filter(item => !item.private).map(({ id, at, kind, outcome, note, attachment }) => ({ id, at, kind, outcome, note, attachment })),
    next_tasks: session.tasks.map(({ id, text, done }) => ({ id, text, done }))
  };
}

export function sessionMarkdown(session: TraceSession): string {
  const visible = session.moments.filter(moment => !moment.private);
  const lines = [
    `# ${session.topic}`,
    '',
    `**Student:** ${session.student}  `,
    `**Session date:** ${session.date}`,
    '',
    '## Session note',
    '',
    session.summary.trim() || '_No overview added._',
    '',
    '## What we observed',
    ''
  ];
  if (!visible.length) lines.push('_No student-visible observations yet._', '');
  for (const item of visible) {
    lines.push(`### ${formatTime(item.at)} · ${label(item.kind)} · ${label(item.outcome)}`, '', item.note, '');
    if (item.attachment?.type === 'link') lines.push(`[Attached reference](${item.attachment.value})`, '');
    if (item.attachment?.type === 'code') lines.push('```', item.attachment.value, '```', '');
  }
  lines.push('## Next practice', '');
  if (!session.tasks.length) lines.push('_No next-practice items yet._');
  for (const task of session.tasks) lines.push(`- [${task.done ? 'x' : ' '}] ${task.text}`);
  lines.push('', '---', 'Prepared with Tutor Session Trace.');
  return lines.join('\n');
}

export const formatTime = (iso: string) => new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
export const label = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);
