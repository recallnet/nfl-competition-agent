import 'dotenv/config';
import { readFileSync } from 'fs';
import { join } from 'path';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';

// src/config.ts
function getCliArg(flag) {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i += 1) {
    const current = args[i];
    if (!current) {
      continue;
    }
    if (current.startsWith(`${flag}=`)) {
      return current.split("=")[1];
    }
    if (current === flag) {
      return args[i + 1];
    }
  }
  return void 0;
}
function loadConfig() {
  const aiApiKey = process.env.AI_GATEWAY_API_KEY;
  if (!aiApiKey) {
    throw new Error("AI_GATEWAY_API_KEY is required");
  }
  const rawAiGatewayBaseUrl = process.env.AI_GATEWAY_BASE_URL;
  if (!rawAiGatewayBaseUrl) {
    throw new Error(
      "AI_GATEWAY_BASE_URL is required when using the AI gateway"
    );
  }
  const aiGatewayBaseUrl = rawAiGatewayBaseUrl.replace(/\/$/, "");
  const recallApiKey = process.env.RECALL_AGENT_API_KEY;
  if (!recallApiKey) {
    throw new Error("RECALL_AGENT_API_KEY is required");
  }
  const rawBaseUrl = process.env.RECALL_BASE_URL || "http://localhost:3000/api";
  const baseUrl = rawBaseUrl.replace(/\/$/, "");
  const cliCompetitionId = getCliArg("--competition-id");
  const competitionId = cliCompetitionId || process.env.COMPETITION_ID;
  if (!competitionId) {
    throw new Error(
      "competitionId is required via --competition-id or COMPETITION_ID env var"
    );
  }
  return {
    aiApiKey,
    aiGatewayBaseUrl,
    recallApiKey,
    baseUrl,
    competitionId
  };
}
var config = loadConfig();

// src/httpClient.ts
function buildUrl(path) {
  if (!path.startsWith("/")) {
    throw new Error(`Path must start with '/': ${path}`);
  }
  return `${config.baseUrl}${path}`;
}
async function request(path, init = {}) {
  const url = buildUrl(path);
  const headers = new Headers(init.headers || {});
  if (!init.skipAuth) {
    headers.set("Authorization", `Bearer ${config.recallApiKey}`);
  }
  headers.set("Content-Type", "application/json");
  const response = await fetch(url, {
    ...init,
    headers
  });
  const contentType = response.headers.get("content-type");
  let payload = null;
  if (contentType && contentType.includes("application/json")) {
    payload = await response.json();
  } else {
    payload = await response.text();
  }
  if (!response.ok) {
    const errorMessage = typeof payload === "string" ? payload : JSON.stringify(payload);
    throw new Error(
      `HTTP ${response.status} ${response.statusText}: ${errorMessage}`
    );
  }
  return payload;
}
function getJson(path, options) {
  return request(path, { ...options, method: "GET" });
}
function postJson(path, body, options) {
  return request(path, {
    ...options,
    method: "POST",
    body: JSON.stringify(body)
  });
}

