import { globalLogger } from "../utils/logger.js";

export class KeepAliveService {
  private static intervalId: NodeJS.Timeout | null = null;
  // Render free tier spins down after 15 minutes of inactivity
  // We'll ping every 1.5 minutes to be safe
  private static readonly PING_INTERVAL = 1.5 * 60 * 1000;

  static start() {
    const url = process.env.RENDER_EXTERNAL_URL || process.env.SELF_PING_URL;

    if (!url) {
      globalLogger.info(
        "KeepAliveService: No RENDER_EXTERNAL_URL or SELF_PING_URL found. Skipping self-ping."
      );
      return;
    }

    // Ensure URL has protocol
    const targetUrl = url.startsWith("http") ? url : `https://${url}`;
    const pingUrl = `${targetUrl}/ping`;

    globalLogger.info(`KeepAliveService: Starting self-ping to ${pingUrl}`);

    // Clear existing interval if any
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }

    this.intervalId = setInterval(async () => {
      try {
        globalLogger.debug(`KeepAliveService: Pinging ${pingUrl}...`);
        const response = await fetch(pingUrl);

        if (response.ok) {
          globalLogger.debug("KeepAliveService: Ping successful");
        } else {
          globalLogger.warn(
            `KeepAliveService: Ping failed with status ${response.status}`
          );
        }
      } catch (error: any) {
        globalLogger.error("KeepAliveService: Ping failed", {
          error: error.message,
        });
      }
    }, this.PING_INTERVAL);
  }

  static stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      globalLogger.info("KeepAliveService: Stopped");
    }
  }
}
