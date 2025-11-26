import {
  hasGameEnded,
  isGameActiveForPolling,
  shouldUpdatePrediction,
} from "./agentLogic.js";
import { PredictionPayload, callPredictionModel } from "./aiClient.js";
import { config } from "./config.js";
import { logger } from "./logger.js";
import {
  getCompetitionGames,
  getCompetitionInfo,
  getCompetitionRules,
  getGameInfo,
  getGamePlays,
  getGamePredictions,
  postGamePrediction,
} from "./nflApi.js";
import { Competition, CompetitionRules, Game, Prediction } from "./types.js";

/**
 * Interval between polling cycles in milliseconds.
 */
const POLL_INTERVAL_MS = 3 * 60 * 1000; // 3 minutes

/**
 * Identifier provided when scoping predictions to this agent.
 */
const AGENT_ID = process.env.AGENT_ID;

/** Result of a single poll cycle indicating whether to continue and whether work was done. */
type CycleResult = "continue" | "stop";

/**
 * Promise-based sleep helper used by the polling loop.
 * @param ms - Number of milliseconds to pause execution.
 */
async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetches the most recent prediction for this agent from the backend.
 * @param competitionId - Target competition identifier.
 * @param gameId - Identifier for the game being queried.
 * @returns A prediction for the current agent or undefined.
 */
async function fetchLatestPrediction(
  competitionId: string,
  gameId: string,
): Promise<Prediction | undefined> {
  try {
    const predictions = await getGamePredictions(
      competitionId,
      gameId,
      AGENT_ID,
    );
    return predictions[0];
  } catch (error) {
    logger.error(
      { error, gameId, competitionId },
      "Failed to fetch latest prediction",
    );
    return undefined;
  }
}

/**
 * Calls the AI model with optional play context and returns the structured response.
 * @param rules - Competition rules to guide the model.
 * @param game - Game metadata.
 * @param latestPrediction - Optional latest prediction to inform updates.
 * @returns Structured AI output ready for submission.
 */
async function buildPrediction(
  rules: CompetitionRules,
  game: Game,
  latestPrediction?: Prediction,
): Promise<{ predictedWinner: string; confidence: number; reason: string }> {
  const playsData =
    game.status === "in_progress"
      ? await getGamePlays(config.competitionId, game.id, {
          limit: 20,
          sort: "-createdAt",
        }).catch((error) => {
          logger.warn(
            { error, gameId: game.id },
            "Unable to load recent plays",
          );
          return undefined;
        })
      : undefined;
  const plays = playsData?.plays ?? [];

  return callPredictionModel({
    rules,
    game,
    plays,
    previousPrediction: latestPrediction
      ? {
          predictedWinner: latestPrediction.predictedWinner,
          confidence: latestPrediction.confidence,
          createdAt: latestPrediction.createdAt,
          reason: latestPrediction.reason,
        }
      : undefined,
  });
}

/**
 * Handles fetching data, generating predictions, and posting updates for a game.
 * @param rules - Competition rules metadata.
 * @param baseGame - Game entry from the competition list route.
 */
