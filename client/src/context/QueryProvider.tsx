'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React, { useState } from 'react';

export default function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 20 * 1000,
            // Keep cached data in memory for 5 min after last subscriber unmounts.
            // This means navigating back to a page shows data instantly.
            gcTime: 5 * 60 * 1000,
            retry: (failureCount, error) => {
              const status = (error as any)?.response?.status;
              if (status === 429 || status === 401 || status === 403) return false;
              return failureCount < 1;
            },
            // Don't refetch just because the window regained focus in a game app —
            // the 30s polling intervals handle freshness.
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
