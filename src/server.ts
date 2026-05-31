import { buildApp } from './app.js';
import { env } from './shared/env.js';

const app = buildApp();
const port = Number(process.env.PORT || env.PORT || 3333);

app.listen({ port, host: '0.0.0.0' }).catch((error) => {
  app.log.error(error);
  process.exit(1);
});
