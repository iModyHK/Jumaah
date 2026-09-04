import type { LiveKhutbah, LiveSessionSnapshot, SectionType, SessionCommand } from '@jumaah/shared';

/** Index of the current paragraph in the cached khutbah (falls back to `currentIndex`). */
export function indexOfParagraph(snap: LiveSessionSnapshot | null, k: LiveKhutbah | null): number {
  if (!snap || !k || k.paragraphs.length === 0) return 0;
  const i = k.paragraphs.findIndex((p) => p.id === snap.currentParagraphId);
  if (i >= 0) return i;
  return Math.min(Math.max(snap.currentIndex, 0), k.paragraphs.length - 1);
}

export function isSessionActive(snap: LiveSessionSnapshot | null): boolean {
  return !!snap && !!snap.sessionId && snap.state !== 'ENDED' && snap.state !== 'WAITING';
}

export function hasSection(k: LiveKhutbah | null, type: SectionType): boolean {
  if (!k) return false;
  if (k.sections.some((s) => s.type === type && s.paragraphCount > 0)) return true;
  return k.paragraphs.some((p) => p.sectionType === type);
}

/** Sum of `estimatedSeconds` for every paragraph after `index`. */
export function remainingSeconds(k: LiveKhutbah | null, index: number): number {
  if (!k) return 0;
  let total = 0;
  for (let i = index + 1; i < k.paragraphs.length; i++) total += k.paragraphs[i].estimatedSeconds;
  return total;
}

/**
 * Local mirror of the server's `applyCommand` (apps/api/src/services/session.service.ts).
 * Used to render commands optimistically while they wait for a server ack. Does NOT bump `seq`
 * so any later server snapshot is still accepted as authoritative.
 */
export function applyLocal(snap: LiveSessionSnapshot, k: LiveKhutbah, cmd: SessionCommand): LiveSessionSnapshot {
  if (!snap.sessionId || snap.state === 'ENDED' || !snap.khutbahId) return snap;
  const paragraphs = k.paragraphs;
  if (paragraphs.length === 0) return snap;
  const idx = indexOfParagraph(snap, k);
  const next: LiveSessionSnapshot = { ...snap };
  const nowIso = new Date().toISOString();

  const goto = (i: number) => {
    const clamped = Math.min(Math.max(i, 0), paragraphs.length - 1);
    const p = paragraphs[clamped];
    next.currentIndex = clamped;
    next.currentParagraphId = p.id;
    if (p.sectionType !== next.currentSection) {
      next.currentSection = p.sectionType;
      next.sectionStartedAt = nowIso;
    }
    if (next.state === 'PAUSED' || next.state === 'IMPROV') next.state = 'LIVE';
  };

  switch (cmd.type) {
    case 'next':
      goto(idx + 1);
      break;
    case 'prev':
      goto(idx - 1);
      break;
    case 'goto': {
      const i = paragraphs.findIndex((p) => p.id === cmd.paragraphId);
      if (i === -1) return snap;
      goto(i);
      break;
    }
    case 'section': {
      const i = paragraphs.findIndex((p) => p.sectionType === cmd.section);
      if (i === -1) return snap;
      goto(i);
      break;
    }
    case 'pause':
      next.state = 'PAUSED';
      break;
    case 'resume':
      next.state = 'LIVE';
      break;
    case 'improv':
      next.state = next.state === 'IMPROV' ? 'LIVE' : 'IMPROV';
      break;
    case 'autoAdvance':
      next.autoAdvance = cmd.enabled;
      break;
    case 'end':
      next.state = 'ENDED';
      break;
  }
  next.updatedAt = nowIso;
  return next;
}
