import winston from "winston";
import DailyRotateFile from "winston-daily-rotate-file";

export enum LogLevel {
  ERROR = "error",
  WARN = "warn",
  INFO = "info",
  DEBUG = "debug",
}

export enum LoggerApp {
  SERVER = "server",
  DATABASE = "database",
}

export interface LoggerSettings {
  enable: boolean;
  level: LogLevel;
}

export interface LoggerConfig {
  apps: Record<LoggerApp, LoggerSettings>;
}

class DynamicLogger {
  private logger: winston.Logger;
  private sqlLogger: winston.Logger;
  private loggerStatus: boolean = true;
  private sqlLoggerStatus: boolean = true;

  constructor() {
    this.logger = winston.createLogger({
      level: "info",
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          return `${timestamp} - ${level.toUpperCase()} - ${message} ${
            Object.keys(meta).length ? JSON.stringify(meta) : ""
          }`;
        })
      ),
      transports: [
        new winston.transports.Console(),
        new DailyRotateFile({
          filename: "logs/spur-backend-%DATE%.log",
          datePattern: "YYYY-MM-DD",
          maxSize: "10m",
          maxFiles: "5d",
        }),
      ],
    });

    this.sqlLogger = winston.createLogger({
      level: "info",
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.printf(({ timestamp, level, message }) => {
          return `${timestamp} - SQL - ${level.toUpperCase()} - ${message}`;
        })
      ),
      transports: [
        new winston.transports.Console(),
        new DailyRotateFile({
          filename: "logs/spur-sql-%DATE%.log",
          datePattern: "YYYY-MM-DD",
          maxSize: "10m",
          maxFiles: "5d",
        }),
      ],
    });
  }

  updateLoggingSettings(config: LoggerConfig) {
    for (const [app, settings] of Object.entries(config.apps)) {
      if (app === LoggerApp.SERVER) {
        if (settings.enable) {
          this.setComponentLogLevel("server", settings.level);
          this.loggerStatus = true;
        } else {
          this.disableServerLogging();
          this.loggerStatus = false;
        }
      } else if (app === LoggerApp.DATABASE) {
        if (settings.enable) {
          this.setComponentLogLevel("database", settings.level);
          this.sqlLoggerStatus = true;
        } else {
          this.disableSqlLogging();
          this.sqlLoggerStatus = false;
        }
      }
    }
  }

  setComponentLogLevel(component: string, level: LogLevel) {
    if (component === "server") {
      this.logger.level = level;
    } else if (component === "database") {
      this.sqlLogger.level = level;
    }
  }

  disableSqlLogging() {
    this.sqlLogger.level = "info"; // Set to info to minimize logs
  }

  disableServerLogging() {
    this.logger.level = "info"; // Set to info to minimize logs
  }

  getServerLogLevel(): string {
    return this.logger.level;
  }

  getSqlLogLevel(): string {
    return this.sqlLogger.level;
  }

  isLoggingEnabled(component: string): boolean {
    if (component === "server") {
      return this.loggerStatus;
    } else if (component === "database") {
      return this.sqlLoggerStatus;
    }
    return false;
  }

  getLogLevel(component: string): string {
    if (component === "server") {
      return this.logger.level;
    } else if (component === "database") {
      return this.sqlLogger.level;
    }
    return "unknown";
  }

  // Convenience methods
  error(message: string, meta?: any) {
    this.logger.error(message, meta);
  }

  warn(message: string, meta?: any) {
    this.logger.warn(message, meta);
  }

  info(message: string, meta?: any) {
    this.logger.info(message, meta);
  }

  debug(message: string, meta?: any) {
    this.logger.debug(message, meta);
  }

  // SQL logger
  sqlError(message: string, meta?: any) {
    this.sqlLogger.error(message, meta);
  }

  sqlInfo(message: string, meta?: any) {
    this.sqlLogger.info(message, meta);
  }
}

export const globalLogger = new DynamicLogger();
