import { expect, test } from "vite-plus/test";

import { getCachedTemplate, hashTemplateParts } from "../src/testing/template-cache.ts";

test("hashes template parts deterministically and content-sensitively", () => {
  expect(hashTemplateParts(["a", "b"])).toBe(hashTemplateParts(["a", "b"]));
  expect(hashTemplateParts(["a", "b"])).not.toBe(hashTemplateParts(["a", "c"]));
});

test("coalesces concurrent builds for one cache key", async () => {
  const key = `test-${process.pid}-${Date.now()}`;
  let builds = 0;
  const build = async () => {
    builds += 1;
    return new Blob(["template"]);
  };

  const [first, second] = await Promise.all([
    getCachedTemplate(key, build),
    getCachedTemplate(key, build),
  ]);

  expect(builds).toBe(1);
  expect(await first.text()).toBe("template");
  expect(await second.text()).toBe("template");
});
