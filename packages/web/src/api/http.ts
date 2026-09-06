/**
 * Thin HTTP helper for same-origin API calls (Vite proxies /api and /health).
 * @param path - Absolute path beginning with `/`
 * @param init - Optional fetch init (method, headers, body)
 * @returns Parsed JSON body as T
 * @throws Error when response is not ok (includes status text)
 */
export async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `HTTP ${res.status} ${path}`);
  }
  return (await res.json()) as T;
}

/**
 * Like apiJson but treats HTTP 202 as success (invoke / stream-echo).
 * @param path - Absolute path
 * @param init - Optional fetch init
 * @returns Parsed JSON when status is 2xx including 202
 */
export async function apiJsonAccept202<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  if (!res.ok && res.status !== 202) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `HTTP ${res.status} ${path}`);
  }
  return (await res.json()) as T;
}
