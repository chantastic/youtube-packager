/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as aiValidationChecks from "../aiValidationChecks.js";
import type * as anthropicWorkflows from "../anthropicWorkflows.js";
import type * as eventPlaylistStats from "../eventPlaylistStats.js";
import type * as events from "../events.js";
import type * as playlistAssignmentViews from "../playlistAssignmentViews.js";
import type * as playlistAssignments from "../playlistAssignments.js";
import type * as secrets from "../secrets.js";
import type * as speakers from "../speakers.js";
import type * as titleQualityChecks from "../titleQualityChecks.js";
import type * as videoCaptions from "../videoCaptions.js";
import type * as videoCommands from "../videoCommands.js";
import type * as videoViews from "../videoViews.js";
import type * as videos from "../videos.js";
import type * as youtubeConnections from "../youtubeConnections.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  aiValidationChecks: typeof aiValidationChecks;
  anthropicWorkflows: typeof anthropicWorkflows;
  eventPlaylistStats: typeof eventPlaylistStats;
  events: typeof events;
  playlistAssignmentViews: typeof playlistAssignmentViews;
  playlistAssignments: typeof playlistAssignments;
  secrets: typeof secrets;
  speakers: typeof speakers;
  titleQualityChecks: typeof titleQualityChecks;
  videoCaptions: typeof videoCaptions;
  videoCommands: typeof videoCommands;
  videoViews: typeof videoViews;
  videos: typeof videos;
  youtubeConnections: typeof youtubeConnections;
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
