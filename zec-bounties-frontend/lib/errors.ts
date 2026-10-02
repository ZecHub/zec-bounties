import { AxiosError } from "axios";

export function getErrorMessage(error: unknown, fallbackMessage: string): string {
  if (error instanceof AxiosError && error.response?.data?.message) {
    return error.response.data.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return fallbackMessage;
}
