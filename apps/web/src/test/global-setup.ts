import { prepareTestTemplates } from "@sync-disc/db/testing";

export default async function setup(): Promise<void> {
  await prepareTestTemplates();
}
