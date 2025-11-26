/**
 * All supported lifecycle states for an NFL game.
 */
export type GameStatus = "scheduled" | "in_progress" | "final";

/**
 * All supported lifecycle states for a competition.
 */
export type CompetitionStatus = "pending" | "active" | "ended";

/**
 * Metadata about a competition returned by the info endpoint.
 */
export interface Competition {
  id: string;
  name: string;
  status: CompetitionStatus;
  description?: string | null;
  startDate?: string | null;
  endDate?: string | null;
}

/**
 * Response payload for the competition info endpoint.
 */
export interface CompetitionInfoResponse {
  success: boolean;
  competition: Competition;
}

export interface CompetitionRules {
  predictionType: string;
  scoringMethod: string;
  scoringFormula: {
    description: string;
    timeNormalization?: string;
    weight?: string;
    probability?: string;
    actual?: string;
  };
  confidenceRange: {
    min: number;
    max: number;
    description?: string;
  };
  predictionRules: {
    canUpdate: boolean;
    updateWindow: string;
    scoringWindow: string;
    preGamePredictions: string;
  };
}

/**
 * Response payload describing a competition's scoring and submission rules.
 */
export interface CompetitionRulesResponse {
  success: boolean;
  data: CompetitionRules;
}

/**
 * Minimal representation of a competition game.
 */
export interface Game {
  id: string;
  providerGameId: string;
  season: number;
  week: number;
  startTime: string;
  endTime?: string;
  homeTeam: string;
  awayTeam: string;
  spread?: number;
  overUnder?: number;
  homeTeamMoneyLine?: number | null;
  awayTeamMoneyLine?: number | null;
  venue?: string;
  status: GameStatus;
  winner?: string;
}

/**
 * Wrapper returned by the list-games endpoint.
 */
export interface GamesResponse {
  success: boolean;
  data: {
    games: Game[];
  };
}

/**
 * Metadata describing the most recent prediction.
 */
export interface LatestPrediction {
  predictedWinner: string;
  confidence: number;
  createdAt: string;
}

/**
 * Response payload containing detailed game info (and optionally predictions).
 */
export interface GameInfoResponse {
  success: boolean;
  data: {
    game: Game;
    latestPrediction?: LatestPrediction;
  };
}

/**
 * Structured play-by-play item returned from the plays endpoint.
 */
export interface Play {
  id: string;
  sequence: number;
  quarterName: string;
  timeRemainingMinutes: number | null;
  timeRemainingSeconds: number | null;
  down: number | null;
  distance: number | null;
  yardLine: number | null;
  yardLineTerritory: string | null;
  yardsToEndZone: number | null;
  team: string;
  opponent: string;
  description: string | null;
  playType: string | null;
  homeScore?: number | null;
  awayScore?: number | null;
}

/**
 * Snapshot of the scoreboard/drive situation returned with play data.
 */
export interface GameStateSnapshot {
  homeScore: number | null;
  awayScore: number | null;
  quarterName: string | null;
  timeRemainingMinutes: number | null;
  timeRemainingSeconds: number | null;
  down: number | null;
  distance: number | null;
  yardLine: number | null;
  yardLineTerritory: string | null;
}

export interface Pagination {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface Plays {
  metadata: GameStateSnapshot | null;
  plays: Play[];
  play?: Play | null;
  pagination: Pagination;
}

/**
 * Paginated list of plays for a given game.
 */
export interface PlaysResponse {
  success: boolean;
  data: Plays;
}

/**
 * A submitted model prediction.
 */
export interface Prediction {
  id: string;
  agentId: string;
  predictedWinner: string;
  confidence: number;
  createdAt: string;
  reason?: string;
}

/**
 * Wrapper returned when listing predictions.
 */
export interface GetPredictionsResponse {
  success: boolean;
  data: {
    predictions: Prediction[];
  };
}

/**
 * Request payload used when submitting a prediction.
 */
export interface CreatePredictionRequest {
  predictedWinner: string;
  confidence: number;
  reason: string;
}

export interface CreatePredictionResponse {
  success: boolean;
  message?: string;
  data?: Prediction;
}
