function nonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function getErrorMessage(
  error: unknown,
  fallbackMessage = "Something went wrong"
): string {
  const direct = nonEmptyString(error);
  if (direct) {
    return direct;
  }

  if (typeof error === "object" && error !== null) {
    const err = error as Record<string, any>;

    // Check structured HTTP / API error payloads before generic Error.message
    // (AxiosError and custom HTTP errors are instanceof Error).
    const responseData = err.response?.data;
    if (responseData !== undefined && responseData !== null) {
      const rawData = nonEmptyString(responseData);
      if (rawData) {
        return rawData;
      }
      if (typeof responseData === "object") {
        const dataError = nonEmptyString(responseData.error);
        if (dataError) {
          return dataError;
        }
        const dataMessage = nonEmptyString(responseData.message);
        if (dataMessage) {
          return dataMessage;
        }
      }
    }

    const nestedError = nonEmptyString(err.error);
    if (nestedError) {
      return nestedError;
    }

    if (error instanceof Error) {
      const errorMessage = nonEmptyString(error.message);
      if (errorMessage) {
        return errorMessage;
      }
    }

    const objectMessage = nonEmptyString(err.message);
    if (objectMessage) {
      return objectMessage;
    }
  }

  return fallbackMessage;
}
