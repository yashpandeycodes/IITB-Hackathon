import { NextResponse } from "next/server";
import {
  ERROR_HTTP_STATUS,
  type ApiErr,
  type ApiErrorBody,
  type ApiOk,
  type ErrorCode,
} from "@/lib/contracts/api";

/** Success envelope `{ ok: true, data }`. Pass `{ status: 201 }` etc. via `init`. */
export function ok<T>(data: T, init?: ResponseInit): NextResponse<ApiOk<T>> {
  const body: ApiOk<T> = { ok: true, data };
  return NextResponse.json(body, init);
}

/** Error envelope `{ ok: false, error }` with the HTTP status fixed by the error code. */
export function fail(
  code: ErrorCode,
  message: string,
  details?: unknown,
  init?: Omit<ResponseInit, "status">,
): NextResponse<ApiErr> {
  const error: ApiErrorBody =
    details === undefined ? { code, message } : { code, message, details };
  const body: ApiErr = { ok: false, error };
  return NextResponse.json(body, { ...init, status: ERROR_HTTP_STATUS[code] });
}
