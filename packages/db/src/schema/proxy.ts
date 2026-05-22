import { index, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const proxyTokens = pgTable(
  'proxy_tokens',
  {
    token: text('token').primaryKey(),
    sandboxId: text('sandbox_id').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('proxy_tokens_sandbox_idx').on(table.sandboxId),
    index('proxy_tokens_expires_idx').on(table.expiresAt),
  ]
);

export type ProxyToken = typeof proxyTokens.$inferSelect;
export type NewProxyToken = typeof proxyTokens.$inferInsert;
