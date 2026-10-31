/**
 * The Spectra engine input and the export safeguard (`spectra-engine.ts`), pure: on the bundled
 * dataset and the committed `exports/schedule.json` timetable with the real engine, plus a
 * stand-in engine for the safeguard's last resort.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type {
  Assignment,
  BookingRequest,
  BookingRequestRecord,
  Dataset,
} from "@/lib/contracts";

const fake = vi.hoisted(() => ({
  /** When set, replaces `decideBookings` (the real one otherwise). */
  decide: null as null | ((...args: never[]) => unknown),
}));

vi.mock("@/lib/engine", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/engine")>();
  return {
    ...real,
    decideBookings: vi.fn((...args: Parameters<typeof real.decideBookings>) =>
      fake.decide
        ? (fake.decide as typeof real.decideBookings)(...args)
        : real.decideBookings(...args),
    ),
  };
});

const { buildInstance, decideBookings } = await import("@/lib/engine");
const engine = await import("@/lib/engine");
const { getBundledDataset } = await import("@/lib/dataset");
const {
  MAX_SAFEGUARD_ROUNDS,
  checkExportScope,
  decideSpectra,
  engineInput,
  exportScope,
} = await import("./spectra-engine");

const decideMock = vi.mocked(engine.decideBookings);

/** The committed regular week (what a reset activates on the bundled dataset). */
const COMMITTED: Assignment[] = JSON.parse(
  readFileSync("exports/schedule.json", "utf8"),
).sessions;

const LIVE_AT = "2027-02-02T10:00:00+05:30";

/** A live (app-submitted) request: an admin's institute event unless overridden. */
function liveRequest(
  id: string,
  fields: Partial<BookingRequest> = {},
): BookingRequest {
  return {
    id,
    submitted_at: LIVE_AT,
    requester: "Admin",
    role: "admin",
    department: null,
    requested_category: "institute_event",
    title: id,
    attendance: 1,
    duration_periods: 1,
    windows: [{ day: "THU", from_period: 8, to_period: 8 }],
    room_types: ["classroom"],
    needs: [],
    requested_room: null,
    mandatory_for_groups: [],
    series_id: null,
    ...fields,
  };
}

const recordOf = (
  request: BookingRequest,
  fields: Partial<BookingRequestRecord> = {},
): BookingRequestRecord => ({
  ...request,
  state: "submitted",
  source: "form",
  created_by: "u_admin",
  ...fields,
});

/** ME-2's compulsory THU P8 townhall: ME-2 has ME204-L3 in CR-105 then (the QA's R1 case). */
const TOWNHALL = liveRequest("REQ-L", {
  title: "ME-2 townhall",
  room_types: [
    "classroom",
    "lecture_hall",
    "seminar_hall",
    "auditorium",
    "outdoor",
  ],
  mandatory_for_groups: ["ME-2"],
});

function withLive(...requests: BookingRequest[]): Dataset {
  const dataset = getBundledDataset();
  return {
    ...dataset,
    booking_requests: [...dataset.booking_requests, ...requests],
  };
}

/** Hard violations `schedule.json` would show for a plain engine run (no safeguard). */
function plainExportViolations(
  dataset: Dataset,
  records: BookingRequestRecord[],
) {
  const input = engineInput(dataset, records);
  const result = decideBookings(buildInstance(input.dataset), COMMITTED);
  return checkExportScope(
    exportScope(input.dataset, input.exportIds),
    COMMITTED,
    result.decisions,
    result.overrides,
  ).violations;
}

