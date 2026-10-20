export type ReactionChoice = -1 | 0 | 1;
export interface ReactionState {
  support: number;
  oppose: number;
  choice: ReactionChoice;
}

export const isReactionChoice = (value: unknown): value is ReactionChoice =>
  value === -1 || value === 0 || value === 1;

export function isReactionState(value: unknown): value is ReactionState {
  if (!value || typeof value !== 'object') return false;
  const v = value as ReactionState;
  return Number.isSafeInteger(v.support) && v.support >= 0
    && Number.isSafeInteger(v.oppose) && v.oppose >= 0
    && isReactionChoice(v.choice);
}
