import { getJson, postJson } from "./httpClient.js";
import {
  CompetitionRulesResponse,
  CreatePredictionRequest,
  Game,
  GameInfoResponse,
  GamesResponse,
  Play,
  PlaysResponse,
  Prediction,
  PredictionsResponse,
} from "./types.js";

/**
 * Fetches the competition rules document for scoring and timing guidance.
 * @param competitionId - Unique identifier of the competition.
 * @returns The competition rule payload.
 */
export async function getCompetitionRules(
  competitionId: string,
): Promise<CompetitionRulesResponse> {
  const response = await getJson<{
    success: boolean;
    data: CompetitionRulesResponse;
  }>(`/nfl/competitions/${competitionId}/rules`);
  if (!response?.data) {
    throw new Error("Competition rules payload missing expected data object");
  }
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
  const response = await getJson<GamesResponse>(
    `/nfl/competitions/${competitionId}/games`,
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
  const response = await getJson<GameInfoResponse>(
    `/nfl/competitions/${competitionId}/games/${gameId}`,
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
): Promise<PlaysResponse["data"]> {
  const params = new URLSearchParams();
  if (options.limit) params.set("limit", String(options.limit));
  if (options.offset) params.set("offset", String(options.offset));
  if (options.latest) params.set("latest", "true");
  if (options.sort) params.set("sort", options.sort);
  const query = params.toString();
  const path = query
    ? `/nfl/competitions/${competitionId}/games/${gameId}/plays?${query}`
    : `/nfl/competitions/${competitionId}/games/${gameId}/plays`;
  const response = await getJson<PlaysResponse>(path);
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
  const response = await getJson<PredictionsResponse>(path);
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
): Promise<Prediction | undefined> {
  const response = await postJson<unknown>(
    `/nfl/competitions/${competitionId}/games/${gameId}/predictions`,
    body,
  );
  if (response && typeof response === "object") {
    const responseObject = response as Record<string, unknown>;
    const data = responseObject.data;
    if (data && typeof data === "object" && "prediction" in data) {
      return (data as { prediction: Prediction }).prediction;
    }
    if ("prediction" in responseObject && responseObject.prediction) {
      return responseObject.prediction as Prediction;
    }
  }
  return undefined;
}
