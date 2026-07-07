import { convexAuth } from "@convex-dev/auth/server";
import { emailOtp } from "./auth/emailOtp";
import Google from "@auth/core/providers/google";
import GitHub from "@auth/core/providers/github";

// Anonymous login removed — app is owner-only.
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [emailOtp, Google, GitHub],
});