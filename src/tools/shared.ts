// ============================================================
// shared.ts — Shared types and helpers for tool handlers
// Phase D: Standardized tool handler patterns
// ============================================================

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

/**
 * Standard MCP tool response.
 * Uses the SDK's CallToolResult type for full compatibility.
 */
export type ToolResponse = CallToolResult;

/**
 * Create a success response with the given text.
 */
export function success(text: string): ToolResponse {
  return {
    content: [{ type: 'text', text }],
  };
}

/**
 * Create an error response with the given message.
 */
export function error(message: string): ToolResponse {
  return {
    content: [{ type: 'text', text: message }],
    isError: true,
  };
}

/**
 * Wrap a handler function with standard try/catch error handling.
 * Ensures all tool handlers follow the same error pattern.
 */
export function withErrorHandling<TArgs extends Record<string, unknown>>(
  handler: (args: TArgs) => ToolResponse,
): (args: TArgs) => ToolResponse {
  return (args: TArgs) => {
    try {
      return handler(args);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return error(`Error: ${message}`);
    }
  };
}
