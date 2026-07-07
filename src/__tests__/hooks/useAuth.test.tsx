import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAuth } from '@/hooks/use-auth';
import { ConvexAuthProvider } from '@convex-dev/auth/react';
import { ConvexReactClient } from 'convex/react';

describe('useAuth Hook', () => {
  let mockConvex: ConvexReactClient;

  beforeEach(() => {
    mockConvex = new ConvexReactClient(
      process.env.VITE_CONVEX_URL || 'http://localhost:3210'
    );
  });

  it('should return initial loading state', () => {
    const { result } = renderHook(() => useAuth(), {
      wrapper: ({ children }) => (
        <ConvexAuthProvider client={mockConvex}>
          {children}
        </ConvexAuthProvider>
      ),
    });

    expect(result.current.isLoading).toBe(true);
  });

  it('should have signIn and signOut methods', () => {
    const { result } = renderHook(() => useAuth(), {
      wrapper: ({ children }) => (
        <ConvexAuthProvider client={mockConvex}>
          {children}
        </ConvexAuthProvider>
      ),
    });

    expect(typeof result.current.signIn).toBe('function');
    expect(typeof result.current.signOut).toBe('function');
  });

  it('should have isAuthenticated and user properties', () => {
    const { result } = renderHook(() => useAuth(), {
      wrapper: ({ children }) => (
        <ConvexAuthProvider client={mockConvex}>
          {children}
        </ConvexAuthProvider>
      ),
    });

    expect(result.current).toHaveProperty('isAuthenticated');
    expect(result.current).toHaveProperty('user');
  });
});
