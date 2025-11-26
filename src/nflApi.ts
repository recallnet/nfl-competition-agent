import { getJson, postJson } from "./httpClient.js";
import { logger } from "./logger.js";
import {
  Competition,
  CompetitionInfoResponse,
  CompetitionRules,
  CompetitionRulesResponse,
  CreatePredictionRequest,
  CreatePredictionResponse,
  Game,
  GameInfoResponse,
  GamesResponse,
  GetPredictionsResponse,
  Plays,
  PlaysResponse,
  Prediction,
} from "./types.js";

/**
 * Validates that an API response indicates success, throwing if not.
 * @param response - The API response to validate.
 * @param errorMessage - Message to include in the thrown error.
 * @returns The validated response.
 * @throws Error when the response indicates failure.
 */
function ensureSuccess<T extends { success: boolean }>(
  response: T | undefined,
  errorMessage: string,
): T {
  if (!response?.success) {
    logger.error({ response }, errorMessage);
    throw new Error(errorMessage);
  }
  return response;
}

/**
 * Fetches metadata about a competition including its current status.
 * @param competitionId - Unique identifier of the competition.
 * @returns The competition object.
 */
export async function getCompetitionInfo(
  competitionId: string,
): Promise<Competition> {
  const response = ensureSuccess(
    await getJson<CompetitionInfoResponse>(`/competitions/${competitionId}`),
    "Competition info payload missing expected data object",
  );
  return response.competition;
}

/**
 * Fetches the competition rules document for scoring and timing guidance.
 * @param competitionId - Unique identifier of the competition.
 * @returns The competition rule payload.
 */
export async function getCompetitionRules(
  competitionId: string,
): Promise<CompetitionRules> {
  const response = ensureSuccess(
    await getJson<CompetitionRulesResponse>(
      `/nfl/competitions/${competitionId}/rules`,
    ),
    "Competition rules payload missing expected data object",
  );
  return response.data;
}

/**
 * Lists all games participating in a competition.
 * @param competitionId - Unique identifier of the competition.
 * @returns The array of games.
 */
export async function getCompetitionGames(
  competitionId: string,
): Promise<Game[]> {
  const response = ensureSuccess(
    await getJson<GamesResponse>(`/nfl/competitions/${competitionId}/games`),
    "Games payload missing expected data object",
  );
  return response.data.games;
}

/**
 * Retrieves the latest snapshot for a specific game.
 * @param competitionId - Competition identifier.
 * @param gameId - Identifier for the target game.
 * @returns The detailed game object.
 */
export async function getGameInfo(
  competitionId: string,
  gameId: string,
): Promise<Game> {
  const response = ensureSuccess(
    await getJson<GameInfoResponse>(
      `/nfl/competitions/${competitionId}/games/${gameId}`,
    ),
    "Game info payload missing expected data object",
  );
  return response.data.game;
}

/**
 * Returns play-by-play data for a game with optional pagination filters.
 * @param competitionId - Competition identifier.
 * @param gameId - Identifier for the target game.
 * @param options - Pagination/ordering preferences.
 * @returns The play array for the requested page.
 */
export async function getGamePlays(
  competitionId: string,
  gameId: string,
  options: {
    limit?: number;
    offset?: number;
    sort?: "-createdAt" | "createdAt";
    latest?: boolean;
  } = {},
): Promise<Plays> {
  const params = new URLSearchParams();
  if (options.limit) params.set("limit", String(options.limit));
  if (options.offset) params.set("offset", String(options.offset));
  if (options.latest) params.set("latest", "true");
  if (options.sort) params.set("sort", options.sort);
  const query = params.toString();
  const path = query
    ? `/nfl/competitions/${competitionId}/games/${gameId}/plays?${query}`
    : `/nfl/competitions/${competitionId}/games/${gameId}/plays`;
  const response = ensureSuccess(
    await getJson<PlaysResponse>(path),
    "Plays payload missing expected data object",
  );
  return response.data;
}

/**
 * Lists predictions for a game, optionally filtered by agent id.
 * @param competitionId - Competition identifier.
 * @param gameId - Identifier for the target game.
 * @param agentId - Optional agent filter for API-side filtering.
 * @returns Predictions returned by the API.
 */
export async function getGamePredictions(
  competitionId: string,
  gameId: string,
  agentId?: string,
): Promise<Prediction[]> {
  const params = new URLSearchParams();
  if (agentId) params.set("agentId", agentId);
  const query = params.toString();
  const path = query
    ? `/nfl/competitions/${competitionId}/games/${gameId}/predictions?${query}`
    : `/nfl/competitions/${competitionId}/games/${gameId}/predictions`;
  const response = ensureSuccess(
    await getJson<GetPredictionsResponse>(path),
    "Predictions payload missing expected data object",
  );
  return response.data.predictions;
}

/**
 * Submits a new prediction for a game and returns the created record when present.
 * @param competitionId - Competition identifier.
 * @param gameId - Identifier for the target game.
 * @param body - Prediction payload to submit.
 * @returns Newly created prediction when exposed by the API.
 */
export async function postGamePrediction(
  competitionId: string,
  gameId: string,
  body: CreatePredictionRequest,
): Promise<Prediction> {
  const response = ensureSuccess(
    await postJson<CreatePredictionResponse>(
      `/nfl/competitions/${competitionId}/games/${gameId}/predictions`,
      body,
    ),
    "Prediction payload missing expected data object",
  );
  if (!response.data) {
    logger.error({ response }, "Prediction response missing data");
    throw new Error("Prediction payload missing expected data object");
  }
  return response.data;
}
