import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import App from "./App";
import { ApiClientError } from "./api/client";
import "./styles.css";

const client = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        if (failureCount >= 1) {
          return false;
        }
        if (error instanceof ApiClientError) {
          return error.status >= 500;
        }
        return true;
      },
      staleTime: 60 * 1000,
    },
    mutations: {
      retry: (failureCount, error) => {
        if (failureCount >= 1) {
          return false;
        }
        if (error instanceof ApiClientError) {
          return error.status >= 500;
        }
        return true;
      },
    },
  },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={client}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
);
