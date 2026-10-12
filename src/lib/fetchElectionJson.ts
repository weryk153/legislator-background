/** 地圖與名冊共用：包含讀取回應內容的逾時，失敗交由畫面提供重試。 */
export async function fetchElectionJson<T>(url: string, timeoutMs = 15000): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json() as T;
  } catch (error) {
    if (controller.signal.aborted) throw new Error('連線逾時，請重試');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
