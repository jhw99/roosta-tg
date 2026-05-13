import type { SupabaseClient } from '@supabase/supabase-js';
import type { Queue } from 'bullmq';
import { logger } from '../lib/logger.js';
import { getSupabase } from '../lib/supabase.js';
import type { NotificationJob } from './worker.js';

export interface ReminderJobInput {
  type: 'round_reminder_24h' | 'round_reminder_1h';
  roundId: string;
  kyeId: string;
  scheduledAt: number;
  contribution: string;
  memberUserIds: string[];
}

export interface ReminderScannerOpts {
  supabase?: SupabaseClient | null;
  notificationQueue: Pick<Queue<NotificationJob>, 'add'>;
  /** Override current time for tests. */
  now?: () => Date;
}

/**
 * Find rounds whose `scheduled_at` is in the (now+23h, now+25h) window
 * (or (now+0:55, now+1:05) for 1h reminders) and enqueue jobs for all
 * members, recording in `sent_reminders` for idempotency.
 *
 * Returns the number of jobs enqueued.
 */
export class ReminderScanner {
  private readonly supabase: SupabaseClient | null;
  private readonly notificationQueue: Pick<Queue<NotificationJob>, 'add'>;
  private readonly now: () => Date;

  constructor(opts: ReminderScannerOpts) {
    this.supabase = opts.supabase !== undefined ? opts.supabase : getSupabase();
    this.notificationQueue = opts.notificationQueue;
    this.now = opts.now ?? (() => new Date());
  }

  async run(): Promise<{ enqueued: number }> {
    if (!this.supabase) return { enqueued: 0 };
    const now = this.now();
    let total = 0;
    total += await this.scanWindow('round_reminder_24h', now, 23 * 3600, 25 * 3600);
    total += await this.scanWindow('round_reminder_1h', now, 55 * 60, 65 * 60);
    return { enqueued: total };
  }

  private async scanWindow(
    type: 'round_reminder_24h' | 'round_reminder_1h',
    now: Date,
    fromSec: number,
    toSec: number,
  ): Promise<number> {
    if (!this.supabase) return 0;
    const fromIso = new Date(now.getTime() + fromSec * 1000).toISOString();
    const toIso = new Date(now.getTime() + toSec * 1000).toISOString();
    const { data: rounds, error } = await this.supabase
      .from('rounds')
      .select('id, kye_id, scheduled_at, kyes(params, status)')
      .gte('scheduled_at', fromIso)
      .lte('scheduled_at', toIso)
      .is('executed_at', null);
    if (error) {
      logger.warn({ err: error.message }, 'scanWindow query failed');
      return 0;
    }

    let enqueued = 0;
    for (const r of (rounds ?? []) as unknown as Array<{
      id: string;
      kye_id: string;
      scheduled_at: string;
      kyes?:
        | { params?: { contribution?: string | number }; status?: string }
        | { params?: { contribution?: string | number }; status?: string }[];
    }>) {
      const kyeRel = Array.isArray(r.kyes) ? r.kyes[0] : r.kyes;
      if (kyeRel?.status && kyeRel.status !== 'active') continue;
      // Idempotency: skip if already sent for this round+type.
      const { data: existing } = await this.supabase
        .from('sent_reminders')
        .select('round_id')
        .eq('round_id', r.id)
        .eq('type', type)
        .maybeSingle();
      if (existing) continue;

      const { data: members } = await this.supabase
        .from('kye_members')
        .select('user_id')
        .eq('kye_id', r.kye_id);

      const memberIds = (members ?? []).map((m) => (m as { user_id: string }).user_id);
      const scheduledTs = Math.floor(new Date(r.scheduled_at).getTime() / 1000);
      const contribution = String(kyeRel?.params?.contribution ?? '');

      for (const uid of memberIds) {
        await this.notificationQueue.add(
          type,
          {
            recipientUserId: uid,
            eventType: type,
            channel: 'dm',
            kyeId: r.kye_id,
            payload: {
              kyeId: r.kye_id,
              roundId: r.id,
              scheduledAt: scheduledTs,
              contribution,
            },
          },
          {
            // Deterministic jobId for extra defense against duplicates.
            jobId: `${type}:${r.id}:${uid}`,
          },
        );
        enqueued++;
      }

      // Record so we don't re-enqueue.
      await this.supabase
        .from('sent_reminders')
        .insert({ round_id: r.id, type, sent_at: new Date().toISOString() });
    }
    return enqueued;
  }
}
