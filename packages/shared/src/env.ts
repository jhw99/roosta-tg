import { z } from 'zod';

/** Full env schema. Apps may pick subsets via `.partial()` or build their own. */
export const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.string().default('info'),

  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_BOT_MODE: z.enum(['polling', 'webhook']).default('polling'),
  TELEGRAM_WEBHOOK_URL: z.string().url().optional(),
  TELEGRAM_WEBHOOK_SECRET: z.string().optional(),

  TON_NETWORK: z.enum(['testnet', 'mainnet']).default('testnet'),
  TON_FACTORY_ADDRESS: z.string().optional(),
  TON_API_ENDPOINT: z.string().url().optional(),
  TON_API_KEY: z.string().optional(),

  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  SUPABASE_ANON_KEY: z.string().optional(),

  REDIS_URL: z.string().default('redis://localhost:6379'),
  SENTRY_DSN: z.string().optional(),

  PORT: z.coerce.number().int().default(3001),
  BACKEND_PORT: z.coerce.number().int().optional(),

  WALLET_MNEMONIC: z.string().optional(),
  /** Shared bearer for bot→backend service-to-service calls. */
  SERVICE_TOKEN: z.string().optional(),
  KYE_CODE_HEX: z.string().optional(),
  TMA_URL: z.string().url().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    throw new Error(`Invalid environment: ${parsed.error.message}`);
  }
  return parsed.data;
}
