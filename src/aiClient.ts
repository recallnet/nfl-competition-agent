import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { BettingLines } from "./agentLogic.js";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { CompetitionRules, Game, Play, Prediction } from "./types.js";

/**
 * Model identifier used for the AI SDK.
 */
const modelName = process.env.AI_MODEL || "gpt-4o-mini";

/**
 * Absolute path to the shared system prompt.
 */
const basePromptPath = join(process.cwd(), "prompts", "game_prediction.md");

/**
 * Static content prepended to every model prompt.
 */
const basePrompt = readFileSync(basePromptPath, "utf-8").trim();

/**
 * Thin wrapper around the AI SDK client.
 */
const openai = createOpenAI({
  apiKey: config.aiApiKey,
  baseURL: config.aiGatewayBaseUrl,
});

/**
 * Structured payload produced by the model.
 */
export interface PredictionPayload {
  predictedWinner: string;
  confidence: number;
  reason: string;
}

/**
 * Context objects aggregated for prompt generation.
 */
export interface PromptContext {
  rules: CompetitionRules;
  game: Game;
  plays?: Play[];
  previousPrediction?: Pick<
    Prediction,
    "predictedWinner" | "confidence" | "createdAt" | "reason"
  >;
  /** Previous betting lines when a line change triggered this prediction. */
  previousLines?: BettingLines;
}

/**
 * Formats a betting line value for display.
 * @param value - The line value (may be null/undefined).
 * @returns Formatted string or "N/A".
 */
function formatLine(value: number | null | undefined): string {
  return value != null ? String(value) : "N/A";
}

/**
 * Builds the textual instructions for the prediction model.
 * @param context - Game/rule/plays data fed into the model.
 * @returns A multiline string prompt.
 */
export function generateGamePredictionPrompt(context: PromptContext): string {
  const {
    rules,
    game,
    plays = [],
    previousPrediction,
    previousLines,
  } = context;
  const lines: string[] = [basePrompt];
  const formulaSummary = [
    rules.scoringFormula.description,
    rules.scoringFormula.timeNormalization,
    rules.scoringFormula.weight,
    rules.scoringFormula.probability,
    rules.scoringFormula.actual,
  ]
    .filter(Boolean)
    .join(" | ");
  lines.push(
    `Competition rules: type=${rules.predictionType}, scoring=${
      rules.scoringMethod
    }, formula=${formulaSummary || "see league description"}.`,
  );
  if (rules.predictionRules) {
    const { canUpdate, updateWindow, scoringWindow, preGamePredictions } =
      rules.predictionRules;
    lines.push(
      `Official rules: canUpdate=${
        canUpdate ? "yes" : "no"
      }; updateWindow=${updateWindow}; scoringWindow=${scoringWindow}; preGamePredictions=${preGamePredictions}.`,
    );
  }
  if (rules.confidenceRange) {
    const { min, max, description } = rules.confidenceRange;
    lines.push(
      `Confidence range: min=${min}, max=${max}${
        description ? ` (${description})` : ""
      }.`,
    );
  }

  lines.push(
    `Game info: ${game.awayTeam} at ${game.homeTeam}. Season ${game.season}, week ${game.week}.`,
  );
  lines.push(
    `Status=${game.status}, startTime=${game.startTime}, venue=${game.venue ?? "unknown"}.`,
  );

  // For scheduled games, explicitly state there's no live data.
  if (game.status === "scheduled") {
    lines.push(
      "IMPORTANT: This game has NOT started yet. There is NO score, NO plays, NO live data. Base your prediction ONLY on pregame factors: betting lines, team records, matchup history, and general knowledge.",
    );
  }

  // Include current and previous betting lines.
  lines.push(
    `Current betting lines: spread=${formatLine(game.spread)}, overUnder=${formatLine(game.overUnder)}, homeMoneyLine=${formatLine(game.homeTeamMoneyLine)}, awayMoneyLine=${formatLine(game.awayTeamMoneyLine)}.`,
  );
  if (previousLines) {
    lines.push("Note: betting line changes detected since last prediction.");
    lines.push(
      `Previous lines: spread=${formatLine(previousLines.spread)}, overUnder=${formatLine(previousLines.overUnder)}, homeMoneyLine=${formatLine(previousLines.homeTeamMoneyLine)}, awayMoneyLine=${formatLine(previousLines.awayTeamMoneyLine)}.`,
    );
  }

  if (previousPrediction) {
    lines.push(
      `Previous prediction: winner=${
        previousPrediction.predictedWinner
      }, confidence=${previousPrediction.confidence}, createdAt=${
        previousPrediction.createdAt ?? "unknown"
      }, reason=${previousPrediction.reason ?? "n/a"}.`,
    );
  }

  if (plays.length) {
    const snippets = plays.slice(-5).map((play) => {
      return `${play.quarterName} ${play.timeRemainingMinutes}:${String(
        play.timeRemainingSeconds,
      ).padStart(2, "0")} ${play.team} ${play.playType} - ${play.description}`;
    });
    lines.push("Recent plays (latest first):");
    lines.push(snippets.reverse().join("\n"));
  }

  lines.push("Return only valid JSON. Do not include markdown fences.");
  return lines.join("\n");
}

/**
 * Calls the Vercel AI SDK and enforces the JSON contract, throwing on invalid output.
 * @param context - Game/rule/plays data fed into the model.
 * @returns Parsed prediction payload.
 */
export async function callPredictionModel(
  context: PromptContext,
): Promise<PredictionPayload> {
  const prompt = generateGamePredictionPrompt(context);
  try {
    const { text } = await generateText({
      model: openai(modelName),
      prompt,
      temperature: 0.4,
    });
    const trimmed = text.trim();
    const jsonStart = trimmed.indexOf("{");
    const jsonEnd = trimmed.lastIndexOf("}");
    if (jsonStart === -1 || jsonEnd === -1) {
      throw new Error("AI response missing JSON object");
    }
    const parsed = JSON.parse(trimmed.slice(jsonStart, jsonEnd + 1));
    if (
      typeof parsed.predictedWinner !== "string" ||
      typeof parsed.confidence !== "number" ||
      typeof parsed.reason !== "string"
    ) {
      throw new Error("AI response missing required keys");
    }
    return {
      predictedWinner: parsed.predictedWinner,
      confidence: Math.min(Math.max(parsed.confidence, 0), 1),
      reason: parsed.reason,
    };
  } catch (error) {
    logger.warn({ error }, "AI call failed");
    if (error instanceof Error) {
      throw error;
    }
    throw new Error("Unknown AI call failure");
  }
}
