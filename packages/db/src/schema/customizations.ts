import { boolean, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const userCustomizations = pgTable('user_customizations', {
  userId: text('user_id').primaryKey(),
  prompt: text('prompt').notNull(),
  allowDataTraining: boolean('allow_data_training').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});
