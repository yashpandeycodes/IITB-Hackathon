/**
 * Internal building blocks for the contract modules. Not part of the public barrel.
 */
import { z } from "zod";

/** A non-empty identifier string from the dataset (`"MA101-AB-L1"`, `"AUD"`, `"BR-07"`). */
export const Id = z.string().min(1);

/** A non-negative integer count (sizes, capacities, tallies). */
export const Count = z.number().int().nonnegative();

/** Wall-clock time as used in the calendar, `HH:MM` (24-hour). */
export const ClockTime = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Expected a time as HH:MM");

/** ISO-8601 timestamp with an offset (`+05:30` or `Z`), e.g. `"2027-01-26T09:45:00+05:30"`. */
export const Timestamp = z.iso.datetime({ offset: true });

/**
 * Removes the `[key: string]: unknown` index signature that `z.looseObject` adds to its
 * output type, recursively. Typed index signatures (real records) are kept. Unknown keys are
 * still preserved at runtime; the exported types just list the documented fields so typos
 * remain compile errors.
 */
export type KnownFields<T> = T extends readonly (infer U)[]
  ? KnownFields<U>[]
  : T extends object
    ? {
        [
          K in keyof T as string extends K
            ? UnlessUnknown<T[K], K>
            : number extends K
              ? UnlessUnknown<T[K], K>
              : K
        ]: KnownFields<T[K]>;
      }
    : T;

type UnlessUnknown<V, K> = unknown extends V ? never : K;
