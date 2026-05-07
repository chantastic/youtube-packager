/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as aiValidationCheckTypes from "../aiValidationCheckTypes.js";
import type * as aiValidationChecks from "../aiValidationChecks.js";
import type * as anthropicLlmProvider from "../anthropicLlmProvider.js";
import type * as eventPlaylistStats from "../eventPlaylistStats.js";
import type * as events from "../events.js";
import type * as llmProvider from "../llmProvider.js";
import type * as playlistAssignmentViews from "../playlistAssignmentViews.js";
import type * as playlistAssignments from "../playlistAssignments.js";
import type * as secrets from "../secrets.js";
import type * as speakers from "../speakers.js";
import type * as titleAiValidationTypes from "../titleAiValidationTypes.js";
import type * as videoCaptions from "../videoCaptions.js";
import type * as videoCommands from "../videoCommands.js";
import type * as videoValidationTypes from "../videoValidationTypes.js";
import type * as videoViews from "../videoViews.js";
import type * as videoWorkflows from "../videoWorkflows.js";
import type * as videos from "../videos.js";
import type * as youtubeConnections from "../youtubeConnections.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  aiValidationCheckTypes: typeof aiValidationCheckTypes;
  aiValidationChecks: typeof aiValidationChecks;
  anthropicLlmProvider: typeof anthropicLlmProvider;
  eventPlaylistStats: typeof eventPlaylistStats;
  events: typeof events;
  llmProvider: typeof llmProvider;
  playlistAssignmentViews: typeof playlistAssignmentViews;
  playlistAssignments: typeof playlistAssignments;
  secrets: typeof secrets;
  speakers: typeof speakers;
  titleAiValidationTypes: typeof titleAiValidationTypes;
  videoCaptions: typeof videoCaptions;
  videoCommands: typeof videoCommands;
  videoValidationTypes: typeof videoValidationTypes;
  videoViews: typeof videoViews;
  videoWorkflows: typeof videoWorkflows;
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
