import { query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

/**
 * Returns true only if the authenticated user's email matches the OWNER_EMAIL
 * environment variable set in Convex. Used to restrict the app to a single owner.
 */
export const isOwner = query({
  args: {},
  handler: async (ctx) => {
    const ownerEmail = process.env.OWNER_EMAIL;
    // If OWNER_EMAIL is not configured, allow access (dev mode)
    if (!ownerEmail) return true;

    const userId = await getAuthUserId(ctx);
    if (!userId) return false;

    const user = await ctx.db.get(userId);
    if (!user || !user.email) return false;

    return user.email.toLowerCase().trim() === ownerEmail.toLowerCase().trim();
  },
});
