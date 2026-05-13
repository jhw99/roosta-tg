import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '../lib/logger.js';
import { getSupabase } from '../lib/supabase.js';
import { sendMessage } from './botApi.js';
import { renderTemplate, settingDefault, settingKeyFor, type Locale } from './templates.js';

export interface NotificationJob {
  recipientUserId: string;
  eventType: string;
  channel: 'dm' | 'group';
  payload: Record<string, unknown>;
  locale?: Locale;
  /** When channel === 'group', dispatches to this kye's group chat. */
  kyeId?: string;
}

export interface NotificationWorkerOptions {
  redisUrl?: string;
  botToken: string;
  tmaUrl?: string;
  supabase?: SupabaseClient | null;
  /** When true, do not spawn a BullMQ worker — `process()` may be called directly. */
  manual?: boolean;
}

export type DispatchResult =
  | { kind: 'skipped'; reason: string }
  | { kind: 'sent'; messages: number }
  | { kind: 'rate_limited'; retryAfter: number }
  | { kind: 'failed'; reason: string };

/**
 * Notification worker consuming jobs enqueued by the indexer & scheduled
 * reminders. Resolves recipient → applies setting filter → renders template
 * → calls Telegram Bot API.
 */
export class NotificationDispatcher {
  private readonly supabase: SupabaseClient | null;
  private readonly botToken: string;
  private readonly tmaUrl: string | undefined;

  constructor(opts: { supabase?: SupabaseClient | null; botToken: string; tmaUrl?: string }) {
    this.supabase = opts.supabase !== undefined ? opts.supabase : getSupabase();
    this.botToken = opts.botToken;
    this.tmaUrl = opts.tmaUrl;
  }

  /** Process a single notification job. */
  async process(job: NotificationJob): Promise<DispatchResult> {
    // Resolve recipient.
    const user = await this.loadUser(job.recipientUserId);
    if (!user) return { kind: 'skipped', reason: 'user_not_found' };

    const locale: Locale = job.locale ?? user.language;

    // Apply notification settings filter.
    const settingKey = settingKeyFor(job.eventType);
    if (settingKey) {
      const enabled = await this.loadSetting(user.id, settingKey);
      if (!enabled) return { kind: 'skipped', reason: 'setting_off' };
    }

    // Resolve template.
    const tpl = renderTemplate(job.eventType, locale, job.payload, this.tmaUrl);
    if (!tpl) return { kind: 'skipped', reason: 'no_template' };

    // Resolve dispatch targets.
    let chatIds: number[] = [];
    let fallbackUsed = false;
    if (job.channel === 'group') {
      const groupId = job.kyeId ? await this.resolveGroupChatId(job.kyeId) : null;
      if (groupId !== null) {
        chatIds = [groupId];
      } else if (job.kyeId) {
        // Fall back to DM-ing every member.
        chatIds = await this.resolveAllMemberChatIds(job.kyeId);
        fallbackUsed = true;
      } else {
        chatIds = [Number(user.telegram_id)];
      }
    } else {
      chatIds = [Number(user.telegram_id)];
    }

    if (chatIds.length === 0) return { kind: 'skipped', reason: 'no_chat_ids' };

    // Send.
    let sent = 0;
    let retryAfter: number | undefined;
    for (const chatId of chatIds) {
      await this.incrementAttempt(user.id);
      const res = await sendMessage(this.botToken, {
        chatId,
        text: tpl.text,
        buttons: tpl.buttons,
      });
      if (res.ok) {
        await this.markSent(user.id);
        sent++;
      } else if (res.status === 429 && res.retryAfter) {
        retryAfter = Math.max(retryAfter ?? 0, res.retryAfter);
      } else {
        await this.markFailed(user.id);
      }
    }

    if (retryAfter !== undefined && sent === 0) {
      return { kind: 'rate_limited', retryAfter };
    }
    if (sent === 0) return { kind: 'failed', reason: 'all_targets_failed' };
    logger.info(
      { event: job.eventType, sent, fallbackUsed, channel: job.channel },
      'notification dispatched',
    );
    return { kind: 'sent', messages: sent };
  }

