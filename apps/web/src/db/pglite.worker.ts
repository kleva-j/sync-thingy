import { worker } from "@electric-sql/pglite/worker";
import { PGlite } from "@electric-sql/pglite";

void worker({
  async init(options) {
    return PGlite.create(options);
  },
});