describe("engineInput", () => {
  const dataset = withLive(
    liveRequest("REQ-A"),
    liveRequest("REQ-B"),
    liveRequest("REQ-C"),
  );
  const withCancellation: Dataset = {
    ...dataset,
    cancellations: [
      ...dataset.cancellations,
      { request_id: "REQ-B", note: "Withdrawn" },
    ],
  };
  const rejection = {
    rejected_by: "u_coord_cse",
    rejected_at: LIVE_AT,
    comment: "No.",
  };
  const records = [
    recordOf(dataset.booking_requests.at(-3)!),
    recordOf(dataset.booking_requests.at(-2)!, { state: "cancelled" }),
    recordOf(dataset.booking_requests.at(-1)!, { rejection }),
  ];

  it("drops cancelled live requests and approver rejections, and splits live from export ids", () => {
    const input = engineInput(withCancellation, records);
    const ids = input.dataset.booking_requests.map((r) => r.id);
    expect(ids).toContain("REQ-A");
    expect(ids).not.toContain("REQ-B");
    expect(ids).not.toContain("REQ-C");
    expect(
      input.dataset.cancellations.some((c) => c.request_id === "REQ-B"),
    ).toBe(false);
    expect([...input.rejected.keys()]).toEqual(["REQ-C"]);
    expect([...input.liveIds]).toEqual(["REQ-A"]);
    // Records-less requests are the file's (dataset origin).
    expect(input.exportIds.size).toBe(
      getBundledDataset().booking_requests.length,
    );
    expect(input.exportIds.has("REQ-A")).toBe(false);
  });

  it("keeps cancelled dataset requests (the official file lists them)", () => {
    const bundled = getBundledDataset();
    const cancelled = bundled.cancellations[0].request_id;
    const request = bundled.booking_requests.find((r) => r.id === cancelled)!;
    const input = engineInput(bundled, [
      recordOf(request, {
        state: "cancelled",
        source: "dataset",
        created_by: null,
      }),
    ]);
    expect(input.dataset).toBe(bundled);
    expect(input.exportIds.has(cancelled)).toBe(true);
  });

  it("treats options.live ids as live without a record (the preview)", () => {
    const input = engineInput(dataset, [], { live: ["REQ-A"] });
    expect([...input.liveIds]).toEqual(["REQ-A"]);
    expect(input.exportIds.has("REQ-B")).toBe(true);
  });
});

describe("decideSpectra (real engine)", () => {
  it("is exactly one plain decideBookings run without live requests", () => {
    const dataset = getBundledDataset();
    decideMock.mockClear();
    const decided = decideSpectra(engineInput(dataset, []), COMMITTED);
    expect(decideMock).toHaveBeenCalledTimes(1);
    expect(decided.barred).toEqual([]);
    expect(decided.export_violations).toEqual([]);
    expect(decided.result).toEqual(
      decideBookings(buildInstance(dataset), COMMITTED),
    );
  });

  it("bars a live request whose class move would break schedule.json", () => {
    const dataset = withLive(TOWNHALL);
    const records = [recordOf(TOWNHALL)];
    // Without the safeguard the townhall moves ME204-L3 out of CR-105, BR-08 takes the freed
    // room, and the file (which still shows ME204-L3 there) has a room clash.
    expect(plainExportViolations(dataset, records)).not.toEqual([]);

    const decided = decideSpectra(engineInput(dataset, records), COMMITTED);
    expect(decided.barred).toEqual(["REQ-L"]);
    expect(decided.export_violations).toEqual([]);
    expect(decided.result.violations).toEqual([]);
    expect(decided.result.stats.priority_inversions).toEqual([]);
    expect(
      decided.result.overrides.filter((o) => o.displaced_by === "REQ-L"),
    ).toEqual([]);
    const townhall = decided.result.decisions.find(
      (d) => d.request_id === "REQ-L",
    )!;
    expect(townhall.requires_admin_approval).toBe(false);
    expect(townhall.facts.displaced).toEqual([]);

    // The file's own decisions are exactly those of a run without the townhall.
    const alone = decideBookings(buildInstance(getBundledDataset()), COMMITTED);
    const datasetIds = new Set(alone.decisions.map((d) => d.request_id));
    expect(
      decided.result.decisions.filter((d) => datasetIds.has(d.request_id)),
    ).toEqual(alone.decisions);
    expect(decided.result.overrides).toEqual(alone.overrides);
  });

  it("keeps a live request's class moves when the file stays valid", () => {
    // Y1-A's compulsory MON P1 assembly moves MA101-AB-L3; no file request competes for it.
    const assembly = liveRequest("REQ-A", {
      title: "Y1-A assembly",
      windows: [{ day: "MON", from_period: 1, to_period: 1 }],
      room_types: TOWNHALL.room_types,
      mandatory_for_groups: ["Y1-A"],
    });
    const dataset = withLive(assembly);
    const input = engineInput(dataset, [recordOf(assembly)]);
    decideMock.mockClear();
    const decided = decideSpectra(input, COMMITTED);
    expect(decideMock).toHaveBeenCalledTimes(1);
    expect(decided.barred).toEqual([]);
    expect(decided.export_violations).toEqual([]);
    expect(
      decided.result.overrides.filter((o) => o.displaced_by === "REQ-A"),
    ).toEqual([
      expect.objectContaining({ session_id: "MA101-AB-L3", day: "MON" }),
    ]);
  });

  it("treats a request without a record as the file's own (nothing live, nothing barred)", () => {
    decideMock.mockClear();
    const decided = decideSpectra(
      engineInput(withLive(TOWNHALL), []),
      COMMITTED,
    );
    expect(decideMock).toHaveBeenCalledTimes(1);
    expect(decided.barred).toEqual([]);
  });
});

