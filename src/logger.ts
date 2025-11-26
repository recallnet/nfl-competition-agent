import pino, { type LevelWithSilent } from "pino";

import { config } from "./config.js";

const level = (config.logLevel || "info") as LevelWithSilent;

/**
 * Shared Pino logger configured with the agent name and log level.
 */
export const logger = pino({
  name: "nfl-prediction-agent",
  level,
});
