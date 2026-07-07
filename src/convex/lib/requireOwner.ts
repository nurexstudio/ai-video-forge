import { MutationCtx, QueryCtx, ActionCtx } from "../_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

/**
 * Server-side owner enforcement helper.
 * Call at the top of any sensitive Convex mutation or query.
 * Throws "Unauthorized" if the caller is not the owner.
 */
export async function requireOwner(ctx: MutationCtx | QueryCtx): Promise<string> {
  const ownerEmail = process.env.OWNER_EMAIL;

  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Unauthorized: not authenticated");

  // If OWNER_EMAIL is set, enforce it
  if (ownerEmail) {
    const user = await ctx.db.get(userId);
    if (!user?.email) throw new Error("Unauthorized: no email on account");
    if (user.email.toLowerCase().trim() !== ownerEmail.toLowerCase().trim()) {
      throw new Error("Unauthorized: not the owner");
    }
  }

  return userId;
}
