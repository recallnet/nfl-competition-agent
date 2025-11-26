import "dotenv/config";

/**
 * Runtime configuration resolved from environment variables and CLI flags.
 */
export interface Config {
  /** API key for the AI gateway powering the model. */
  aiApiKey: string;
  /** Optional override for the AI gateway base URL. */
  aiGatewayBaseUrl: string;
  /** Bearer token for interacting with the Recall NFL API. */
  recallApiKey: string;
  /** Base HTTP endpoint for the Recall NFL API sans trailing slash. */
  baseUrl: string;
  /** Target competition identifier for predictions. */
  competitionId: string;
  /** Minimum log level forwarded to Pino. */
  logLevel: string;
}

/**
 * Extracts CLI argument values supporting both `--flag=value` and `--flag value` forms.
 * @param flag - The CLI flag to search for (e.g. `--competition-id`).
 * @returns The associated value when present.
 */
function getCliArg(flag: string): string | undefined {
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
  return undefined;
}

/**
 * Resolves configuration from env/CLI and ensures required properties exist.
 * @returns Fully populated {@link Config}.
 * @throws Error when mandatory variables are absent.
 */
function loadConfig(): Config {
  const aiApiKey = process.env.AI_GATEWAY_API_KEY;
  if (!aiApiKey) {
    throw new Error("AI_GATEWAY_API_KEY is required");
  }

  const aiGatewayBaseUrl = process.env.AI_GATEWAY_BASE_URL
    ? process.env.AI_GATEWAY_BASE_URL.replace(/\/$/, "")
    : "https://ai-gateway.vercel.sh/v1";

  const recallApiKey = process.env.RECALL_AGENT_API_KEY;
  if (!recallApiKey) {
    throw new Error("RECALL_AGENT_API_KEY is required");
  }

  const rawBaseUrl =
    process.env.RECALL_BASE_URL ||
    "https://api.competitions.recall.network/api/";
  const baseUrl = rawBaseUrl.replace(/\/$/, "");

  const cliCompetitionId = getCliArg("--competition-id");
  const competitionId = cliCompetitionId || process.env.COMPETITION_ID;
  if (!competitionId) {
    throw new Error(
      "competitionId is required via --competition-id or COMPETITION_ID env var",
    );
  }

  const logLevel = process.env.LOG_LEVEL?.toLowerCase() || "info";

  return {
    aiApiKey,
    aiGatewayBaseUrl,
    recallApiKey,
    baseUrl,
    competitionId,
    logLevel,
  };
}

/**
 * Shared singleton configuration instance for downstream modules.
 */
export const config = loadConfig();
