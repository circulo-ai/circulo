export type SyncVersion = {
  updatedAt: Date;
  deviceId: string;
  idempotencyKey: string;
};

/** Compare timestamp first, then stable device/key tie-breakers. */
export function compareSyncVersions(left: SyncVersion, right: SyncVersion) {
  const timeDifference = left.updatedAt.getTime() - right.updatedAt.getTime();
  if (timeDifference !== 0) return timeDifference;
  const deviceDifference = left.deviceId.localeCompare(right.deviceId);
  if (deviceDifference !== 0) return deviceDifference;
  return left.idempotencyKey.localeCompare(right.idempotencyKey);
}

export function incomingSyncVersionWins(
  incoming: SyncVersion,
  current: SyncVersion,
) {
  return compareSyncVersions(incoming, current) > 0;
}
