export async function withTimeout<T>(action: () => Promise<T>, milliseconds = 1000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(action),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          const error = new Error('Operation timed out');
          error.name = 'TimeoutError';
          reject(error);
        }, milliseconds);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

// Optional caches must not discard a successful upstream response.
export async function readCache<T>(action: () => Promise<T>): Promise<T | null> {
  try { return await withTimeout(action); }
  catch { console.warn('Cache read unavailable; continuing without cache'); return null; }
}

export async function writeCache(action: () => Promise<void>): Promise<void> {
  try { await withTimeout(action); }
  catch { console.warn('Cache write unavailable; preserving fresh result'); }
}
