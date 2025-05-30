import os from 'node:os';
import path from 'node:path';

import { z } from 'zod';

import { AppError } from './errors/AppError';
import { Result } from './errors/Result';
import { toAppError } from './errors/utils';
import { FileUtils } from './utils/FileUtils';

import type { AIModel } from './models/AIModel';
import type { APIKeyStorage } from './models/APIKeyStorage';
import type { TagBehavior } from './models/TagBehavior';
import type { LogLevel } from './utils/Logger';

export interface Config {
  defaultModel: AIModel;
  defaultTagBehavior: TagBehavior;
  minConfidence: number;
  reviewThreshold: number;
  generateExplanations: boolean;
  apiKeyStorage: APIKeyStorage;
  apiKey: string;
  concurrency: number;
  cache: {
    enabled: boolean;
    directory: string;
  };
  logging: {
    level: LogLevel;
    console: boolean;
    file: boolean;
    filePath: string;
  };
}

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: Config = {
  defaultModel: 'gpt-4' as AIModel,
  defaultTagBehavior: 'merge' as TagBehavior,
  minConfidence: 0.7,
  reviewThreshold: 0.5,
  generateExplanations: true,
  apiKeyStorage: 'local' as APIKeyStorage,
  apiKey: '',
  concurrency: 3,
  cache: {
    enabled: true,
    directory: path.join(os.homedir(), '.cache', 'magus-mark'),
  },
  logging: {
    level: 'info' as LogLevel,
    console: true,
    file: false,
    filePath: path.join(os.homedir(), '.logs', 'magus-mark.log'),
  },
};

/**
 * Configuration schema
 */
const configSchema = z.object({
  defaultModel: z.string(),
  defaultTagBehavior: z.enum(['append', 'replace', 'merge', 'suggest']),
  minConfidence: z.number().min(0).max(1),
  reviewThreshold: z.number().min(0).max(1),
  generateExplanations: z.boolean(),
  apiKeyStorage: z.enum(['local', 'system']),
  apiKey: z.string(),
  concurrency: z.number().int().positive().max(10),
  cache: z.object({
    enabled: z.boolean(),
    directory: z.string(),
  }),
  logging: z.object({
    level: z.enum(['error', 'warn', 'info', 'debug']),
    console: z.boolean(),
    file: z.boolean(),
    filePath: z.string(),
  }),
});

/**
 * Configuration error type
 */
export class ConfigurationError extends AppError {
  constructor(message: string, cause?: Error, context?: Record<string, unknown>) {
    super(message, {
      code: 'CONFIGURATION_ERROR',
      cause,
      context,
      recoverable: true,
    });
  }

  /**
   * Convert a standard Error to a ConfigurationError
   */
  static from(error: Error, message?: string): ConfigurationError {
    return new ConfigurationError(
      message ?? error.message,
      error instanceof AppError ? error : undefined,
      error instanceof AppError ? error.context : undefined
    );
  }
}

/**
 * Manages application configuration with type-safe loading, saving, and updating
 */
export class ConfigManager {
  private config: Config;
  private readonly fileUtils: FileUtils;

  /**
   * Creates a new ConfigManager instance
   * @param configPath - Optional custom config path
   */
  constructor(private readonly configPath: string = ConfigManager.getDefaultConfigPath()) {
    this.config = DEFAULT_CONFIG;
    this.fileUtils = new FileUtils(configPath);
  }

  /**
   * Gets the default config file path
   */
  static getDefaultConfigPath(): string {
    return path.join(os.homedir(), '.config', 'magus-mark', 'config.json');
  }

  /**
   * Gets the current configuration
   */
  getConfig(): Config {
    return { ...this.config };
  }

  /**
   * Creates a configuration error
   */
  private createError(message: string, cause?: Error, context?: Record<string, unknown>): ConfigurationError {
    return new ConfigurationError(message, cause, { ...context, path: this.configPath });
  }

