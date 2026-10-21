import { worker } from "@electric-sql/pglite/worker";
import { PGlite } from "@electric-sql/pglite";

worker({
  async init(options) {
    return PGlite.create(options);
  },
}).catch((cause: unknown) => {
  console.error("Failed to initialize the PGlite worker", cause);
});
