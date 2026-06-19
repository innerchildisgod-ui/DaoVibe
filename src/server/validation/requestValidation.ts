export class RequestValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RequestValidationError";
  }
}

export function validationError(message: string): never {
  throw new RequestValidationError(message);
}

export function isValidationError(
  error: unknown
): error is RequestValidationError {
  return error instanceof RequestValidationError;
}

export function asRequestObject(value: unknown): Record<string, unknown> {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}

export function payloadOrBody(body: unknown): Record<string, unknown> {
  const objectBody = asRequestObject(body);
  const payload = asRequestObject(objectBody.payload);

  return Object.keys(payload).length > 0 ? payload : objectBody;
}

export function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

export function requireString(
  body: Record<string, unknown>,
  fieldName: string
): string {
  const value = optionalString(body[fieldName]);

  if (!value) {
    validationError(`${fieldName} is required`);
  }

  return value;
}

export function requireOneString(
  body: Record<string, unknown>,
  fieldNames: readonly string[],
  errorFieldName = fieldNames[0]
): string {
  for (const fieldName of fieldNames) {
    const value = optionalString(body[fieldName]);

    if (value) {
      return value;
    }
  }

  validationError(`${errorFieldName} is required`);
}

export function requireObject(
  body: Record<string, unknown>,
  fieldName: string
): Record<string, unknown> {
  const value = body[fieldName];

  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  validationError(`${fieldName} is required`);
}

export function requireAllowedString<T extends string>(
  body: Record<string, unknown>,
  fieldName: string,
  allowedValues: readonly T[]
): T {
  const value = requireString(body, fieldName);

  if (!allowedValues.includes(value as T)) {
    validationError(`${fieldName} is invalid`);
  }

  return value as T;
}
