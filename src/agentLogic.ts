import { Game, GameStatus, Prediction } from "./types.js";

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
 * @returns True when a new prediction should be posted.
 */
export function shouldUpdatePrediction({
  gameStatus,
  latestPrediction,
  newPrediction,
}: ShouldUpdatePredictionParams): boolean {
  if (gameStatus === "final") {
    return false;
  }
  if (!latestPrediction) {
    return true;
  }
  const sameWinner =
    latestPrediction.predictedWinner === newPrediction.predictedWinner;
  const confidenceDelta = Math.abs(
    latestPrediction.confidence - newPrediction.confidence,
  );
  if (sameWinner && confidenceDelta < 0.01) {
    return false;
  }
  return true;
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