// src/nflApi.ts
async function getCompetitionRules(competitionId) {
  const response = await getJson(`/nfl/competitions/${competitionId}/rules`);
  if (!response?.data) {
    throw new Error("Competition rules payload missing expected data object");
  }
  return response.data;
}
async function getCompetitionGames(competitionId) {
  const response = await getJson(
    `/nfl/competitions/${competitionId}/games`
  );
  return response.data.games;
}
async function getGameInfo(competitionId, gameId) {
  const response = await getJson(
    `/nfl/competitions/${competitionId}/games/${gameId}`
  );
  return response.data.game;
}
async function getGamePlays(competitionId, gameId, options = {}) {
  const params = new URLSearchParams();
  if (options.limit) params.set("limit", String(options.limit));
  if (options.offset) params.set("offset", String(options.offset));
  if (options.latest) params.set("latest", "true");
  const query = params.toString();
  const path = query ? `/nfl/competitions/${competitionId}/games/${gameId}/plays?${query}` : `/nfl/competitions/${competitionId}/games/${gameId}/plays`;
  const response = await getJson(path);
  return response.data.plays;
}
async function getGamePredictions(competitionId, gameId, agentId) {
  const params = new URLSearchParams();
  params.set("agentId", agentId);
  const query = params.toString();
  const path = query ? `/nfl/competitions/${competitionId}/games/${gameId}/predictions?${query}` : `/nfl/competitions/${competitionId}/games/${gameId}/predictions`;
  const response = await getJson(path);
  return response.data.predictions;
}
async function postGamePrediction(competitionId, gameId, body) {
  const response = await postJson(
    `/nfl/competitions/${competitionId}/games/${gameId}/predictions`,
    body
  );
  if (response && typeof response === "object") {
    const responseObject = response;
    const data = responseObject.data;
    if (data && typeof data === "object" && "prediction" in data) {
      return data.prediction;
    }
    if ("prediction" in responseObject && responseObject.prediction) {
      return responseObject.prediction;
    }
  }
  return void 0;
}
var modelName = process.env.AI_MODEL || "gpt-4o-mini";
var basePromptPath = join(process.cwd(), "prompts", "game_prediction.md");
var basePrompt = readFileSync(basePromptPath, "utf-8").trim();
var openai = createOpenAI({
  apiKey: config.aiApiKey,
  baseURL: config.aiGatewayBaseUrl
});
function generateGamePredictionPrompt(context) {
  const { rules, game, plays = [], previousPrediction } = context;
  const lines = [basePrompt];
  const formulaSummary = [
    rules.scoringFormula?.description,
    rules.scoringFormula?.timeNormalization,
    rules.scoringFormula?.weight,
    rules.scoringFormula?.probability,
    rules.scoringFormula?.actual
  ].filter(Boolean).join(" | ");
  lines.push(
    `Competition rules: type=${rules.predictionType}, scoring=${rules.scoringMethod}, formula=${formulaSummary || "see league description"}.`
  );
  if (rules.predictionRules) {
    const { canUpdate, updateWindow, scoringWindow, preGamePredictions } = rules.predictionRules;
    lines.push(
      `Official rules: canUpdate=${canUpdate ? "yes" : "no"}; updateWindow=${updateWindow}; scoringWindow=${scoringWindow}; preGamePredictions=${preGamePredictions}.`
    );
  }
  if (rules.confidenceRange) {
    const { min, max, description } = rules.confidenceRange;
    lines.push(
      `Confidence range: min=${min}, max=${max}${description ? ` (${description})` : ""}.`
    );
  }
  lines.push(
    `Game info: ${game.awayTeam} at ${game.homeTeam}. Season ${game.season}, week ${game.week}.`
  );
  lines.push(
    `Status=${game.status}, startTime=${game.startTime}, spread=${game.spread ?? "N/A"}, overUnder=${game.overUnder ?? "N/A"}, venue=${game.venue ?? "unknown"}.`
  );
  if (previousPrediction) {
    lines.push(
      `Previous prediction: winner=${previousPrediction.predictedWinner}, confidence=${previousPrediction.confidence}, createdAt=${previousPrediction.createdAt ?? "unknown"}, reason=${previousPrediction.reason ?? "n/a"}.`
    );
  }
  if (plays.length) {
    const snippets = plays.slice(-5).map((play) => {
      return `${play.quarterName} ${play.timeRemainingMinutes}:${String(
        play.timeRemainingSeconds
      ).padStart(2, "0")} ${play.team} ${play.playType} - ${play.description}`;
    });
    lines.push("Recent plays (latest first):");
    lines.push(snippets.reverse().join("\n"));
  }
  lines.push("Return only valid JSON. Do not include markdown fences.");
  return lines.join("\n");
}
async function callPredictionModel(context) {
  const prompt = generateGamePredictionPrompt(context);
  try {
    const { text } = await generateText({
      model: openai(modelName),
      prompt,
      temperature: 0.4
    });
    const trimmed = text.trim();
    const jsonStart = trimmed.indexOf("{");
    const jsonEnd = trimmed.lastIndexOf("}");
    if (jsonStart === -1 || jsonEnd === -1) {
      throw new Error("AI response missing JSON object");
    }
    const parsed = JSON.parse(trimmed.slice(jsonStart, jsonEnd + 1));
    if (typeof parsed.predictedWinner !== "string" || typeof parsed.confidence !== "number" || typeof parsed.reason !== "string") {
      throw new Error("AI response missing required keys");
    }
    return {
      predictedWinner: parsed.predictedWinner,
      confidence: Math.min(Math.max(parsed.confidence, 0), 1),
      reason: parsed.reason
    };
  } catch (error) {
    console.warn("AI call failed", error);
    if (error instanceof Error) {
      throw error;
    }
    throw new Error("Unknown AI call failure");
  }
}

