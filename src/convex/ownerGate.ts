import { query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

/**
 * Returns true only if the authenticated user's email matches OWNER_EMAIL.
 * Fail-closed: if OWNER_EMAIL is not set in production, access is denied.
 */
export const isOwner = query({
  args: {},
  handler: async (ctx) => {
    const ownerEmail = process.env.OWNER_EMAIL;

    // Fail-closed in production: no OWNER_EMAIL → deny
    if (!ownerEmail) {
      if (process.env.NODE_ENV === "production") return false;
      // Allow access only in local dev when OWNER_EMAIL is not configured
      return true;
    }

    const userId = await getAuthUserId(ctx);
    if (!userId) return false;

    const user = await ctx.db.get(userId);
    if (!user || !user.email) return false;

    return user.email.toLowerCase().trim() === ownerEmail.toLowerCase().trim();
  },
});