async function handleGame(
  rules: CompetitionRules,
  baseGame: Game,
): Promise<void> {
  if (hasGameEnded(baseGame)) {
    logger.info({ gameId: baseGame.id }, "Skipping game with status 'final'");
    return;
  }

  let detailedGame: Game;
  try {
    detailedGame = await getGameInfo(config.competitionId, baseGame.id);
  } catch (error) {
    logger.error({ error, gameId: baseGame.id }, "Failed to load game info");
    return;
  }

  if (!isGameActiveForPolling(detailedGame)) {
    logger.debug(
      { gameId: detailedGame.id, status: detailedGame.status },
      "Game not active for polling",
    );
    return;
  }

  const latestPrediction = await fetchLatestPrediction(
    config.competitionId,
    detailedGame.id,
  );
  let aiPrediction: PredictionPayload;
  try {
    aiPrediction = await buildPrediction(rules, detailedGame, latestPrediction);
  } catch (error) {
    logger.error(
      { error, gameId: detailedGame.id },
      "Skipping prediction due to model error",
    );
    return;
  }

  const shouldUpdate = shouldUpdatePrediction({
    gameStatus: detailedGame.status,
    latestPrediction,
    newPrediction: {
      predictedWinner: aiPrediction.predictedWinner,
      confidence: aiPrediction.confidence,
    },
  });

  if (!shouldUpdate) {
    logger.debug({ gameId: detailedGame.id }, "No update needed");
    return;
  }

  const now = new Date().toISOString();
  try {
    const prediction = await postGamePrediction(
      config.competitionId,
      detailedGame.id,
      aiPrediction,
    );
    const submittedAt = prediction?.createdAt ?? now;
    if (prediction?.id) {
      logger.info(
        { predictionId: prediction.id, gameId: detailedGame.id, submittedAt },
        "Submitted prediction",
      );
    } else {
      logger.info(
        { gameId: detailedGame.id, submittedAt },
        "Submitted prediction",
      );
    }
  } catch (error) {
    logger.error(
      { error, gameId: detailedGame.id, submittedAt: now },
      "Failed to submit prediction",
    );
  }
}

/**
 * Returns true when the competition has ended and the agent should shut down.
 * @param competition - Competition metadata.
 */
function isCompetitionEnded(competition: Competition): boolean {
  return competition.status === "ended";
}

/**
 * Returns true when the competition is accepting predictions.
 * @param competition - Competition metadata.
 */
function isCompetitionActive(competition: Competition): boolean {
  return competition.status === "active";
}

/**
 * Executes a single iteration across all games matching a label for logging.
 * @param rules - Competition rules metadata.
 * @param label - Tag used in log statements (e.g., "initial").
 * @returns "stop" when the competition has ended, otherwise "continue".
 */
async function runCycle(
  rules: CompetitionRules,
  label: string,
): Promise<CycleResult> {
  let competition: Competition;
  try {
    competition = await getCompetitionInfo(config.competitionId);
  } catch (error) {
    logger.error({ error }, "Failed to load competition info");
    return "continue"; // keep polling in case the API recovers
  }

  if (isCompetitionEnded(competition)) {
    logger.info(
      { competitionId: competition.id, status: competition.status },
      "Competition ended, stopping agent",
    );
    return "stop";
  }

  if (!isCompetitionActive(competition)) {
    logger.info(
      { competitionId: competition.id, status: competition.status },
      "Competition not yet active, waiting",
    );
    return "continue";
  }

  let games: Game[] = [];
  try {
    games = await getCompetitionGames(config.competitionId);
  } catch (error) {
    logger.error({ error }, "Failed to load games list");
    return "continue";
  }

  logger.info({ label, gameCount: games.length }, "Processing games");
  for (const game of games) {
    try {
      await handleGame(rules, game);
    } catch (error) {
      logger.error({ error, gameId: game.id }, "Unhandled error for game");
    }
  }
  return "continue";
}

/**
 * Continuously repeats cycles with a fixed delay.
 * Exits gracefully when the competition reaches a terminal state (completed).
 * @param rules - Competition rules metadata.
 */
async function pollLoop(rules: CompetitionRules): Promise<void> {
  while (true) {
    const result = await runCycle(rules, "poll");
    if (result === "stop") {
      logger.info("Competition completed, exiting poll loop");
      break;
    }
    await sleep(POLL_INTERVAL_MS);
  }
}

/** Program entry point that initializes rules and begins polling. */
async function main(): Promise<void> {
  logger.info(
    { competitionId: config.competitionId },
    "Starting NFL prediction agent",
  );
  let rules: CompetitionRules;
  try {
    rules = await getCompetitionRules(config.competitionId);
  } catch (error) {
    logger.error({ error }, "Unable to load competition rules");
    return;
  }

  await runCycle(rules, "initial");
  await pollLoop(rules);
}

main().catch((error) => {
  logger.fatal({ error }, "Agent crashed");
  process.exit(1);
});
