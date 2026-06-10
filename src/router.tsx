import { QueryCache, QueryClient, MutationCache } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { isUnauthorizedError, recoverFromUnauthorized } from "./lib/auth-recovery";
import { GlobalErrorFallback } from "./components/GlobalErrorFallback";

export const getRouter = () => {
  const onError = (error: unknown) => {
    if (isUnauthorizedError(error)) {
      void recoverFromUnauthorized();
    }
  };

  const queryClient = new QueryClient({
    queryCache: new QueryCache({ onError }),
    mutationCache: new MutationCache({ onError }),
    defaultOptions: {
      queries: {
        retry: (failureCount, error) => {
          if (isUnauthorizedError(error)) return false;
          return failureCount < 2;
        },
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    defaultErrorComponent: ({ error, reset }) => (
      <GlobalErrorFallback error={error} reset={reset} boundary="router" />
    ),
  });

  return router;
};
