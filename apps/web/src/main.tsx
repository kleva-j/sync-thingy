import { RouterProvider, createRouter } from "@tanstack/react-router";
import { createRoot } from "react-dom/client";

import { BootGate } from "@/components/boot-gate";
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
    <BootGate>
      <RouterProvider router={router} />
    </BootGate>,
  );
}
