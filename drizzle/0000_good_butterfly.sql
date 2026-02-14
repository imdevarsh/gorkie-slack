CREATE TABLE "sandbox_sessions" (
	"thread_id" text PRIMARY KEY NOT NULL,
	"channel_id" text NOT NULL,
	"sandbox_id" text NOT NULL,
	"session_id" text NOT NULL,
	"preview_url" text,
	"preview_token" text,
	"preview_expires_at" timestamp with time zone,
	"status" text DEFAULT 'creating' NOT NULL,
	"paused_at" timestamp with time zone,
	"resumed_at" timestamp with time zone,
	"destroyed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "sandbox_sessions_status_idx" ON "sandbox_sessions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "sandbox_sessions_paused_idx" ON "sandbox_sessions" USING btree ("paused_at");--> statement-breakpoint
CREATE INDEX "sandbox_sessions_updated_idx" ON "sandbox_sessions" USING btree ("updated_at");