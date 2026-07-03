ALTER TABLE "action_events" ADD CONSTRAINT "action_events_actor_type_valid" CHECK ("action_events"."actor_type" in ('CUSTOMER', 'AGENT', 'REVIEWER', 'SYSTEM'));--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_total_amount_positive" CHECK ("orders"."total_amount" > 0);--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_amount_positive" CHECK ("refunds"."amount" > 0);--> statement-breakpoint
ALTER TABLE "support_requests" ADD CONSTRAINT "support_requests_message_length" CHECK (length("support_requests"."message") between 3 and 2000);