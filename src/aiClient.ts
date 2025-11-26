import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";
import { readFileSync } from "node:fs";
import { join } from "node:path";

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
interface PromptContext {
  rules: CompetitionRules;
  game: Game;
  plays?: Play[];
  previousPrediction?: Pick<
    Prediction,
    "predictedWinner" | "confidence" | "createdAt" | "reason"
  >;
}

/**
 * Builds the textual instructions for the prediction model.
 * @param context - Game/rule/plays data fed into the model.
 * @returns A multiline string prompt.
 */
export function generateGamePredictionPrompt(context: PromptContext): string {
  const { rules, game, plays = [], previousPrediction } = context;
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
    `Status=${game.status}, startTime=${game.startTime}, spread=${
      game.spread ?? "N/A"
    }, overUnder=${game.overUnder ?? "N/A"}, venue=${game.venue ?? "unknown"}.`,
  );

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
