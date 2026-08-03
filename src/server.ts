import { createApp } from "./app.js";
import { readEnvironment } from "./config.js";

const environment = readEnvironment();
const app = createApp(environment);

try {
  await app.listen({ host: environment.HOST, port: environment.PORT });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
