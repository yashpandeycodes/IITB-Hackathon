import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The Brevo mail service (`src/lib/services/brevo-mail.ts`): transport selection by key prefix,
 * configuration checks, and that a code is logged only in development without a key.
 */

const smtp = vi.hoisted(() => ({
  createTransport: vi.fn(),
  sendMail: vi.fn(),
  close: vi.fn(),
}));

vi.mock("nodemailer", () => ({
  default: { createTransport: smtp.createTransport },
}));

const CODE = "482913";
const SMTP_KEY = "xsmtpsib-0123456789abcdef0123456789abcdef";
const REST_KEY = "xkeysib-0123456789abcdef0123456789abcdef";
const fetchMock = vi.fn();
let logs: unknown[][] = [];

/** Fresh module so the memoised env sees the stubbed variables. */
async function load(env: Record<string, string | undefined>) {
  for (const key of [
    "BREVO_API_KEY",
    "BREVO_SENDER_EMAIL",
    "BREVO_SENDER_NAME",
    "BREVO_SMTP_HOST",
    "BREVO_SMTP_PORT",
    "BREVO_SMTP_LOGIN",
  ]) {
    vi.stubEnv(key, env[key]);
  }
  vi.stubEnv("NODE_ENV", env.NODE_ENV ?? "development");
  vi.resetModules();
  return import("@/lib/services/brevo-mail");
}

const loggedText = () => logs.flat().map(String).join("\n");

beforeEach(() => {
  logs = [];
  for (const level of ["log", "info", "warn", "error"] as const) {
    vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
      logs.push(args);
    });
  }
  smtp.sendMail.mockResolvedValue({ messageId: "<smtp-1@brevo>" });
  smtp.createTransport.mockReturnValue({
    sendMail: smtp.sendMail,
    close: smtp.close,
  });
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify({ messageId: "<rest-1@brevo>" }), {
      status: 201,
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  smtp.createTransport.mockReset();
  smtp.sendMail.mockReset();
  fetchMock.mockReset();
});

describe("no key", () => {
  it("development logs the code to the console instead of sending", async () => {
    const mail = await load({});
    expect(mail.mailTransport()).toBe("none");
    expect(mail.mailStatus()).toBe("dev-log");
    expect(await mail.sendOtpEmail("a@cit.demo", "A", CODE)).toEqual({
      success: true,
    });
    expect(loggedText()).toContain(`[dev] OTP for a@cit.demo: ${CODE}`);
    expect(smtp.createTransport).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("production refuses and never logs the code", async () => {
    const mail = await load({ NODE_ENV: "production" });
    expect(mail.mailStatus()).toBe("unavailable");
    const result = await mail.sendOtpEmail("a@cit.demo", "A", CODE);
    expect(result.success).toBe(false);
    expect(loggedText()).not.toContain(CODE);
    expect(loggedText()).toMatch(/BREVO_API_KEY is not set/);
  });

  it("treats placeholder-looking keys as missing", async () => {
    const mail = await load({
      BREVO_API_KEY: "your-demo-key-replace-me-please",
    });
    expect(mail.mailTransport()).toBe("none");
  });
});

describe("SMTP relay (xsmtpsib- key)", () => {
  const base = {
    BREVO_API_KEY: SMTP_KEY,
    BREVO_SENDER_EMAIL: "noreply@cit.example.org",
    BREVO_SMTP_LOGIN: "9abc12001@smtp-brevo.com",
  };

  it("sends through nodemailer with the login, 587 and 15 s timeouts", async () => {
    const mail = await load(base);
    expect(mail.mailTransport()).toBe("smtp");
    expect(mail.mailStatus()).toBe("ready");
    const result = await mail.sendOtpEmail(
      "lead@example.org",
      "<b>Lead</b>",
      CODE,
    );
    expect(result).toEqual({ success: true, messageId: "<smtp-1@brevo>" });
    expect(smtp.createTransport).toHaveBeenCalledWith({
      host: "smtp-relay.brevo.com",
      port: 587,
      secure: false,
      auth: { user: "9abc12001@smtp-brevo.com", pass: SMTP_KEY },
      connectionTimeout: 15_000,
      greetingTimeout: 15_000,
      socketTimeout: 15_000,
    });
    const sent = smtp.sendMail.mock.calls[0][0];
    expect(sent).toMatchObject({
      from: { name: "CIT Nexus", address: "noreply@cit.example.org" },
      to: { name: "<b>Lead</b>", address: "lead@example.org" },
    });
    expect(sent.subject).not.toContain(CODE);
    expect(sent.html).toContain(CODE);
    expect(sent.html).toContain("&lt;b&gt;Lead&lt;/b&gt;");
    expect(sent.html).not.toContain("<b>Lead</b>");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(loggedText()).not.toContain(CODE);
  });

  it('uses implicit TLS on 465, a custom host and a "Name <email>" sender', async () => {
    const mail = await load({
      ...base,
      BREVO_SMTP_HOST: "smtp.example.org",
      BREVO_SMTP_PORT: "465",
      BREVO_SENDER_EMAIL: "CIT Security <security@cit.example.org>",
    });
    await mail.sendOtpEmail("lead@example.org", "Lead", CODE);
    expect(smtp.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        host: "smtp.example.org",
        port: 465,
        secure: true,
      }),
    );
    expect(smtp.sendMail.mock.calls[0][0].from).toEqual({
      name: "CIT Security",
      address: "security@cit.example.org",
    });
  });

  it("is unavailable without BREVO_SMTP_LOGIN", async () => {
    const mail = await load({ ...base, BREVO_SMTP_LOGIN: undefined });
    expect(mail.mailStatus()).toBe("unavailable");
    expect((await mail.sendOtpEmail("a@cit.demo", "A", CODE)).success).toBe(
      false,
    );
    expect(smtp.createTransport).not.toHaveBeenCalled();
    expect(loggedText()).toMatch(/BREVO_SMTP_LOGIN is not set/);
    expect(loggedText()).not.toContain(CODE);
  });

  it("reports a failed send without logging the code or the key", async () => {
    smtp.sendMail.mockRejectedValue(
      Object.assign(new Error(`Invalid login for ${SMTP_KEY}`), {
        code: "EAUTH",
        responseCode: 535,
      }),
    );
    const mail = await load(base);
    const result = await mail.sendOtpEmail("a@cit.demo", "A", CODE);
    expect(result.success).toBe(false);
    expect(loggedText()).toMatch(/EAUTH 535/);
    expect(loggedText()).not.toContain(CODE);
    expect(loggedText()).not.toContain(SMTP_KEY);
    expect(smtp.close).toHaveBeenCalled();
  });
});

