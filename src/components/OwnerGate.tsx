import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { useConvexAuth } from "convex/react";
import { useNavigate, useLocation } from "react-router";
import { useEffect } from "react";

interface OwnerGateProps {
  children: React.ReactNode;
}

// Routes that are always publicly accessible (auth flow)
const PUBLIC_PATHS = ["/", "/auth"];

/**
 * Wraps the app and enforces owner-only access.
 * - Unauthenticated users on protected routes → redirect to /auth
 * - Authenticated non-owners → Access Denied screen
 * - Owner → renders children normally
 */
export function OwnerGate({ children }: OwnerGateProps) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const isOwner = useQuery(api.ownerGate.isOwner);
  const navigate = useNavigate();
  const location = useLocation();

  const isPublicPath = PUBLIC_PATHS.includes(location.pathname);

  // Redirect unauthenticated users away from protected routes
  useEffect(() => {
    if (!isLoading && !isAuthenticated && !isPublicPath) {
      navigate("/auth", { replace: true });
    }
  }, [isLoading, isAuthenticated, isPublicPath, navigate]);

  // Still determining auth state
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="animate-pulse text-zinc-500 text-sm">Loading…</div>
      </div>
    );
  }

  // Unauthenticated on a public path — let the app handle it (landing / auth page)
  if (!isAuthenticated) return <>{children}</>;

  // Waiting for owner check result
  if (isOwner === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="animate-pulse text-zinc-500 text-sm">Verifying access…</div>
      </div>
    );
  }

  // Authenticated but NOT the owner
  if (!isOwner) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-black text-white gap-4">
        <div className="text-5xl">🔒</div>
        <h1 className="text-2xl font-bold tracking-tight">Access Denied</h1>
        <p className="text-zinc-400 text-sm max-w-xs text-center">
          This application is private. Only the owner can access it.
        </p>
        <button
          onClick={() => navigate("/")}
          className="mt-2 text-xs text-zinc-600 hover:text-zinc-400 underline"
        >
          Go home
        </button>
      </div>
    );
  }

  return <>{children}</>;
}
