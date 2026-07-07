/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as agent from "../agent.js";
import type * as aiCache from "../aiCache.js";
import type * as auditLogs from "../auditLogs.js";
import type * as auth from "../auth.js";
import type * as auth_emailOtp from "../auth/emailOtp.js";
import type * as chat from "../chat.js";
import type * as effects from "../effects.js";
import type * as featureFlags from "../featureFlags.js";
import type * as ffmpegMicro from "../ffmpegMicro.js";
import type * as http from "../http.js";
import type * as lib_crypto from "../lib/crypto.js";
import type * as lib_requireOwner from "../lib/requireOwner.js";
import type * as logging from "../logging.js";
import type * as ownerGate from "../ownerGate.js";
import type * as projects from "../projects.js";
import type * as providers from "../providers.js";
import type * as rateLimit from "../rateLimit.js";
import type * as sources from "../sources.js";
import type * as users from "../users.js";
import type * as vectorMemory from "../vectorMemory.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  agent: typeof agent;
  aiCache: typeof aiCache;
  auditLogs: typeof auditLogs;
  auth: typeof auth;
  "auth/emailOtp": typeof auth_emailOtp;
  chat: typeof chat;
  effects: typeof effects;
  featureFlags: typeof featureFlags;
  ffmpegMicro: typeof ffmpegMicro;
  http: typeof http;
  "lib/crypto": typeof lib_crypto;
  "lib/requireOwner": typeof lib_requireOwner;
  logging: typeof logging;
  ownerGate: typeof ownerGate;
  projects: typeof projects;
  providers: typeof providers;
  rateLimit: typeof rateLimit;
  sources: typeof sources;
  users: typeof users;
  vectorMemory: typeof vectorMemory;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
