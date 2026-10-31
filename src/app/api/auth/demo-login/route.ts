import { fail, ok, parseJsonBody, withHandler } from "@/lib/api";
import { DemoLoginRequestSchema } from "@/lib/contracts/auth";
import { demoAccountLogin } from "@/lib/auth/accounts";
import { AuthError, NO_STORE } from "@/lib/auth/http";

/**
 * One-click sign-in for the four public demo accounts (the password is looked up server-side).
 * Body `{ role }` → 200 `{ ok: true, data: User }` + session cookie. Standard error envelope:
 * 403 when `DEMO_LOGIN_ENABLED=false`, 429 (+ `Retry-After`) after 30 per IP in 10 minutes.
 */
export const POST = withHandler(async (request) => {
  const { role } = await parseJsonBody(request, DemoLoginRequestSchema, {
    maxBytes: 1_024,
  });
  try {
    const { user, session } = await demoAccountLogin(request, role);
    const response = ok(user, { headers: NO_STORE });
    response.cookies.set(session);
    return response;
  } catch (err) {
    if (err instanceof AuthError) {
      return fail(err.code, err.message, err.details, {
        headers: { ...NO_STORE, ...err.headers },
      });
    }
    throw err;
  }
});
