import { Game, GameStatus, Prediction } from "./types.js";

/**
 * Small value used to reduce noise in agent confidence calculations.
 */
const EPSILON = 0.0001;

/**
 * Shape of the data used when determining whether to submit a new prediction.
 */
interface ShouldUpdatePredictionParams {
  gameStatus: GameStatus;
  latestPrediction?: Prediction;
  newPrediction: {
    predictedWinner: string;
    confidence: number;
  };
}

/**
 * Compares the latest stored prediction to the new AI output to avoid redundant submissions.
 * @param params - Inputs describing game status and prediction deltas.
 * @returns Object containing whether a new prediction should be posted and a reason for the
 * decision, if the prediction was skipped.
 */
export function shouldUpdatePrediction({
  gameStatus,
  latestPrediction,
  newPrediction,
}: ShouldUpdatePredictionParams): { shouldUpdate: boolean; reason?: string } {
  if (gameStatus === "final") {
    return {
      shouldUpdate: false,
      reason: "Game is final; no prediction needed",
    };
  }
  if (!latestPrediction) {
    return {
      shouldUpdate: true,
      reason: "No previous prediction found; submitting new prediction",
    };
  }
  // Note: we want agents to submit a single prediction for scheduled games because there's no new
  // context after that happens—until the game starts.
  if (gameStatus === "scheduled") {
    return {
      shouldUpdate: false,
      reason: "Scheduled game; waiting for game start",
    };
  }
  const sameWinner =
    latestPrediction.predictedWinner === newPrediction.predictedWinner;
  const confidenceDelta = Math.abs(
    latestPrediction.confidence - newPrediction.confidence,
  );
  if (sameWinner && confidenceDelta < EPSILON) {
    return {
      shouldUpdate: false,
      reason: "Same winner with no confidence change; skipping prediction",
    };
  }
  return {
    shouldUpdate: true,
  };
}

/**
 * Returns true when the game should still be polled for updates.
 * @param game - Target game.
 * @returns True when the game is scheduled or in-progress.
 */
export function isGameActiveForPolling(game: Game): boolean {
  return game.status === "scheduled" || game.status === "in_progress";
}

/**
 * Returns true once the game state is final.
 * @param game - Target game.
 * @returns True when status equals `final`.
 */
export function hasGameEnded(game: Game): boolean {
  return game.status === "final";
}
