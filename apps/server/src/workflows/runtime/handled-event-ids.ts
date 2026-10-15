/** Publish one shared set before asynchronous handlers can overlap. */
export function getHandledEventIds(
  store: Map<string, Set<string>>,
  runId: string,
) {
  let ids = store.get(runId);
  if (!ids) {
    ids = new Set<string>();
    store.set(runId, ids);
  }
  return ids;
}