describe("decideSpectra (stand-in engine)", () => {
  it("bars every live request after the last round, and reports what is still wrong", () => {
    // REQ-Z is an evening booking that competes with nothing.
    const evening = liveRequest("REQ-Z", {
      windows: [{ day: "MON", from_period: 12, to_period: 12 }],
    });
    const dataset = withLive(TOWNHALL, evening);
    const records = [
      recordOf(TOWNHALL),
      recordOf(dataset.booking_requests.at(-1)!),
    ];
    const input = engineInput(dataset, records);
    // An engine that ignores `noDisplacement` keeps producing the townhall's bad move.
    const real = decideBookings(buildInstance(input.dataset), COMMITTED);
    const seen: (ReadonlySet<string> | undefined)[] = [];
    fake.decide = ((_instance, _base, options) => {
      seen.push(
        options?.noDisplacement ? new Set(options.noDisplacement) : undefined,
      );
      return real;
    }) as typeof decideBookings;
    try {
      const decided = decideSpectra(input, COMMITTED);
      expect(decided.export_violations).not.toEqual([]);
      expect(decided.barred).toEqual(["REQ-L", "REQ-Z"]);
      // Plain run, then REQ-L barred; no new displacer, so everyone is barred at once.
      expect(seen.map((s) => (s ? [...s] : null))).toEqual([
        null,
        ["REQ-L"],
        ["REQ-L", "REQ-Z"],
      ]);
      expect(seen.length).toBeLessThanOrEqual(MAX_SAFEGUARD_ROUNDS + 2);
    } finally {
      fake.decide = null;
    }
  });

  it("stops adding displacers after MAX_SAFEGUARD_ROUNDS rounds", () => {
    const evenings = [1, 2, 3, 4, 5, 6].map((n) =>
      liveRequest(`REQ-${n}`, {
        windows: [{ day: "MON", from_period: 12, to_period: 12 }],
      }),
    );
    const dataset = withLive(TOWNHALL, ...evenings);
    const input = engineInput(
      dataset,
      [TOWNHALL, ...evenings].map((r) => recordOf(r)),
    );
    const dirty = decideBookings(
      buildInstance(
        engineInput(withLive(TOWNHALL), [recordOf(TOWNHALL)]).dataset,
      ),
      COMMITTED,
    );
    // Every call blames the townhall's move on the next live request in line.
    let calls = 0;
    fake.decide = (() => {
      const blamed = `REQ-${++calls}`;
      return {
        ...dirty,
        overrides: dirty.overrides.map((o) =>
          o.displaced_by === "REQ-L" ? { ...o, displaced_by: blamed } : o,
        ),
      };
    }) as typeof decideBookings;
    try {
      const decided = decideSpectra(input, COMMITTED);
      // One plain run, MAX_SAFEGUARD_ROUNDS rounds, then everyone barred.
      expect(calls).toBe(MAX_SAFEGUARD_ROUNDS + 2);
      expect(decided.barred).toEqual(["REQ-L", ...evenings.map((r) => r.id)]);
      expect(decided.export_violations).not.toEqual([]);
    } finally {
      fake.decide = null;
    }
  });
});
