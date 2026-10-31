/**
 * The bundled starter-pack dataset (`data/cit_public.json`).
 *
 * The JSON (~138 KB) is inlined by the bundler, so import this module only from server code,
 * scripts and tests. Never import it from a client component. It deliberately avoids
 * `server-only` and `fs` so Vitest and `tsx` scripts can use it directly.
 */
import citPublic from "../../data/cit_public.json";

import { DatasetSchema, type Dataset } from "./contracts/dataset";

let bundled: Dataset | undefined;

/**
 * Validates a `cit_public.json`-shaped value (bundled or uploaded) and applies the
 * validator's defaults. Throws a `ZodError` with field paths on failure.
 */
export function parseDataset(input: unknown): Dataset {
  return DatasetSchema.parse(input);
}

/**
 * The bundled dataset, parsed once per process. Every caller gets the same instance:
 * treat it as read-only and `structuredClone` it before applying changes.
 */
export function getBundledDataset(): Dataset {
  bundled ??= parseDataset(citPublic);
  return bundled;
}
