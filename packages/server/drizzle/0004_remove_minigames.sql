-- The minigames, Spelhallen and Rallyvärlden were removed on 2026-11-01 (PLAN.md, milestone M1).
-- This drops only what they left in the saves: a player's scores, tickets and found games (the "arcade" key),
-- their garage (the "garage" key), the minigame counters in "stats", the minigame achievements (the stars they
-- gave are kept), the TV and the prize items in bags, chests and on the ground, the TV, the rally garage and
-- Spelhallen's front as world objects, and the saved insides of Spelhallen. Nothing else is touched.

UPDATE "players" SET "data" = "data" - 'arcade' - 'garage' WHERE "data" ? 'arcade' OR "data" ? 'garage';
--> statement-breakpoint
UPDATE "players" SET "data" = jsonb_set("data", '{stats}', ("data"->'stats') - ARRAY['arcade', 'tickets', 'carts', 'prizes', 'rallyRaces', 'rallyWins', 'rallyStyle', 'rallyCoins'])
WHERE jsonb_typeof("data"->'stats') = 'object' AND ("data"->'stats') ?| ARRAY['arcade', 'tickets', 'carts', 'prizes', 'rallyRaces', 'rallyWins', 'rallyStyle', 'rallyCoins'];
--> statement-breakpoint
UPDATE "players" SET "data" = jsonb_set("data", '{achievements}', COALESCE((SELECT jsonb_agg(a ORDER BY i) FROM jsonb_array_elements("data"->'achievements') WITH ORDINALITY t(a, i) WHERE a #>> '{}' NOT IN ('arcade_1', 'arcade_25', 'tickets_200', 'rally_1', 'rally_wins_10', 'rally_style', 'rally_coins_100')), '[]'::jsonb))
WHERE jsonb_typeof("data"->'achievements') = 'array' AND EXISTS (SELECT 1 FROM jsonb_array_elements("data"->'achievements') a WHERE a #>> '{}' IN ('arcade_1', 'arcade_25', 'tickets_200', 'rally_1', 'rally_wins_10', 'rally_style', 'rally_coins_100'));
--> statement-breakpoint
UPDATE "players" SET "data" = jsonb_set("data", '{inventory}', (SELECT jsonb_agg(CASE WHEN s->>'item' IN ('tv', 'cart_rally', 'cart_snow', 'cart_golf', 'cart_hen', 'cart_dance', 'cart_star', 'plush_cow', 'plush_hen', 'plush_dragon', 'trophy', 'lava_lamp', 'disco_ball', 'neon_sign') THEN 'null'::jsonb ELSE s END ORDER BY i) FROM jsonb_array_elements("data"->'inventory') WITH ORDINALITY t(s, i)))
WHERE jsonb_typeof("data"->'inventory') = 'array' AND EXISTS (SELECT 1 FROM jsonb_array_elements("data"->'inventory') s WHERE s->>'item' IN ('tv', 'cart_rally', 'cart_snow', 'cart_golf', 'cart_hen', 'cart_dance', 'cart_star', 'plush_cow', 'plush_hen', 'plush_dragon', 'trophy', 'lava_lamp', 'disco_ball', 'neon_sign'));
--> statement-breakpoint
DELETE FROM "objects" WHERE "kind" IN ('tv', 'arcade_hall', 'arcade_machine', 'prize_counter', 'score_board', 'hall_wall', 'hall_exit', 'rally_garage', 'plush_cow', 'plush_hen', 'plush_dragon', 'trophy', 'lava_lamp', 'disco_ball', 'neon_sign');
--> statement-breakpoint
UPDATE "objects" SET "data" = jsonb_set("data", '{items}', (SELECT jsonb_agg(CASE WHEN s->>'item' IN ('tv', 'cart_rally', 'cart_snow', 'cart_golf', 'cart_hen', 'cart_dance', 'cart_star', 'plush_cow', 'plush_hen', 'plush_dragon', 'trophy', 'lava_lamp', 'disco_ball', 'neon_sign') THEN 'null'::jsonb ELSE s END ORDER BY i) FROM jsonb_array_elements("data"->'items') WITH ORDINALITY t(s, i)))
WHERE jsonb_typeof("data"->'items') = 'array' AND EXISTS (SELECT 1 FROM jsonb_array_elements("data"->'items') s WHERE s->>'item' IN ('tv', 'cart_rally', 'cart_snow', 'cart_golf', 'cart_hen', 'cart_dance', 'cart_star', 'plush_cow', 'plush_hen', 'plush_dragon', 'trophy', 'lava_lamp', 'disco_ball', 'neon_sign'));
--> statement-breakpoint
UPDATE "world" SET "drops" = (SELECT COALESCE(jsonb_object_agg(k, v), '{}'::jsonb) FROM jsonb_each("drops") AS e(k, v) WHERE v->>'item' NOT IN ('tv', 'cart_rally', 'cart_snow', 'cart_golf', 'cart_hen', 'cart_dance', 'cart_star', 'plush_cow', 'plush_hen', 'plush_dragon', 'trophy', 'lava_lamp', 'disco_ball', 'neon_sign'))
WHERE EXISTS (SELECT 1 FROM jsonb_each("drops") AS e(k, v) WHERE v->>'item' IN ('tv', 'cart_rally', 'cart_snow', 'cart_golf', 'cart_hen', 'cart_dance', 'cart_star', 'plush_cow', 'plush_hen', 'plush_dragon', 'trophy', 'lava_lamp', 'disco_ball', 'neon_sign'));
--> statement-breakpoint
DELETE FROM "areas" WHERE "key" LIKE 'arcade:%';
--> statement-breakpoint
UPDATE "areas" SET "data" = jsonb_set("data", '{objects}', (SELECT COALESCE(jsonb_object_agg(k, v), '{}'::jsonb) FROM jsonb_each("data"->'objects') AS e(k, v) WHERE v->>'kind' NOT IN ('tv', 'arcade_hall', 'arcade_machine', 'prize_counter', 'score_board', 'hall_wall', 'hall_exit', 'rally_garage', 'plush_cow', 'plush_hen', 'plush_dragon', 'trophy', 'lava_lamp', 'disco_ball', 'neon_sign')))
WHERE jsonb_typeof("data"->'objects') = 'object' AND EXISTS (SELECT 1 FROM jsonb_each("data"->'objects') AS e(k, v) WHERE v->>'kind' IN ('tv', 'arcade_hall', 'arcade_machine', 'prize_counter', 'score_board', 'hall_wall', 'hall_exit', 'rally_garage', 'plush_cow', 'plush_hen', 'plush_dragon', 'trophy', 'lava_lamp', 'disco_ball', 'neon_sign'));
--> statement-breakpoint
UPDATE "areas" SET "data" = jsonb_set("data", '{objects}', (SELECT jsonb_object_agg(k, CASE WHEN jsonb_typeof(v->'items') = 'array' THEN jsonb_set(v, '{items}', (SELECT jsonb_agg(CASE WHEN s->>'item' IN ('tv', 'cart_rally', 'cart_snow', 'cart_golf', 'cart_hen', 'cart_dance', 'cart_star', 'plush_cow', 'plush_hen', 'plush_dragon', 'trophy', 'lava_lamp', 'disco_ball', 'neon_sign') THEN 'null'::jsonb ELSE s END ORDER BY i) FROM jsonb_array_elements(v->'items') WITH ORDINALITY t(s, i))) ELSE v END) FROM jsonb_each("data"->'objects') AS e(k, v)))
WHERE jsonb_typeof("data"->'objects') = 'object' AND EXISTS (SELECT 1 FROM jsonb_each("data"->'objects') AS o(k, v), jsonb_array_elements(CASE WHEN jsonb_typeof(o.v->'items') = 'array' THEN o.v->'items' ELSE '[]'::jsonb END) s WHERE s->>'item' IN ('tv', 'cart_rally', 'cart_snow', 'cart_golf', 'cart_hen', 'cart_dance', 'cart_star', 'plush_cow', 'plush_hen', 'plush_dragon', 'trophy', 'lava_lamp', 'disco_ball', 'neon_sign'));
--> statement-breakpoint
UPDATE "areas" SET "data" = jsonb_set("data", '{drops}', (SELECT COALESCE(jsonb_object_agg(k, v), '{}'::jsonb) FROM jsonb_each("data"->'drops') AS e(k, v) WHERE v->>'item' NOT IN ('tv', 'cart_rally', 'cart_snow', 'cart_golf', 'cart_hen', 'cart_dance', 'cart_star', 'plush_cow', 'plush_hen', 'plush_dragon', 'trophy', 'lava_lamp', 'disco_ball', 'neon_sign')))
WHERE jsonb_typeof("data"->'drops') = 'object' AND EXISTS (SELECT 1 FROM jsonb_each("data"->'drops') AS e(k, v) WHERE v->>'item' IN ('tv', 'cart_rally', 'cart_snow', 'cart_golf', 'cart_hen', 'cart_dance', 'cart_star', 'plush_cow', 'plush_hen', 'plush_dragon', 'trophy', 'lava_lamp', 'disco_ball', 'neon_sign'));