  // ---------------- DB helpers ----------------

  private async loadUser(
    userId: string,
  ): Promise<{ id: string; telegram_id: number; language: Locale } | null> {
    if (!this.supabase) return null;
    const { data, error } = await this.supabase
      .from('users')
      .select('id, telegram_id, language')
      .eq('id', userId)
      .maybeSingle();
    if (error || !data) return null;
    const lang = (data.language as string) === 'ko' ? 'ko' : 'en';
    return {
      id: data.id as string,
      telegram_id: Number(data.telegram_id),
      language: lang,
    };
  }

  private async loadSetting(userId: string, key: string): Promise<boolean> {
    if (!this.supabase) return settingDefault(key);
    const { data, error } = await this.supabase
      .from('notification_settings')
      .select('value')
      .eq('user_id', userId)
      .eq('key', key)
      .maybeSingle();
    if (error || !data) return settingDefault(key);
    return Boolean(data.value);
  }

  private async resolveGroupChatId(kyeId: string): Promise<number | null> {
    if (!this.supabase) return null;
    const { data } = await this.supabase
      .from('kye_groups')
      .select('chat_id')
      .eq('kye_id', kyeId)
      .maybeSingle();
    if (!data || data.chat_id === null || data.chat_id === undefined) return null;
    return Number(data.chat_id);
  }

  private async resolveAllMemberChatIds(kyeId: string): Promise<number[]> {
    if (!this.supabase) return [];
    const { data } = await this.supabase
      .from('kye_members')
      .select('user_id, users(telegram_id)')
      .eq('kye_id', kyeId);
    if (!data) return [];
    const out: number[] = [];
    for (const row of data as Array<{ users?: { telegram_id?: number | string } }>) {
      const t = row.users?.telegram_id;
      if (t !== undefined && t !== null) out.push(Number(t));
    }
    return out;
  }

  private async incrementAttempt(userId: string): Promise<void> {
    if (!this.supabase) return;
    try {
      await this.supabase.rpc('increment_notification_attempt_by_user', { p_user_id: userId });
    } catch {
      /* best-effort */
    }
  }

  private async markSent(_userId: string): Promise<void> {
    // Best-effort; the indexer already persists per-event notifications rows.
  }

  private async markFailed(_userId: string): Promise<void> {
    // Best-effort; failure is logged.
  }
}

/** Construct a BullMQ worker bound to a NotificationDispatcher. */
export function createNotificationWorker(opts: NotificationWorkerOptions): {
  worker: Worker<NotificationJob>;
  queue: Queue<NotificationJob>;
  dispatcher: NotificationDispatcher;
  close: () => Promise<void>;
} {
  const redisUrl = opts.redisUrl ?? process.env.REDIS_URL ?? 'redis://localhost:6379';
  const connection = new IORedis(redisUrl, {
    maxRetriesPerRequest: null,
    lazyConnect: true,
  });
  const queue = new Queue<NotificationJob>('notification_queue', { connection });
  const dispatcher = new NotificationDispatcher({
    supabase: opts.supabase,
    botToken: opts.botToken,
    tmaUrl: opts.tmaUrl,
  });

  const worker = new Worker<NotificationJob>(
    'notification_queue',
    async (job) => {
      const result = await dispatcher.process(job.data);
      if (result.kind === 'rate_limited') {
        // Re-enqueue with a delay.
        await queue.add(job.name, job.data, { delay: result.retryAfter * 1000 });
        return result;
      }
      if (result.kind === 'failed') throw new Error(result.reason);
      return result;
    },
    { connection, autorun: !opts.manual },
  );

  worker.on('failed', (job, err) => {
    logger.warn({ jobId: job?.id, err: err?.message }, 'notification job failed');
  });

  return {
    worker,
    queue,
    dispatcher,
    close: async () => {
      await worker.close();
      await queue.close();
      await connection.quit().catch(() => undefined);
    },
  };
}
