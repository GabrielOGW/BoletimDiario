CREATE INDEX "continuity_hair_makeup_production_scene" ON "continuity_hair_makeup" USING btree ("production_id","scene_id");--> statement-breakpoint
CREATE INDEX "continuity_hair_makeup_production_take" ON "continuity_hair_makeup" USING btree ("production_id","take_id");--> statement-breakpoint
CREATE INDEX "continuity_props_production_scene" ON "continuity_props" USING btree ("production_id","scene_id");--> statement-breakpoint
CREATE INDEX "continuity_props_production_take" ON "continuity_props" USING btree ("production_id","take_id");--> statement-breakpoint
CREATE INDEX "continuity_set_dressing_production_scene" ON "continuity_set_dressing" USING btree ("production_id","scene_id");--> statement-breakpoint
CREATE INDEX "continuity_set_dressing_production_take" ON "continuity_set_dressing" USING btree ("production_id","take_id");--> statement-breakpoint
CREATE INDEX "continuity_wardrobe_production_scene" ON "continuity_wardrobe" USING btree ("production_id","scene_id");--> statement-breakpoint
CREATE INDEX "continuity_wardrobe_production_take" ON "continuity_wardrobe" USING btree ("production_id","take_id");