import { createApiServer } from './server.ts';

const port = Number(process.env.PORT ?? 4000);
// Bound to localhost: the API serves the user's own data to the local front only.
createApiServer().listen(port, '127.0.0.1', () => console.log(`API listening on http://localhost:${port}`));
