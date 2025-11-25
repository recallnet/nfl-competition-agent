/** All supported lifecycle states for an NFL game. */
export type GameStatus = "scheduled" | "in_progress" | "final";

/** Response payload describing a competition's scoring and submission rules. */
export interface CompetitionRulesResponse {
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

/** Minimal representation of a competition game. */
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
  venue?: string;
  status: GameStatus;
  winner?: string;
}

/** Wrapper returned by the list-games endpoint. */
export interface GamesResponse {
  data: {
    games: Game[];
  };
}

/** Metadata describing the most recent prediction. */
export interface LatestPrediction {
  predictedWinner: string;
  confidence: number;
  createdAt: string;
}

/** Response payload containing detailed game info (and optionally predictions). */
export interface GameInfoResponse {
  data: {
    game: Game;
    latestPrediction?: LatestPrediction;
  };
}

/** Structured play-by-play item returned from the plays endpoint. */
export interface Play {
  id: string;
  sequence: number;
  quarterName: string;
  timeRemainingMinutes: number;
  timeRemainingSeconds: number;
  down: number;
  distance: number;
  yardLine: number;
  yardLineTerritory: string;
  yardsToEndZone: number;
  team: string;
  opponent: string;
  description: string;
  playType: string;
}

/** Paginated list of plays for a given game. */
export interface PlaysResponse {
  data: {
    plays: Play[];
    pagination: {
      total: number;
      limit: number;
      offset: number;
      hasMore: boolean;
    };
  };
}

/** A submitted model prediction. */
export interface Prediction {
  id: string;
  agentId: string;
  predictedWinner: string;
  confidence: number;
  createdAt: string;
  reason?: string;
}

/** Wrapper returned when listing predictions. */
export interface PredictionsResponse {
  data: {
    predictions: Prediction[];
  };
}

/** Request payload used when submitting a prediction. */
export interface CreatePredictionRequest {
  predictedWinner: string;
  confidence: number;
  reason: string;
}
