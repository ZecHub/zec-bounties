export function getErrorMessage(
  error: unknown,
  fallbackMessage = "Something went wrong"
): string {
  if (typeof error === "string" && error.trim().length > 0) {
    return error;
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === "object" && error !== null) {
    const err = error as Record<string, any>;
    if (typeof err.error === "string" && err.error.trim().length > 0) {
      return err.error;
    }
    if (err.response?.data) {
      const data = err.response.data;
      if (typeof data.error === "string" && data.error.trim().length > 0) {
        return data.error;
      }
      if (typeof data.message === "string" && data.message.trim().length > 0) {
        return data.message;
      }
    }
    if (typeof err.message === "string" && err.message.trim().length > 0) {
      return err.message;
    }
  }

  return fallbackMessage;
}
