export interface MatchInput { candidateName: string; text: string; }
export interface MatchTarget { name: string; keywords: string[]; aliases: string[]; }

// Returns a 0–1 confidence and the signals that fired. Name-only is deliberately
// low because Taiwanese names collide; corroborating keywords are required for a
// high score. Judgments are NEVER auto-published regardless of score — a human
// confirms identity in the review file.
export function scoreMatch(c: MatchInput, t: MatchTarget): { confidence: number; signals: string[] } {
  const signals: string[] = [];
  let score = 0;

  const names = [t.name, ...t.aliases].filter(Boolean);
  if (names.some((n) => c.candidateName === n)) {
    signals.push('name-exact');
    score += 0.4;
  } else if (names.some((n) => c.candidateName.includes(n) || n.includes(c.candidateName))) {
    signals.push('name-partial');
    score += 0.2;
  } else {
    return { confidence: 0, signals: [] }; // no name match → not a candidate
  }

  for (const k of t.keywords) {
    if (k && c.text.includes(k)) {
      signals.push(`keyword:${k}`);
      score += 0.2;
    }
  }

  return { confidence: Math.min(1, score), signals };
}
