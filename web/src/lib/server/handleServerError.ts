import { createLogger } from "@/lib/logs/console/logger";
import { HttpError } from "./errors";

const logger = createLogger("SafeRoute");

export function handleServerError(error: Error): Response {
  if (error instanceof HttpError) {
    return error.toResponse();
  }

  logger.error("Unhandled error in route handler:", { error });
  return Response.json({ message: "Internal server error" }, { status: 500 });
}

export function createErrorHandler(
  customHandler: (error: Error) => Response | null,
): (error: Error) => Response {
  return (error: Error) => {
    const customResponse = customHandler(error);
    return customResponse ?? handleServerError(error);
  };
}
