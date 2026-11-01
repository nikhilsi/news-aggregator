// Runs async work n at a time and stops starting new work at a deadline.
// Workers queue outbound connections past six, and a timer set at call time
// would run while queued, so each piece of work starts its own timer only
// when the pool hands it out (review R7).

export async function pool<T, R>(
  items: readonly T[],
  n: number,
  deadline: number,
  fn: (item: T) => Promise<R>,
): Promise<Map<T, R>> {
  const out = new Map<T, R>();
  const queue = [...items];
  const worker = async () => {
    for (let t = queue.shift(); t !== undefined && Date.now() < deadline; t = queue.shift()) {
      out.set(t, await fn(t));
    }
  };
  const all = Promise.all(Array.from({ length: Math.min(n, queue.length) }, worker));
  let timer: ReturnType<typeof setTimeout> | null = null;
  const late = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, Math.max(0, deadline - Date.now()));
  });
  await Promise.race([all, late]);
  if (timer !== null) clearTimeout(timer);
  // A copy, so work that finishes after the deadline does not change the result.
  return new Map(out);
}
