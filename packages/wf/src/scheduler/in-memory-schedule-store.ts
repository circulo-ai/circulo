import type {
  ScheduleDefinition,
  ScheduleLease,
  ScheduleRecord,
  ScheduleStore,
} from "../models";
import { generateId } from "../utils/id";
import { nextCronOccurrence } from "./cron";

export class InMemoryScheduleStore<
  TInput = unknown,
> implements ScheduleStore<TInput> {
  private readonly records = new Map<string, ScheduleRecord<TInput>>();
  private readonly leases = new Map<
    string,
    { owner: string; token: string; until: number }
  >();

  async upsert(
    schedule: ScheduleDefinition<TInput>,
    now = Date.now(),
  ): Promise<ScheduleRecord<TInput>> {
    const current = this.records.get(schedule.scheduleId);
    const record: ScheduleRecord<TInput> = {
      ...schedule,
      enabled: schedule.enabled ?? true,
      timeZone: schedule.timeZone ?? "UTC",
      nextRunAt:
        current?.cron === schedule.cron
          ? current.nextRunAt
          : nextCronOccurrence(schedule.cron, now - 1),
      lastRunAt: current?.lastRunAt,
      version: (current?.version ?? 0) + 1,
    };
    this.records.set(schedule.scheduleId, structuredClone(record));
    return structuredClone(record);
  }

  async get(scheduleId: string): Promise<ScheduleRecord<TInput> | null> {
    const value = this.records.get(scheduleId);
    return value ? structuredClone(value) : null;
  }

  async remove(scheduleId: string): Promise<boolean> {
    this.leases.delete(scheduleId);
    return this.records.delete(scheduleId);
  }

  async listDue(
    now: number,
    owner: string,
    limit: number,
    leaseMs: number,
  ): Promise<ScheduleLease<TInput>[]> {
    if (limit < 1 || leaseMs < 1)
      throw new RangeError("Schedule claim limits must be positive");
    const result: ScheduleLease<TInput>[] = [];
    for (const record of this.records.values()) {
      if (
        result.length >= limit ||
        record.enabled === false ||
        record.nextRunAt > now
      )
        continue;
      const existing = this.leases.get(record.scheduleId);
      if (existing && existing.until > now) continue;
      const token = generateId("schedule-lease");
      const leasedUntil = now + leaseMs;
      this.leases.set(record.scheduleId, { owner, token, until: leasedUntil });
      result.push({
        schedule: structuredClone(record),
        leaseToken: token,
        leasedUntil,
      });
    }
    return result;
  }

  async acknowledge(
    lease: ScheduleLease<TInput>,
    nextRunAt: number,
    now = Date.now(),
  ): Promise<boolean> {
    const currentLease = this.leases.get(lease.schedule.scheduleId);
    const current = this.records.get(lease.schedule.scheduleId);
    if (!currentLease || currentLease.token !== lease.leaseToken || !current)
      return false;
    current.lastRunAt = lease.schedule.nextRunAt;
    current.nextRunAt = nextRunAt;
    current.version += 1;
    this.leases.delete(lease.schedule.scheduleId);
    void now;
    return true;
  }

  async release(lease: ScheduleLease<TInput>): Promise<boolean> {
    const currentLease = this.leases.get(lease.schedule.scheduleId);
    if (!currentLease || currentLease.token !== lease.leaseToken) return false;
    this.leases.delete(lease.schedule.scheduleId);
    return true;
  }
}
