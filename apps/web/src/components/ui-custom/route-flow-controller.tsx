import { cn } from "@/lib/utils";
import { ArrowLeft } from "lucide-react";
import {
  ComponentProps,
  createContext,
  Dispatch,
  FC,
  SetStateAction,
  useContext,
  useMemo,
  useState,
} from "react";
import { Button } from "../ui/button";

export interface Route {
  id: string;
  view: FC;
  children?: Route[];
}

interface LeveledRoute extends Route {
  level: number;
  children?: LeveledRoute[];
}

interface CurrentRoute<T = unknown> {
  // TODO how to expose T?
  id: string;
  context?: T[];
}

interface RouteFlowControllerContext {
  levelById: Map<string, number>;
  currentRoute: CurrentRoute;
  setCurrentRoute: Dispatch<SetStateAction<CurrentRoute>>;
}

const defaultRouteFlowControllerContext: RouteFlowControllerContext = {
  levelById: new Map<string, number>(),
  currentRoute: { id: "" },
  setCurrentRoute: () => {},
};

const RouteFlowControllerContext = createContext(
  defaultRouteFlowControllerContext,
);

interface RouteFlowControllerProps {
  route: Route;
}

export function RouteFlowController({ route }: RouteFlowControllerProps) {
  const [currentRoute, setCurrentRoute] = useState({ id: route.id });

  const leveledRoute = useMemo(() => annotateRouteLevels(route), [route]);

  const levelById = useMemo(() => {
    const map = new Map<string, number>();
    const walk = (r: LeveledRoute) => {
      map.set(r.id, r.level);
      r.children?.forEach(walk);
    };
    walk(leveledRoute);
    return map;
  }, [leveledRoute]);

  return (
    <RouteFlowControllerContext.Provider
      value={{
        levelById,
        currentRoute,
        setCurrentRoute,
      }}
    >
      <RouteFlowView leveledRoute={leveledRoute} />
    </RouteFlowControllerContext.Provider>
  );
}

interface RouteFlowViewContext {
  redirect: Dispatch<SetStateAction<CurrentRoute>>;
  currentRoute: CurrentRoute;
  isCurrentRoute: boolean;
  isBehindCurrent: boolean;
}

const defaultRouteFlowViewContext: RouteFlowViewContext = {
  redirect: () => {},
  currentRoute: { id: "" },
  isCurrentRoute: false,
  isBehindCurrent: false,
};

const RouteFlowViewContext = createContext(defaultRouteFlowViewContext);

interface RouteFlowViewProps {
  leveledRoute: LeveledRoute;
}

function RouteFlowView({ leveledRoute }: RouteFlowViewProps) {
  const { levelById, currentRoute, setCurrentRoute } = useContext(
    RouteFlowControllerContext,
  );

  const currentLevel = useMemo(
    () => levelById.get(currentRoute.id) ?? 0,
    [levelById, currentRoute.id],
  );

  const isBehindCurrent = useMemo(
    () => currentLevel > leveledRoute.level,
    [currentLevel, leveledRoute.level],
  );

  const isCurrentRoute = useMemo(
    () => currentRoute.id === leveledRoute.id,
    [currentRoute.id, leveledRoute.id],
  );

  const RouteView = useMemo(() => leveledRoute.view, [leveledRoute.view]);

  return (
    <>
      <RouteFlowViewContext.Provider
        value={{
          redirect: setCurrentRoute,
          currentRoute,
          isCurrentRoute,
          isBehindCurrent,
        }}
      >
        <RouteView />
      </RouteFlowViewContext.Provider>
      {leveledRoute.children?.map((child) => (
        <RouteFlowView key={child.id} leveledRoute={child} />
      ))}
    </>
  );
}

export function useRouteFlowViewContext() {
  return useContext(RouteFlowViewContext);
}

interface RouteViewHeaderProps extends ComponentProps<"header"> {
  title?: string;
  onBack?: () => void;
}

export function RouteViewHeader({
  title,
  onBack,
  children,
  className,
  ...props
}: RouteViewHeaderProps) {
  return (
    <header
      className={cn(
        "flex h-18.25 shrink-0 items-center gap-2 border-b border-teal-50/15 px-4",
        className,
      )}
      {...props}
    >
      {onBack && (
        <Button
          onClick={onBack}
          variant="ghost-sidebar"
          rounded="full"
          size="icon"
        >
          <ArrowLeft />
        </Button>
      )}
      {title && <h2 className="font-medium">{title}</h2>}
      <div className="grow" />
      {children}
    </header>
  );
}

function annotateRouteLevels(route: Route, level = 0): LeveledRoute {
  return {
    ...route,
    level,
    children: route.children?.map((child) =>
      annotateRouteLevels(child, level + 1),
    ),
  };
}

// TODO make the inactive routes unreachable by keyboard
