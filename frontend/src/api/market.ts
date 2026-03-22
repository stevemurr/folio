import { MarketSearchResult, PricePoint, RealEstateSearchResult } from "./types";
import { request } from "./request";

export const marketApi = {
  searchMarket: (query: string, signal?: AbortSignal) =>
    request<MarketSearchResult[]>(`/market/search?q=${encodeURIComponent(query)}`, { signal }),
  searchRealEstate: (query: string) =>
    request<RealEstateSearchResult[]>(`/market/real-estate/search?q=${encodeURIComponent(query)}`),
  getMarketHistory: (ticker: string, fromDate: string, toDate: string) =>
    request<PricePoint[]>(
      `/market/history/${ticker}?from=${encodeURIComponent(fromDate)}&to=${encodeURIComponent(toDate)}`,
    ),
};
