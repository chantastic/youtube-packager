/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as aiJobCommands from "../aiJobCommands.js";
import type * as aiJobTypes from "../aiJobTypes.js";
import type * as aiJobViews from "../aiJobViews.js";
import type * as aiValidationCheckTypes from "../aiValidationCheckTypes.js";
import type * as aiValidationChecks from "../aiValidationChecks.js";
import type * as anthropicLlmProvider from "../anthropicLlmProvider.js";
import type * as auth from "../auth.js";
import type * as authViews from "../authViews.js";
import type * as authz from "../authz.js";
import type * as descriptionGenerationTypes from "../descriptionGenerationTypes.js";
import type * as eventPlaylistStats from "../eventPlaylistStats.js";
import type * as eventViews from "../eventViews.js";
import type * as events from "../events.js";
import type * as http from "../http.js";
import type * as llmProvider from "../llmProvider.js";
import type * as playlistAssignmentViews from "../playlistAssignmentViews.js";
import type * as playlistAssignments from "../playlistAssignments.js";
import type * as secrets from "../secrets.js";
import type * as speakers from "../speakers.js";
import type * as titleAiValidationTypes from "../titleAiValidationTypes.js";
import type * as titleValidationContext from "../titleValidationContext.js";
import type * as titleValidationTypes from "../titleValidationTypes.js";
import type * as videoCaptions from "../videoCaptions.js";
import type * as videoCommands from "../videoCommands.js";
import type * as videoValidationTypes from "../videoValidationTypes.js";
import type * as videoViews from "../videoViews.js";
import type * as videoWorkflows from "../videoWorkflows.js";
import type * as videos from "../videos.js";
import type * as workflowJobCommands from "../workflowJobCommands.js";
import type * as workflowJobTypes from "../workflowJobTypes.js";
import type * as workflowJobViews from "../workflowJobViews.js";
import type * as workosPipesProvider from "../workosPipesProvider.js";
import type * as youtubeChannelCommands from "../youtubeChannelCommands.js";
import type * as youtubeCommands from "../youtubeCommands.js";
import type * as youtubeWorkflowViews from "../youtubeWorkflowViews.js";
import type * as youtubeWorkflows from "../youtubeWorkflows.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  aiJobCommands: typeof aiJobCommands;
  aiJobTypes: typeof aiJobTypes;
  aiJobViews: typeof aiJobViews;
  aiValidationCheckTypes: typeof aiValidationCheckTypes;
  aiValidationChecks: typeof aiValidationChecks;
  anthropicLlmProvider: typeof anthropicLlmProvider;
  auth: typeof auth;
  authViews: typeof authViews;
  authz: typeof authz;
  descriptionGenerationTypes: typeof descriptionGenerationTypes;
  eventPlaylistStats: typeof eventPlaylistStats;
  eventViews: typeof eventViews;
  events: typeof events;
  http: typeof http;
  llmProvider: typeof llmProvider;
  playlistAssignmentViews: typeof playlistAssignmentViews;
  playlistAssignments: typeof playlistAssignments;
  secrets: typeof secrets;
  speakers: typeof speakers;
  titleAiValidationTypes: typeof titleAiValidationTypes;
  titleValidationContext: typeof titleValidationContext;
  titleValidationTypes: typeof titleValidationTypes;
  videoCaptions: typeof videoCaptions;
  videoCommands: typeof videoCommands;
  videoValidationTypes: typeof videoValidationTypes;
  videoViews: typeof videoViews;
  videoWorkflows: typeof videoWorkflows;
  videos: typeof videos;
  workflowJobCommands: typeof workflowJobCommands;
  workflowJobTypes: typeof workflowJobTypes;
  workflowJobViews: typeof workflowJobViews;
  workosPipesProvider: typeof workosPipesProvider;
  youtubeChannelCommands: typeof youtubeChannelCommands;
  youtubeCommands: typeof youtubeCommands;
  youtubeWorkflowViews: typeof youtubeWorkflowViews;
  youtubeWorkflows: typeof youtubeWorkflows;
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

export declare const components: {
  workOSAuthKit: import("@convex-dev/workos-authkit/_generated/component.js").ComponentApi<"workOSAuthKit">;
};