describe("REST API (xkeysib- key)", () => {
  const base = {
    BREVO_API_KEY: REST_KEY,
    BREVO_SENDER_EMAIL: "noreply@cit.example.org",
  };

  it("posts to the Brevo API and never touches SMTP", async () => {
    const mail = await load(base);
    expect(mail.mailTransport()).toBe("rest");
    expect(mail.mailStatus()).toBe("ready");
    const result = await mail.sendOtpEmail("lead@example.org", "Lead", CODE);
    expect(result).toEqual({ success: true, messageId: "<rest-1@brevo>" });
    expect(smtp.createTransport).not.toHaveBeenCalled();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.brevo.com/v3/smtp/email");
    expect(init.headers["api-key"]).toBe(REST_KEY);
    expect(JSON.parse(init.body)).toMatchObject({
      sender: { name: "CIT Nexus", email: "noreply@cit.example.org" },
      to: [{ name: "Lead", email: "lead@example.org" }],
    });
    expect(loggedText()).not.toContain(CODE);
  });

  it("reports a rejected request by status only", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ message: "Key not found" }), {
        status: 401,
      }),
    );
    const mail = await load(base);
    expect((await mail.sendOtpEmail("a@cit.demo", "A", CODE)).success).toBe(
      false,
    );
    expect(loggedText()).toMatch(/HTTP 401/);
    expect(loggedText()).not.toContain(CODE);
  });

  it("is unavailable without a sender, in production too, and never logs the code", async () => {
    const mail = await load({
      BREVO_API_KEY: REST_KEY,
      NODE_ENV: "production",
    });
    expect(mail.mailStatus()).toBe("unavailable");
    expect((await mail.sendOtpEmail("a@cit.demo", "A", CODE)).success).toBe(
      false,
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(loggedText()).toMatch(/BREVO_SENDER_EMAIL is not set/);
    expect(loggedText()).not.toContain(CODE);
  });

  it("never logs the code in production when mail is configured", async () => {
    const mail = await load({ ...base, NODE_ENV: "production" });
    expect(mail.mailStatus()).toBe("ready");
    await mail.sendOtpEmail("a@cit.demo", "A", CODE);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(loggedText()).not.toContain(CODE);
  });
});
