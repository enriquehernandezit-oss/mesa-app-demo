-- Rankings saved before the occasion vocabulary became Spanish still carry the English tags ("Date Night",
-- "Group Dinner"...). Explore's occasion filter matches the stored value exactly, so those places never
-- turned up under "Cena romántica" or "Cena en grupo" — only "Solo", spelled the same in both, did. Rewrite
-- them once to the Spanish the app writes today (packages/db/src/seed-extra.ts LEGACY_TAG_ES). Order is
-- kept and a tag that would appear twice is kept once. Idempotent: rows without an English tag are untouched.
UPDATE "rankings" SET "tags" = (
  SELECT array_agg(s.tag ORDER BY s.first_at)
  FROM (
    SELECT
      CASE u.tag
        WHEN 'Date Night' THEN 'Cena romántica'
        WHEN 'Special Occasion' THEN 'Ocasión especial'
        WHEN 'Group Dinner' THEN 'Cena en grupo'
        WHEN 'Outdoor' THEN 'Al aire libre'
        WHEN 'Fine Dining' THEN 'Alta cocina'
        WHEN 'Casual' THEN 'Informal'
        WHEN 'Late Night' THEN 'Trasnoche'
        ELSE u.tag
      END AS tag,
      min(u.ord) AS first_at
    FROM unnest("rankings"."tags") WITH ORDINALITY AS u(tag, ord)
    GROUP BY 1
  ) s
)
WHERE "tags" && ARRAY['Date Night','Special Occasion','Group Dinner','Outdoor','Fine Dining','Casual','Late Night']::text[];