  /**
   * Loads configuration from file
   */
  async load(): Promise<Result<Config, ConfigurationError>> {
    try {
      if (await this.fileUtils.fileExists(this.configPath)) {
        const result = await this.fileUtils.readJsonFile(this.configPath, configSchema);
        if (result.isOk()) {
          this.config = result.getValue();
          return Result.ok(this.getConfig()) as Result<Config, ConfigurationError>;
        }
        const error = ConfigurationError.from(result.getError(), 'Error parsing config');
        return Result.fail<Config, ConfigurationError>(error);
      }

      // Use defaults if file doesn't exist
      const saveResult = await this.save();
      if (saveResult.isFail()) {
        return Result.fail<Config, ConfigurationError>(saveResult.getError());
      }
      return Result.ok(this.getConfig()) as Result<Config, ConfigurationError>;
    } catch (error) {
      return Result.fail<Config, ConfigurationError>(this.createError('Error loading config', toAppError(error)));
    }
  }

  /**
   * Saves current configuration to file
   */
  async save(): Promise<Result<void, ConfigurationError>> {
    try {
      const validatedConfig = configSchema.parse(this.config);
      const writeResult = await this.fileUtils.writeJsonFile(this.configPath, validatedConfig);
      if (writeResult.isFail()) {
        const error = ConfigurationError.from(writeResult.getError(), 'Failed to save config');
        return Result.fail<never, ConfigurationError>(error);
      }
      return Result.ok(undefined) as Result<void, ConfigurationError>;
    } catch (error) {
      return Result.fail<never, ConfigurationError>(this.createError('Failed to save config', toAppError(error)));
    }
  }

  /**
   * Updates specific configuration values
   * @param updates - Partial configuration updates
   */
  async update(updates: Partial<Config>): Promise<Result<Config, ConfigurationError>> {
    try {
      const updatedConfig = { ...this.config, ...updates };

      // Recursively merge nested objects
      if (updates.cache) {
        updatedConfig.cache = { ...this.config.cache, ...updates.cache };
      }

      if (updates.logging) {
        updatedConfig.logging = { ...this.config.logging, ...updates.logging };
      }

      // Validate before updating
      this.config = configSchema.parse(updatedConfig);
      const saveResult = await this.save();

      if (saveResult.isFail()) {
        return Result.fail<Config, ConfigurationError>(saveResult.getError());
      }
      return Result.ok(this.getConfig()) as Result<Config, ConfigurationError>;
    } catch (error) {
      return Result.fail<Config, ConfigurationError>(
        this.createError('Failed to update config', toAppError(error), { updates })
      );
    }
  }

  /**
   * Gets a specific configuration value by key path
   * @param keyPath - Dot-notation path to config value
   */
  get(keyPath: string): unknown {
    return keyPath.split('.').reduce<unknown>((obj, key) => {
      if (obj && typeof obj === 'object') {
        return (obj as Record<string, unknown>)[key];
      }
      return undefined;
    }, this.config);
  }

  /**
   * Sets a specific configuration value by key path
   * @param keyPath - Dot-notation path to config value
   * @param value - Value to set
   */
  async set(keyPath: string, value: unknown): Promise<Result<Config, ConfigurationError>> {
    const keys = keyPath.split('.');
    const updates = keys.reduceRight<Partial<Config>>(
      (acc, key, i) => ({ [key]: i === keys.length - 1 ? value : acc }),
      {} as Partial<Config>
    );
    return this.update(updates);
  }

  /**
   * Gets the OpenAI API key from configuration or environment
   */
  getApiKey(): string | null {
    if (this.config.apiKeyStorage === 'local' && this.config.apiKey) {
      return this.config.apiKey;
    }

    return process.env['OPENAI_API_KEY'] ?? null;
  }

  /**
   * Sets the OpenAI API key in configuration
   * @param apiKey - API key to set
   */
  async setApiKey(apiKey: string): Promise<Result<Config, ConfigurationError>> {
    return this.update({
      apiKey,
      apiKeyStorage: 'local',
    });
  }

  /**
   * Resets configuration to defaults
   */
  async reset(): Promise<Result<Config, ConfigurationError>> {
    this.config = DEFAULT_CONFIG;
    const saveResult = await this.save();
    if (saveResult.isFail()) {
      return Result.fail<Config, ConfigurationError>(saveResult.getError());
    }
    return Result.ok(this.getConfig()) as Result<Config, ConfigurationError>;
  }
}
