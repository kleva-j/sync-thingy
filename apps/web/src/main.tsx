import { RouterProvider, createRouter } from "@tanstack/react-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";

import { registerServiceWorker } from "@/service-worker";
import { BootGate } from "@/components/boot-gate";
import { queryClient } from "@/query/client";
import { routeTree } from "@/routeTree.gen";

import Loader from "./components/loader";

const router = createRouter({
  routeTree,
  defaultPreload: "intent",
  scrollRestoration: true,
  defaultPendingComponent: () => <Loader />,
  context: {},
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const rootElement = document.getElementById("app");

if (!rootElement) {
  throw new Error("Root element not found");
}

if (!rootElement.innerHTML) {
  const root = createRoot(rootElement);
  root.render(
    <QueryClientProvider client={queryClient}>
      <BootGate>
        <RouterProvider router={router} />
      </BootGate>
    </QueryClientProvider>,
  );
  registerServiceWorker();
}
