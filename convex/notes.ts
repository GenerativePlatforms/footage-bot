import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("notes")
      .order("desc")
      .collect();
  },
});

export const getById = query({
  args: { id: v.id("notes") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const getBySessionId = query({
  args: { sessionId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("notes")
      .filter((q) => q.eq(q.field("sessionId"), args.sessionId))
      .collect();
  },
});

export const create = mutation({
  args: {
    sessionId: v.optional(v.string()),
    type: v.union(
      v.literal("finding"),
      v.literal("recommendation"),
      v.literal("bug"),
      v.literal("ux_issue"),
      v.literal("feature_request"),
      v.literal("pattern")
    ),
    priority: v.union(
      v.literal("low"),
      v.literal("medium"),
      v.literal("high"),
      v.literal("critical")
    ),
    title: v.string(),
    description: v.string(),
    affectedSessions: v.number(),
    status: v.union(
      v.literal("new"),
      v.literal("acknowledged"),
      v.literal("in_progress"),
      v.literal("resolved")
    ),
    tags: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("notes", args);
  },
});

export const update = mutation({
  args: {
    id: v.id("notes"),
    type: v.optional(v.union(
      v.literal("finding"),
      v.literal("recommendation"),
      v.literal("bug"),
      v.literal("ux_issue"),
      v.literal("feature_request"),
      v.literal("pattern")
    )),
    priority: v.optional(v.union(
      v.literal("low"),
      v.literal("medium"),
      v.literal("high"),
      v.literal("critical")
    )),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    affectedSessions: v.optional(v.number()),
    status: v.optional(v.union(
      v.literal("new"),
      v.literal("acknowledged"),
      v.literal("in_progress"),
      v.literal("resolved")
    )),
    tags: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    await ctx.db.patch(id, updates);
  },
});

export const remove = mutation({
  args: { id: v.id("notes") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});
