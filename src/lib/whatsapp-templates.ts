import type { ApiError } from "./api-client.js";

export const TEMPLATE_ERROR_HINTS: Record<string, string> = {
  template_header_variable_unsupported:
    "A header can't contain {{n}} variables. Keep --header as fixed text and put the variable in --body.",
};

export function templateErrorCode(err: ApiError): string {
  const code = err.body?.error;
  return typeof code === "string" && /^[a-z0-9_]+$/.test(code)
    ? code
    : err.code;
}