// src/agentLogic.ts
function shouldUpdatePrediction({
  gameStatus,
  latestPrediction,
  newPrediction
}) {
  if (gameStatus === "final") {
    return false;
  }
  if (!latestPrediction) {
    return true;
  }
  const sameWinner = latestPrediction.predictedWinner === newPrediction.predictedWinner;
  const confidenceDelta = Math.abs(
    latestPrediction.confidence - newPrediction.confidence
  );
  if (sameWinner && confidenceDelta < 0.01) {
    return false;
  }
  return true;
}
function isGameActiveForPolling(game) {
  return game.status === "scheduled" || game.status === "in_progress";
}
function hasGameEnded(game) {
  return game.status === "final";
}

// src/agent.ts
var POLL_INTERVAL_MS = 5 * 60 * 1e3;
var AGENT_ID = process.env.AGENT_ID || "nfl-game-agent";
async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
async function fetchLatestPrediction(competitionId, gameId) {
  try {
    const predictions = await getGamePredictions(
      competitionId,
      gameId,
      AGENT_ID
    );
    return predictions[0];
  } catch (error) {
    console.error(`Failed to fetch predictions for ${gameId}:`, error);
    return void 0;
  }
}
async function buildPrediction(rules, game, latestPrediction) {
  const plays = game.status === "in_progress" ? await getGamePlays(config.competitionId, game.id, {
    limit: 50,
    latest: true
  }).catch((error) => {
    console.warn(`Unable to load plays for ${game.id}:`, error);
    return [];
  }) : [];
  return callPredictionModel({
    rules,
    game,
    plays,
    previousPrediction: latestPrediction ? {
      predictedWinner: latestPrediction.predictedWinner,
      confidence: latestPrediction.confidence,
      createdAt: latestPrediction.createdAt,
      reason: latestPrediction.reason
    } : void 0
  });
}
async function handleGame(rules, baseGame) {
  if (hasGameEnded(baseGame)) {
    console.log(`Skipping final game ${baseGame.id}`);
    return;
  }
  let detailedGame;
  try {
    detailedGame = await getGameInfo(config.competitionId, baseGame.id);
  } catch (error) {
    console.error(`Failed to load game info for ${baseGame.id}:`, error);
    return;
  }
  if (!isGameActiveForPolling(detailedGame)) {
    console.log(
      `Game ${detailedGame.id} not active for polling (status=${detailedGame.status})`
    );
    return;
  }
  const latestPrediction = await fetchLatestPrediction(
    config.competitionId,
    detailedGame.id
  );
  let aiPrediction;
  try {
    aiPrediction = await buildPrediction(rules, detailedGame, latestPrediction);
  } catch (error) {
    console.error(
      `Skipping prediction for ${detailedGame.id} due to model error:`,
      error
    );
    return;
  }
  const shouldUpdate = shouldUpdatePrediction({
    gameStatus: detailedGame.status,
    latestPrediction,
    newPrediction: {
      predictedWinner: aiPrediction.predictedWinner,
      confidence: aiPrediction.confidence
    }
  });
  if (!shouldUpdate) {
    console.log(`No update needed for game ${detailedGame.id}`);
    return;
  }
  try {
    const prediction = await postGamePrediction(
      config.competitionId,
      detailedGame.id,
      aiPrediction
    );
    if (prediction?.id) {
      console.log(
        `Submitted prediction ${prediction.id} for game ${detailedGame.id}`
      );
    } else {
      console.log(`Submitted prediction for game ${detailedGame.id}`);
    }
  } catch (error) {
    console.error(`Failed to submit prediction for ${detailedGame.id}:`, error);
  }
}
async function runCycle(rules, label) {
  let games = [];
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
async function pollLoop(rules) {
  while (true) {
    await runCycle(rules, "poll");
    await sleep(POLL_INTERVAL_MS);
  }
}
async function main() {
  console.log(
    `Starting NFL prediction agent for competition ${config.competitionId}`
  );
  let rules;
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
//# sourceMappingURL=agent.js.map
//# sourceMappingURL=agent.js.map