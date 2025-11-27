import { Game, GameStatus, Prediction } from "./types.js";

/**
 * Small value used to reduce noise in agent confidence calculations.
 */
const EPSILON = 0.0001;

/**
 * Snapshot of betting lines for change detection.
 */
export interface BettingLines {
  spread?: number | null;
  overUnder?: number | null;
  homeTeamMoneyLine?: number | null;
  awayTeamMoneyLine?: number | null;
}

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
  /** Current betting lines from the latest game info fetch. */
  currentLines?: BettingLines;
  /** Betting lines from the previous poll cycle (if any). */
  previousLines?: BettingLines;
}

/**
 * Checks whether any betting line value has changed between two snapshots.
 * @param current - Current betting lines.
 * @param previous - Previous betting lines.
 * @returns True when at least one line differs.
 */
function haveLinesChanged(
  current?: BettingLines,
  previous?: BettingLines,
): boolean {
  if (!current || !previous) {
    return false;
  }
  return (
    current.spread !== previous.spread ||
    current.overUnder !== previous.overUnder ||
    current.homeTeamMoneyLine !== previous.homeTeamMoneyLine ||
    current.awayTeamMoneyLine !== previous.awayTeamMoneyLine
  );
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
  currentLines,
  previousLines,
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

  // Allow a new prediction if betting lines moved since last cycle.
  if (haveLinesChanged(currentLines, previousLines)) {
    return {
      shouldUpdate: true,
      reason: "Betting lines changed; submitting updated prediction",
    };
  }

  // Note: we want agents to submit a single prediction for scheduled games because there's no new
  // context after that happens—until the game starts (or lines change).
  if (gameStatus === "scheduled") {
    return {
      shouldUpdate: false,
      reason: "Scheduled game; waiting for game start or line movement",
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
