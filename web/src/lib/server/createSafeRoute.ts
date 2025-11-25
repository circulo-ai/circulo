import { ValidationAdapter } from "./adapters/types";
import { RouteHandlerBuilder } from "./routeHandlerBuilder";
import { HandlerServerErrorFn } from "./types";

export type SafeRouteOptions = {
  handleServerError?: HandlerServerErrorFn;
  validationAdapter?: ValidationAdapter;
};

export function createSafeRoute(options?: SafeRouteOptions) {
  return new RouteHandlerBuilder({
    handleServerError: options?.handleServerError,
    validationAdapter: options?.validationAdapter,
    contextType: {},
  });
}
