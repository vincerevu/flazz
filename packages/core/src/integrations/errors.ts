export type IntegrationErrorCode =
  | "not_configured"
  | "not_connected"
  | "missing_descriptor"
  | "unsupported_capability"
  | "resolution_failed"
  | "input_mapping_failed"
  | "provider_execution_failed"
  | "write_confirmation_required"
  | "duplicate_write_prevented";

export type IntegrationErrorResult = {
  success: false;
  code: IntegrationErrorCode;
  error: string;
  resolvedTool?: string;
};

export function integrationError(
  code: IntegrationErrorCode,
  error: string,
  extras?: { resolvedTool?: string },
): IntegrationErrorResult {
  return {
    success: false,
    code,
    error,
    ...(extras?.resolvedTool ? { resolvedTool: extras.resolvedTool } : {}),
  };
}
