import { createApp, type AppDependencies } from "../../server/app";

// Fastify routes and plugins are live only after ready(); tests keep using supertest.
export async function createTestApp(deps: AppDependencies) {
  const app = createApp(deps);
  await app.ready();
  return app;
}
