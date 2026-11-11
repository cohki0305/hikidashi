import { QueryClientProvider } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { setDefaultFetch } from "@/app/lib/api";
import { createQueryClient } from "@/app/lib/browser/query-client";
import { routeTree } from "./routeTree.gen";
import "./styles.css";

// 開発中だけ、本物のサーバーの代わりに偽の応答を使える。本番のビルドには入らない。
if (import.meta.env.DEV && import.meta.env.VITE_MOCK_API === "1") {
  const { mockFetch } = await import("./dev-mocks/fetch");
  setDefaultFetch(mockFetch);
}

const queryClient = createQueryClient();
const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </StrictMode>
  );
}
