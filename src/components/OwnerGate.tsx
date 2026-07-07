import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { useConvexAuth } from "convex/react";

interface OwnerGateProps {
  children: React.ReactNode;
}

/**
 * Wraps the app and only renders children if the signed-in user is the owner.
 * Shows a clean "Access Denied" screen for anyone else.
 */
export function OwnerGate({ children }: OwnerGateProps) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const isOwner = useQuery(api.ownerGate.isOwner);

  // Still loading auth state
  if (isLoading || isOwner === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="animate-pulse text-zinc-500 text-sm">Loading…</div>
      </div>
    );
  }

  // Not signed in — let the app's own auth flow handle it
  if (!isAuthenticated) return <>{children}</>;

  // Signed in but NOT the owner
  if (!isOwner) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-black text-white gap-4">
        <div className="text-5xl">🔒</div>
        <h1 className="text-2xl font-bold tracking-tight">Access Denied</h1>
        <p className="text-zinc-400 text-sm max-w-xs text-center">
          This application is private. Only the owner can access it.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
