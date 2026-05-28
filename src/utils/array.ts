export function chunk<T>(items: T[], size: number): T[][] {
  const output: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    output.push(items.slice(i, i + size));
  }
  return output;
}

export function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

export function uniquePathArrays(paths: string[][]): string[][] {
  const seen = new Set<string>();
  const output: string[][] = [];

  for (const item of paths) {
    const key = item.join(">");
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(item);
  }

  return output;
}

export async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  const queue = items.map((item, index) => ({ item, index }));
  let next = 0;

  async function worker(): Promise<void> {
    while (next < queue.length) {
      const { item, index } = queue[next++]!;
      results[index] = await fn(item);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
