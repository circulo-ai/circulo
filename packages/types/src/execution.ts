/**
 * Supported code execution languages
 */
export enum CodeLanguage {
  JavaScript = "javascript",
  Python = "python",
}

/**
 * Type guard to check if a string is a valid CodeLanguage
 */
export function isValidCodeLanguage(value: string): value is CodeLanguage {
  return Object.values(CodeLanguage).includes(value as CodeLanguage);
}

/**
 * Get language display name
 */
export function getLanguageDisplayName(language: CodeLanguage): string {
  switch (language) {
    case CodeLanguage.JavaScript:
      return "JavaScript";
    case CodeLanguage.Python:
      return "Python";
    default:
      return language;
  }
}

/**
 * Default language for code execution
 */
export const DEFAULT_CODE_LANGUAGE = CodeLanguage.JavaScript;

/**
 * Execution timeout constants
 *
 * These constants define the timeout values for code execution.
 * - DEFAULT_EXECUTION_TIMEOUT_MS: The default timeout for executing user code (3 minutes)
 * - MAX_EXECUTION_DURATION: The maximum duration for the API route (adds 30s buffer for overhead)
 */

export const DEFAULT_EXECUTION_TIMEOUT_MS = 180000; // 3 minutes (180 seconds)
export const MAX_EXECUTION_DURATION = 210; // 3.5 minutes (210 seconds) - includes buffer for sandbox creation
