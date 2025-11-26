import {
  hasGameEnded,
  isGameActiveForPolling,
  shouldUpdatePrediction,
} from "./agentLogic.js";
import { PredictionPayload, callPredictionModel } from "./aiClient.js";
import { config } from "./config.js";
import {
  getCompetitionGames,
  getCompetitionRules,
  getGameInfo,
  getGamePlays,
  getGamePredictions,
  postGamePrediction,
} from "./nflApi.js";
import {
  CompetitionRules,
  CompetitionRulesResponse,
  Game,
  Prediction,
} from "./types.js";

/**
 * Interval between polling cycles in milliseconds.
 */
const POLL_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Identifier provided when scoping predictions to this agent.
 */
const AGENT_ID = process.env.AGENT_ID || "nfl-game-agent";

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
    console.error(`Failed to fetch predictions for ${gameId}:`, error);
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
          console.warn(`Unable to load plays for ${game.id}:`, error);
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
    console.log(`Skipping final game ${baseGame.id}`);
    return;
  }

  let detailedGame: Game;
  try {
    detailedGame = await getGameInfo(config.competitionId, baseGame.id);
  } catch (error) {
    console.error(`Failed to load game info for ${baseGame.id}:`, error);
    return;
  }

  if (!isGameActiveForPolling(detailedGame)) {
    console.log(
      `Game ${detailedGame.id} not active for polling (status=${detailedGame.status})`,
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
    console.error(
      `Skipping prediction for ${detailedGame.id} due to model error:`,
      error,
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
    console.log(`No update needed for game ${detailedGame.id}`);
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
      console.log(
        `Submitted prediction ${prediction.id} for game ${detailedGame.id} at ${submittedAt}`,
      );
    } else {
      console.log(
        `Submitted prediction for game ${detailedGame.id} at ${submittedAt}`,
      );
    }
  } catch (error) {
    console.error(
      `Failed to submit prediction for ${detailedGame.id} at ${now}:`,
      error,
    );
  }
}

/**
 * Executes a single iteration across all games matching a label for logging.
 * @param rules - Competition rules metadata.
 * @param label - Tag used in log statements (e.g., "initial").
 */
async function runCycle(rules: CompetitionRules, label: string): Promise<void> {
  let games: Game[] = [];
  try {
    games = await getCompetitionGames(config.competitionId);
  } catch (error) {
    console.error("Failed to load games list:", error);
    return;
  }

  console.log(`[${label}] Processing ${games.length} games`);
  for (const game of games) {
    try {
      await handleGame(rules, game);
    } catch (error) {
      console.error(`Unhandled error for game ${game.id}:`, error);
    }
  }
}

/**
 * Continuously repeats cycles with a fixed delay.
 * @param rules - Competition rules metadata.
 */
async function pollLoop(rules: CompetitionRules): Promise<void> {
  while (true) {
    await runCycle(rules, "poll");
    await sleep(POLL_INTERVAL_MS);
  }
}

/** Program entry point that initializes rules and begins polling. */
async function main(): Promise<void> {
  console.log(
    `Starting NFL prediction agent for competition ${config.competitionId}`,
  );
  let rules: CompetitionRules;
  try {
    rules = await getCompetitionRules(config.competitionId);
  } catch (error) {
    console.error("Unable to load competition rules, exiting:", error);
    return;
  }

  await runCycle(rules, "initial");
  await pollLoop(rules);
}

main().catch((error) => {
  console.error("Agent crashed:", error);
  process.exit(1);
});
