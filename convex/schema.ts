import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export default defineSchema({
	events: defineTable({
		name: v.string(),
		year: v.optional(v.number()),
		titleFormat: v.optional(v.string())
	})
});
