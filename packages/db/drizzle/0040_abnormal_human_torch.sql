ALTER TABLE "neighborhoods" ADD COLUMN "aliases" text[] DEFAULT '{}'::text[] NOT NULL;
--> statement-breakpoint
-- Sector aliases and the first batch of new Distrito Nacional sectors (packages/db/src/sectors.ts is the
-- same list; sectors.test.ts keeps the two in step). Idempotent: a slug that exists is left alone.
UPDATE "neighborhoods" SET "aliases" = '{"Ensanche Naco"}' WHERE "slug" = 'naco' AND "aliases" = '{}';
--> statement-breakpoint
INSERT INTO "neighborhoods" ("slug", "name", "lat", "lng", "radius_m", "aliases") VALUES
  ('la-esperilla', 'La Esperilla', 18.4681, -69.9232, 900, '{}'),
  ('ensanche-quisqueya', 'Ensanche Quisqueya', 18.4674, -69.9404, 520, '{}'),
  ('paraiso', 'Paraíso', 18.4797, -69.9401, 400, '{"Ensanche Paraíso"}'),
  ('julieta-morales', 'Julieta Morales', 18.4748, -69.947, 490, '{}'),
  ('el-millon', 'El Millón', 18.458, -69.9568, 470, '{}'),
  ('ciudad-universitaria', 'Ciudad Universitaria', 18.4573, -69.9165, 950, '{"Zona Universitaria"}'),
  ('arroyo-hondo', 'Arroyo Hondo', 18.4844, -69.9355, 400, '{"Viejo Arroyo Hondo"}'),
  ('la-julia', 'La Julia', 18.4621, -69.9305, 400, '{}'),
  ('los-prados', 'Los Prados', 18.4736, -69.9565, 400, '{}'),
  ('mirador-norte', 'Mirador Norte', 18.4495, -69.9584, 400, '{}'),
  ('ensanche-la-fe', 'Ensanche La Fe', 18.4863, -69.9301, 400, '{}'),
  ('ciudad-nueva', 'Ciudad Nueva', 18.4665, -69.8914, 400, '{}'),
  ('los-jardines', 'Los Jardines', 18.4831, -69.9541, 400, '{}'),
  ('los-restauradores', 'Los Restauradores', 18.4595, -69.9619, 400, '{}')
ON CONFLICT ("slug") DO NOTHING;
