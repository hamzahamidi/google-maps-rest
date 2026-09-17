export * from './core/index.js';

import { MapsClient, type ClientOptions } from './core/client.js';

export function createClient(options: ClientOptions): MapsClient {
  return new MapsClient(options);
}
