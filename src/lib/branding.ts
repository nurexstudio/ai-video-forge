// ─── Shared NUREX STUDIO Branding (extracted from Landing.tsx) ─────────────────
//     Used in Landing, Dashboard, Studio, Settings, and footer components

export const NUREX_BRAND = {
  studio: "NUREX STUDIO",
  youtubeUrl: "https://youtube.com/@nurexstudio?si=R8OmxAH8Vi2ZXKnZ",
  email: "nurexstuio@gmail.com",
  instagramUrl: "https://instagram.com/nurexst",
  description: "AI Video Studio · Powered by NUREX STUDIO",
} as const;

export const APP_VERSION = {
  major: 2,
  minor: 0,
  patch: 0,
  label: "v2.0.0",
  buildDate: "2026-06",
} as const;

export const FEATURE_BADGES = [
  "16 AI Providers",
  "Modality Router",
  "RAG Memory",
  "Encrypted Secrets",
] as const;
