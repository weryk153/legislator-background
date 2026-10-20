import { writable } from 'svelte/store';
import { isReactionState, type ReactionChoice, type ReactionState } from './reactions';

interface ViewState { data: ReactionState | null; pending: boolean; error: string }
const entries = new Map<string, ReturnType<typeof createEntry>>();
let session: Promise<void> | null = null;

async function responseData(response: Response): Promise<unknown> {
  let data: any;
  try { data = await response.json(); } catch { throw new Error('暫時無法讀取票數，請稍後再試。'); }
  if (!response.ok) throw new Error(typeof data?.error === 'string' ? data.error : '表態功能暫時無法使用。');
  return data;
}
function ensureSession(): Promise<void> {
  if (!session) {
    const initialize = () => fetch('/api/reactions', { credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(12_000) })
      .then(responseData).then(() => undefined)
      .catch(error => { session = null; throw error; });
    // 同瀏覽器同時開兩頁時也只會建立一份 cookie。
    session = typeof navigator !== 'undefined' && navigator.locks
      ? navigator.locks.request('civic-reaction-session', initialize) : initialize();
  }
  return session;
}
function createEntry(candidate: string) {
  const store = writable<ViewState>({ data: null, pending: false, error: '' });
  let data: ReactionState | null = null;
  let busy: Promise<void> | null = null;
  let lastRead = 0;
  const endpoint = `/api/reactions?candidate=${encodeURIComponent(candidate)}`;
  function run(choice?: ReactionChoice): Promise<void> {
    if (busy) return busy;
    store.set({ data, pending: true, error: '' });
    busy = (async () => {
      try {
        await ensureSession();
        const result = await responseData(await fetch(endpoint, {
          credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(12_000),
          ...(choice !== undefined ? {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ choice }),
          } : {}),
        }));
        if (!isReactionState(result)) throw new Error('票數格式有誤，請稍後再試。');
        data = result;
        lastRead = Date.now();
        store.set({ data, pending: false, error: '' });
        if (choice !== undefined && typeof BroadcastChannel !== 'undefined') {
          const channel = new BroadcastChannel('civic-reactions');
          channel.postMessage(candidate);
          channel.close();
        }
      } catch (error) {
        const message = error instanceof TypeError || (error instanceof DOMException && /Timeout|Abort/.test(error.name))
          ? '連線逾時或中斷，請稍後重試。' : error instanceof Error ? error.message : '連線失敗，請稍後再試。';
        store.set({ data, pending: false, error: message });
      } finally { busy = null; }
    })();
    return busy;
  }
  return {
    subscribe: store.subscribe,
    refresh: (force = false) => force || Date.now() - lastRead > 10_000 ? run() : Promise.resolve(),
    choose: (choice: -1 | 1) => run(data?.choice === choice ? 0 : choice),
  };
}
export function reactionStore(candidate: string) {
  let entry = entries.get(candidate);
  if (!entry) { entry = createEntry(candidate); entries.set(candidate, entry); }
  return entry;
}
