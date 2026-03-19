import { useQueries, useQuery } from "@tanstack/react-query";

import { api } from "../api/client";

export function usePortfolio(portfolioId: string | null) {
  const enabled = Boolean(portfolioId);
  const [detail, timeseries, allocation] = useQueries({
    queries: [
      {
        queryKey: ["portfolio", portfolioId],
        queryFn: () => api.getPortfolio(portfolioId!),
        enabled,
      },
      {
        queryKey: ["portfolio-timeseries", portfolioId],
        queryFn: () => api.getTimeseries(portfolioId!),
        enabled,
      },
      {
        queryKey: ["portfolio-allocation", portfolioId],
        queryFn: () => api.getAllocation(portfolioId!),
        enabled,
      },
    ],
  });

  return {
    detail,
    timeseries,
    allocation,
    isLoading: detail.isLoading || timeseries.isLoading || allocation.isLoading,
  };
}

export function useBootstrap() {
  return useQuery({
    queryKey: ["bootstrap"],
    queryFn: api.getBootstrap,
  });
}

export function usePortfolios() {
  return useQuery({
    queryKey: ["portfolios"],
    queryFn: api.listPortfolios,
  });
}

