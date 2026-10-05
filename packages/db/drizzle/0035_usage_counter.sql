CREATE TABLE "usage_counter" (
	"key" text PRIMARY KEY NOT NULL,
	"used" integer NOT NULL,
	"window_start" timestamp DEFAULT now() NOT NULL
);
