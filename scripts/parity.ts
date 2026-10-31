/**
 * Parity check: our engine (`validateSchedule`) against the official `validator.py`.
 *
 *   npx tsx scripts/parity.ts            all cases
 *   npx tsx scripts/parity.ts --verbose  also print every mismatching violation
 *   npx tsx scripts/parity.ts --keep     keep the temp inputs and validator reports
 *
 * Builds the starter-pack example, a synthetic full schedule, 50 seeded mutations of it,
 * disruption runs (sample + a synthetic change file covering all five change types) and a
 * dataset variant (fixed slots, tighter hour limits, default avoid days, extra fields). Each
 * schedule is scored by both; the reports must match exactly (violations in order, soft
 * penalties, booking stats, exam penalty, stability, warnings). Exits 1 on any mismatch.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  DatasetSchema,
  DisruptionSchema,
  type Dataset,
  type ValidatorReport,
} from "@/lib/contracts";
import {
  applyDisruption,
  mulberry32,
  pick,
  randomInt,
  validateSchedule,
  type Rng,
} from "@/lib/engine";

const VALIDATOR = "CrunchWeek_StarterPack/validator.py";
const DATA = "data/cit_public.json";
const EXAMPLE = "CrunchWeek_StarterPack/examples/schedule.example.json";
const SAMPLE_DISRUPTION = "data/sample_disruption.json";
const MUTATIONS = 50;

type Json = Record<string, unknown>;
type Entry = {
  session_id?: unknown;
  day?: unknown;
  start_period?: unknown;
  room_id?: unknown;
};
type Decision = Json & { request_id?: unknown; status?: unknown };
type Override = Entry & { displaced_by?: unknown };
type ExamEntry = {
  exam_id?: unknown;
  day?: unknown;
  session?: unknown;
  rooms?: unknown;
};
type Schedule = {
  team?: unknown;
  dataset_id?: unknown;
  sessions: Entry[];
  fest_week?: { bookings: Decision[]; session_overrides: Override[] };
  exams?: ExamEntry[];
};
type Case = {
  name: string;
  /** Raw dataset JSON as the validator reads it. */
  data: unknown;
  schedule: Schedule;
  disruption?: unknown;
  baseline?: Schedule;
};

const readJson = (file: string): unknown =>
  JSON.parse(readFileSync(file, "utf8"));
const clone = <T>(value: T): T => structuredClone(value);
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

// ------------------------------------------------------------------ synthetic schedule

function block(start: number, duration: number): number[] {
  return Array.from({ length: duration }, (_, i) => start + i);
}

/** Greedy placement: honours most hard rules so the booking checks see a realistic week. */
function synthesize(data: Dataset, team: string): Schedule {
  const { days, lab_start_periods: labStarts } = data.calendar;
  const lunch = data.calendar.lunch.after_period;
  const rooms = [...data.rooms].sort(
    (a, b) => a.capacity - b.capacity || cmp(a.id, b.id),
  );
  const unavailable = new Set<string>();
  for (const f of data.faculty) {
    for (const u of f.unavailable) {
      for (const p of u.periods) unavailable.add(`f|${f.id}|${u.day}|${p}`);
    }
  }
  for (const u of data.room_unavailability) {
    for (const p of u.periods) unavailable.add(`r|${u.room_id}|${u.day}|${p}`);
  }
  const maxHours = new Map(
    data.faculty.map((f) => [f.id, f.max_hours_per_day]),
  );
  const used = new Set<string>();
  const groupUnit = new Map<string, string>();
  const hours = new Map<string, number>();
  const basketTime = new Map<string, [string, number]>();

  const order = [...data.sessions].sort(
    (a, b) =>
      Number(Boolean(b.fixed_slot)) - Number(Boolean(a.fixed_slot)) ||
      Number(b.kind === "lab") - Number(a.kind === "lab") ||
      b.size - a.size ||
      cmp(a.id, b.id),
  );
  const placed = new Map<string, Entry>();
  order.forEach((s, i) => {
    const unit = s.basket_slot || s.id;
    let candidates: [string, number][];
    if (s.fixed_slot) {
      candidates = [[s.fixed_slot.day, s.fixed_slot.start_period]];
    } else if (s.basket_slot && basketTime.has(s.basket_slot)) {
      candidates = [basketTime.get(s.basket_slot)!];
    } else {
      const rotated = days.map((_, k) => days[(k + i) % days.length]);
      candidates = rotated.flatMap((day) =>
        block(1, 9).map((start): [string, number] => [day, start]),
      );
    }
    for (const [day, start] of candidates) {
      const per = block(start, s.duration);
      if (per[per.length - 1] > 9) continue;
      if (per[0] <= lunch && lunch < per[per.length - 1]) continue;
      if (s.kind === "lab" && !labStarts.includes(start)) continue;
      const f = s.faculty_id;
      if ((hours.get(`${f}|${day}`) ?? 0) + s.duration > (maxHours.get(f) ?? 4))
        continue;
      const facFree = per.every(
        (p) =>
          !unavailable.has(`f|${f}|${day}|${p}`) &&
          !used.has(`f|${f}|${day}|${p}`),
      );
      const groupsFree = per.every((p) =>
        s.groups.every((g) => {
          const u = groupUnit.get(`${g}|${day}|${p}`);
          return u === undefined || u === unit;
        }),
      );
      if (!facFree || !groupsFree) continue;
      const room = rooms.find(
        (r) =>
          s.room_types.includes(r.type) &&
          r.capacity >= s.size &&
          (!s.needs_accessible || r.accessible) &&
          per.every(
            (p) =>
              !unavailable.has(`r|${r.id}|${day}|${p}`) &&
              !used.has(`r|${r.id}|${day}|${p}`),
          ),
      );
      if (!room) continue;
      for (const p of per) {
        used.add(`r|${room.id}|${day}|${p}`);
        used.add(`f|${f}|${day}|${p}`);
        for (const g of s.groups) groupUnit.set(`${g}|${day}|${p}`, unit);
      }
      hours.set(`${f}|${day}`, (hours.get(`${f}|${day}`) ?? 0) + s.duration);
      if (s.basket_slot) basketTime.set(s.basket_slot, [day, start]);
      placed.set(s.id, {
        session_id: s.id,
        day,
        start_period: start,
        room_id: room.id,
      });
      return;
    }
    // No clean slot: place it anyway (validity does not matter for parity).
    const room = rooms.find((r) => s.room_types.includes(r.type)) ?? rooms[0];
    placed.set(s.id, {
      session_id: s.id,
      day: days[i % days.length],
      start_period: s.kind === "lab" ? labStarts[0] : 1,
      room_id: room.id,
    });
  });
  const sessions = data.sessions.map((s) => placed.get(s.id)!);

  // Bookings: first free fitting slot inside a window, else an evening alternative, else reject.
  const cancelled = new Set(data.cancellations.map((c) => c.request_id));
  const forceReject = new Set(["BR-06", "BR-12"]);
  const busy = new Set<string>();
  for (const e of sessions) {
    const s = data.sessions.find((x) => x.id === e.session_id)!;
    for (const p of block(e.start_period as number, s.duration)) {
      busy.add(`${e.room_id}|${e.day}|${p}`);
    }
  }
  const bookings: Decision[] = [];
  for (const req of data.booking_requests) {
    if (cancelled.has(req.id)) {
      bookings.push({
        request_id: req.id,
        status: "rejected",
        reason: "Cancelled by the requester",
      });
      continue;
    }
    if (forceReject.has(req.id)) {
      bookings.push({
        request_id: req.id,
        status: "rejected",
        reason: "Outranked (parity fixture)",
      });
      continue;
    }
    const fits = (day: string, a: number) => {
      const per = block(a, req.duration_periods);
      if (per[per.length - 1] > 13) return undefined;
      return rooms.find((r) => {
        const feats = new Set([
          ...r.features,
          ...(r.accessible ? ["accessible"] : []),
        ]);
        return (
          r.allowed_uses.includes("event") &&
          req.room_types.includes(r.type) &&
          r.capacity >= req.attendance &&
          req.needs.every((n) => feats.has(n)) &&
          per.every(
            (p) =>
              !busy.has(`${r.id}|${day}|${p}`) &&
              !unavailable.has(`r|${r.id}|${day}|${p}`),
          ) &&
          per.every((p) =>
            req.mandatory_for_groups.every(
              (g) => !groupUnit.has(`${g}|${day}|${p}`),
            ),
          )
        );
      });
    };
    let decision: Decision | undefined;
    for (const w of req.windows) {
      for (
        let a = w.from_period;
        a + req.duration_periods - 1 <= w.to_period && !decision;
        a++
      ) {
        const room = fits(w.day, a);
        if (room) {
          decision = {
            request_id: req.id,
            status: "approved",
            day: w.day,
            start_period: a,
            end_period: a + req.duration_periods - 1,
            room_id: room.id,
            reason: "Fits the window",
          };
        }
      }
      if (decision) break;
    }
    for (const day of days) {
      for (let a = 10; a <= 13 && !decision; a++) {
        const room = fits(day, a);
        if (room) {
          decision = {
            request_id: req.id,
            status: "alternative_offered",
            day,
            start_period: a,
            end_period: a + req.duration_periods - 1,
            room_id: room.id,
            reason: "Evening alternative",
          };
        }
      }
    }
    decision ??= {
      request_id: req.id,
      status: "rejected",
      reason: "No suitable room",
    };
    if (decision.status !== "rejected") {
      for (
        let p = decision.start_period as number;
        p <= (decision.end_period as number);
        p++
      ) {
        busy.add(`${decision.room_id}|${decision.day}|${p}`);
      }
    }
    bookings.push(decision);
  }
  const big =
    sessions.find((e) => e.session_id === "ID101-ALL-L1") ?? sessions[0];
  const session_overrides: Override[] = [
    {
      session_id: big.session_id,
      day: "WED",
      start_period: 4,
      room_id: "AUD",
      displaced_by: "BR-01",
    },
  ];

  // Exams: round-robin slots, biggest exam-capable rooms first; the last two are left out.
  const examRooms = data.rooms
    .filter((r) => r.allowed_uses.includes("exam"))
    .sort((a, b) => b.capacity - a.capacity || cmp(a.id, b.id));
  const { days: examDays, sessions: examSessions } = data.calendar.exam_week;
  const examUsed = new Set<string>();
  const exams: ExamEntry[] = data.exams.slice(0, -2).map((exam, i) => {
    const day = examDays[i % examDays.length];
    const session =
      examSessions[Math.floor(i / examDays.length) % examSessions.length].id;
    const chosen: string[] = [];
    let seats = 0;
    for (const r of examRooms) {
      if (seats >= exam.size) break;
      if (examUsed.has(`${r.id}|${day}|${session}`)) continue;
      examUsed.add(`${r.id}|${day}|${session}`);
      chosen.push(r.id);
      seats += Math.floor(r.capacity / 2);
    }
    return {
      exam_id: exam.id,
      day,
      session,
      rooms: chosen.length ? chosen : ["AUD"],
    };
  });

  return {
    team,
    dataset_id: data.dataset_id,
    sessions,
    fest_week: { bookings, session_overrides },
    exams,
  };
}

// ------------------------------------------------------------------------- mutations

type Mutation = (s: Schedule, rng: Rng) => string;

function mutations(data: Dataset): Mutation[] {
  const days = [...data.calendar.days];
  const roomIds = data.rooms.map((r) => r.id);
  const sessionIds = data.sessions.map((s) => s.id);
  const requestIds = data.booking_requests.map((r) => r.id);
  const examDays = [...data.calendar.exam_week.days];
  const anyEntry = (s: Schedule, rng: Rng) => pick(rng, s.sessions);
  const fest = (s: Schedule) =>
    (s.fest_week ??= { bookings: [], session_overrides: [] });
  return [
    function moveTime(s, rng) {
      const e = anyEntry(s, rng);
      e.day = rng() < 0.05 ? "SAT" : pick(rng, days);
      e.start_period =
        rng() < 0.1 ? pick(rng, [0, 8, 10]) : 1 + randomInt(rng, 9);
      return `move ${e.session_id}`;
    },
    function changeRoom(s, rng) {
      const e = anyEntry(s, rng);
      e.room_id = rng() < 0.05 ? "NOPE-ROOM" : pick(rng, roomIds);
      return `room ${e.session_id}`;
    },
    function swap(s, rng) {
      const a = anyEntry(s, rng);
      const b = anyEntry(s, rng);
      [a.day, b.day] = [b.day, a.day];
      [a.start_period, b.start_period] = [b.start_period, a.start_period];
      [a.room_id, b.room_id] = [b.room_id, a.room_id];
      return `swap ${a.session_id}/${b.session_id}`;
    },
    function drop(s, rng) {
      const i = randomInt(rng, s.sessions.length);
      const [gone] = s.sessions.splice(i, 1);
      return `drop ${gone.session_id}`;
    },
    function duplicate(s, rng) {
      const e = { ...anyEntry(s, rng) };
      e.day = pick(rng, days);
      e.start_period = 1 + randomInt(rng, 9);
      s.sessions.push(e);
      return `dup ${e.session_id}`;
    },
    function unknownSession(s, rng) {
      const e: Entry =
        rng() < 0.5
          ? {
              session_id: "ZZ-999",
              day: "MON",
              start_period: 1,
              room_id: "LH-1",
            }
          : { day: "TUE", start_period: 2, room_id: "LH-2" };
      s.sessions.push(e);
      return "unknown session";
    },
    function flipBooking(s, rng) {
      const d = pick(rng, fest(s).bookings);
      d.status = pick(rng, [
        "approved",
        "rejected",
        "alternative_offered",
        "maybe",
      ]);
      if (rng() < 0.4) {
        d.day = pick(rng, [...days, "SUN"]);
        d.start_period = 1 + randomInt(rng, 13);
        d.end_period =
          (d.start_period as number) +
          randomInt(rng, 3) -
          (rng() < 0.1 ? 3 : 0);
        d.room_id = pick(rng, [...roomIds, "LHC-5"]);
      }
      if (rng() < 0.3) delete d.reason;
      return `flip ${d.request_id} -> ${d.status}`;
    },
    function approveCancelled(s) {
      const d = fest(s).bookings.find((x) => x.request_id === "BR-04");
      if (d)
        Object.assign(d, {
          status: "approved",
          day: "TUE",
          start_period: 10,
          end_period: 12,
          room_id: "SH-2",
        });
      return "approve cancelled BR-04";
    },
    function duplicateDecision(s, rng) {
      const d = { ...pick(rng, fest(s).bookings) };
      fest(s).bookings.push(d);
      return `dup decision ${d.request_id}`;
    },
    function addOverride(s, rng) {
      const o: Override = {
        session_id: rng() < 0.1 ? "XX-404" : pick(rng, sessionIds),
        day: rng() < 0.05 ? "SAT" : pick(rng, days),
        start_period: 1 + randomInt(rng, 9),
        room_id: pick(rng, roomIds),
        displaced_by: rng() < 0.1 ? "BR-99" : pick(rng, requestIds),
      };
      fest(s).session_overrides.push(o);
      return `override ${o.session_id} by ${o.displaced_by}`;
    },
    function examSlot(s, rng) {
      if (!s.exams?.length) return "no exams";
      const e = pick(rng, s.exams);
      e.day = rng() < 0.05 ? "SUN" : pick(rng, examDays);
      e.session = rng() < 0.05 ? "EVE" : pick(rng, ["AM", "PM"]);
      if (rng() < 0.3)
        e.rooms = [...(e.rooms as string[]), pick(rng, [...roomIds, "NOPE"])];
      return `exam ${e.exam_id}`;
    },
    function examDropOrDup(s, rng) {
      if (!s.exams?.length) return "no exams";
      const i = randomInt(rng, s.exams.length);
      if (rng() < 0.5) return `drop exam ${s.exams.splice(i, 1)[0].exam_id}`;
      s.exams.push(
        rng() < 0.2
          ? { exam_id: "EX-NOPE", day: "MON", session: "AM", rooms: ["AUD"] }
          : { ...s.exams[i] },
      );
      return "dup exam";
    },
    function pileFaculty(s, rng) {
      const f = pick(rng, data.faculty).id;
      const day = pick(rng, days);
      const ids = new Set(
        data.sessions.filter((x) => x.faculty_id === f).map((x) => x.id),
      );
      for (const e of s.sessions)
        if (ids.has(e.session_id as string)) e.day = day;
      return `pile ${f} on ${day}`;
    },
    function moveBooking(s, rng) {
      const d = pick(rng, fest(s).bookings);
      const req = data.booking_requests.find((r) => r.id === d.request_id)!;
      const w = pick(rng, req.windows);
      const start = w.from_period + randomInt(rng, 3) - 1;
      const length =
        req.duration_periods + (rng() < 0.2 ? pick(rng, [-1, 1]) : 0);
      Object.assign(d, {
        status: rng() < 0.7 ? "approved" : "alternative_offered",
        day: rng() < 0.8 ? w.day : pick(rng, days),
        start_period: start,
        end_period: start + length - 1,
        room_id:
          rng() < 0.5 ? (d.room_id ?? pick(rng, roomIds)) : pick(rng, roomIds),
      });
      return `move booking ${d.request_id}`;
    },
    function stealSlot(s, rng) {
      const taken = fest(s).bookings.filter(
        (x) => x.status !== "rejected" && x.room_id,
      );
      const d = pick(rng, fest(s).bookings);
      if (taken.length > 0 && rng() < 0.6) {
        const o = pick(rng, taken);
        Object.assign(d, {
          status: "approved",
          day: o.day,
          start_period: o.start_period,
          end_period: o.end_period,
          room_id: o.room_id,
        });
        return `steal ${d.request_id} <- ${o.request_id}`;
      }
      const e = anyEntry(s, rng);
      Object.assign(d, {
        status: "approved",
        day: e.day,
        start_period: e.start_period,
        end_period: (e.start_period as number) + 1,
        room_id: e.room_id,
      });
      return `book ${d.request_id} over ${e.session_id}`;
    },
    function rejectApproved(s, rng) {
      const approved = fest(s).bookings.filter((x) => x.status === "approved");
      if (approved.length === 0) return "nothing approved";
      const d = pick(rng, approved);
      d.status = "rejected";
      d.reason = "Rejected by parity mutation";
      return `reject ${d.request_id}`;
    },
    function moveBasket(s, rng) {
      const baskets = data.sessions
        .filter((x) => x.basket_slot)
        .map((x) => x.id);
      const e = s.sessions.find((x) => x.session_id === pick(rng, baskets));
      if (e) {
        e.day = pick(rng, days);
        e.start_period = 1 + randomInt(rng, 8);
      }
      return "move basket";
    },
  ];
}

function mutate(
  base: Schedule,
  data: Dataset,
  seed: number,
): { schedule: Schedule; ops: string[] } {
  const rng = mulberry32(seed);
  const schedule = clone(base);
  const ops = mutations(data);
  const n = 1 + randomInt(rng, 3);
  const done: string[] = [];
  for (let i = 0; i < n; i++) done.push(pick(rng, ops)(schedule, rng));
  return { schedule, ops: done };
}

/** Hand-picked malformed entries that hit every rare message (and that the validator survives). */
function edgeCases(base: Schedule, withFest: boolean): Schedule {
  const s = clone(base);
  const at = (id: string) => s.sessions.find((e) => e.session_id === id)!;
  Object.assign(at("MA101-AB-L1"), { day: "SAT" });
  Object.assign(at("PH191-A-P1"), { start_period: 8 });
  Object.assign(at("CS101-A-L1"), { start_period: 0 });
  Object.assign(at("CS191-A-P1"), { start_period: 3 });
  Object.assign(at("MA101-CD-L1"), { room_id: "NOPE-ROOM" });
  Object.assign(at("ID101-ALL-L1"), {
    room_id: "LH-1",
    day: "THU",
    start_period: 4,
  });
  Object.assign(at("ME201-L1"), { room_id: "CR-201" });
  Object.assign(at("CS201-L1"), {
    room_id: "LH-4",
    day: "THU",
    start_period: 2,
  });
  Object.assign(at("WS101-A-P1"), { room_id: "CS-LAB-1" });
  s.sessions.push({
    session_id: "CS201-L2",
    day: "FRI",
    start_period: 9,
    room_id: "LH-6",
  });
  if (!withFest) {
    // Non-integer starts only survive the validator when no Spectra week is checked.
    s.sessions.push({
      session_id: "CS203-L1",
      day: null,
      start_period: null,
      room_id: null,
    });
    Object.assign(at("CS201-L3"), { start_period: "3", room_id: "NOPE" });
    Object.assign(at("CS202-L1"), { start_period: 2.5, room_id: null });
    delete s.fest_week;
  } else {
    const fest = s.fest_week!;
    const dec = (id: string) => fest.bookings.find((d) => d.request_id === id)!;
    Object.assign(dec("BR-08"), {
      status: "approved",
      day: "THU",
      start_period: 8,
      end_period: 8,
      room_id: "LH-4",
    });
    Object.assign(dec("BR-02"), { status: "rejected", reason: null });
    Object.assign(dec("BR-03"), {
      status: "alternative_offered",
      day: "WED",
      start_period: "6",
      end_period: 7,
      room_id: "AUD",
      reason: "   ",
    });
    Object.assign(dec("BR-05a"), {
      status: "approved",
      day: "MON",
      start_period: 12,
      end_period: 14,
      room_id: "OAT",
    });
    Object.assign(dec("BR-05b"), {
      status: "approved",
      day: "TUE",
      start_period: 12,
      end_period: 11,
      room_id: "OAT",
    });
    Object.assign(dec("BR-04"), {
      status: "alternative_offered",
      day: "TUE",
      start_period: 10,
      end_period: 12,
      room_id: "SH-2",
    });
    Object.assign(dec("BR-13"), { status: "rejected" });
    delete dec("BR-13").reason;
    Object.assign(dec("BR-14"), {
      status: "approved",
      day: "WED",
      start_period: 11,
      end_period: 12,
      room_id: "CR-101",
    });
    fest.bookings.push({
      status: "rejected",
      reason: "Decision without a request id",
    });
    fest.session_overrides.push({
      session_id: "EC201-L1",
      day: "FRI",
      start_period: 2,
      room_id: "LH-2",
    });
    fest.session_overrides.push({
      session_id: null,
      day: "FRI",
      start_period: 2,
      room_id: "LH-2",
      displaced_by: "BR-01",
    });
  }
  s.exams = [
    ...(s.exams ?? []).slice(4),
    {
      exam_id: "EX-MA101",
      day: "MON",
      session: "AM",
      rooms: ["CR-205", "OAT", "NOPE", "CS-LAB-1"],
    },
    { exam_id: "EX-PH101", day: "SUN", session: "AM", rooms: ["AUD"] },
    { exam_id: "EX-CS101", day: "TUE", session: "EVE", rooms: ["AUD"] },
    { exam_id: "EX-HS101", day: "TUE", session: "PM", rooms: ["AUD", "AUD"] },
    { exam_id: null, day: "TUE", session: "PM", rooms: [] },
  ];
  s.team = withFest ? null : 42;
  s.dataset_id = "some-other-dataset";
  return s;
}

// ------------------------------------------------------------------------- validator

function runPython(dir: string, c: Case, index: number): ValidatorReport {
  const file = (name: string, value: unknown) => {
    const p = path.join(dir, `${index}-${name}.json`);
    writeFileSync(p, JSON.stringify(value));
    return p;
  };
  const args = [
    "-I",
    VALIDATOR,
    "--data",
    file("data", c.data),
    "--schedule",
    file("schedule", c.schedule),
  ];
  if (c.disruption !== undefined)
    args.push("--disruption", file("disruption", c.disruption));
  if (c.baseline !== undefined)
    args.push("--baseline", file("baseline", c.baseline));
  const out = path.join(dir, `${index}-report.json`);
  args.push("--json", out, "--quiet");
  const python = process.env.PYTHON ?? "python3";
  const result = spawnSync(python, args, {
    encoding: "utf8",
    env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`validator.py failed on ${c.name}:\n${result.stderr}`);
  }
  return JSON.parse(readFileSync(out, "utf8")) as ValidatorReport;
}

function runOurs(c: Case): ValidatorReport {
  let data = DatasetSchema.parse(c.data);
  if (c.disruption !== undefined) {
    data = applyDisruption(data, DisruptionSchema.parse(c.disruption));
  }
  return validateSchedule(data, c.schedule, c.baseline);
}

// ------------------------------------------------------------------------- compare

const same = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);
const asText = (value: unknown) =>
  value === null || value === undefined ? null : String(value);

function multisetDiff(
  a: string[],
  b: string[],
): { onlyA: string[]; onlyB: string[] } {
  const counts = new Map<string, number>();
  for (const x of a) counts.set(x, (counts.get(x) ?? 0) + 1);
  for (const x of b) counts.set(x, (counts.get(x) ?? 0) - 1);
  const onlyA: string[] = [];
  const onlyB: string[] = [];
  for (const [k, n] of counts) {
    for (let i = 0; i < Math.abs(n); i++) (n > 0 ? onlyA : onlyB).push(k);
  }
  return { onlyA, onlyB };
}

type Verdict = { columns: Record<string, boolean>; notes: string[] };

function compare(ours: ValidatorReport, py: ValidatorReport): Verdict {
  const notes: string[] = [];
  const vkey = (x: { rule: string; detail: string }) =>
    `[${x.rule}] ${x.detail}`;
  const ordered = (r: ValidatorReport) =>
    r.hard_violations.map((x) => `${x.rule}|${x.where}|${x.detail}`);
  const { onlyA, onlyB } = multisetDiff(
    ours.hard_violations.map(vkey),
    py.hard_violations.map(vkey),
  );
  for (const x of onlyA) notes.push(`ours only:   ${x}`);
  for (const x of onlyB) notes.push(`python only: ${x}`);
  const violations = onlyA.length === 0 && onlyB.length === 0;
  const order = same(ordered(ours), ordered(py));
  if (violations && !order)
    notes.push("same violations, different order or `where`");

  const pyBookings = py.bookings;
  const bookings =
    (ours.bookings === undefined) === (pyBookings === undefined) &&
    (ours.bookings === undefined ||
      (ours.bookings.booking_score === pyBookings!.booking_score &&
        ours.bookings.booking_score_max_if_all_approved ===
          pyBookings!.booking_score_max_if_all_approved &&
        ours.bookings.approved === pyBookings!.approved &&
        ours.bookings.alternatives === pyBookings!.alternatives &&
        ours.bookings.rejected === pyBookings!.rejected &&
        ours.bookings.session_overrides === pyBookings!.session_overrides &&
        same(
          ours.bookings.priority_inversions,
          pyBookings!.priority_inversions,
        )));
  if (!bookings)
    notes.push(
      `bookings: ours ${JSON.stringify(ours.bookings)}\n            python ${JSON.stringify(pyBookings)}`,
    );

  const columns: Record<string, boolean> = {
    count: ours.hard_violation_count === py.hard_violation_count,
    by_rule: same(ours.hard_by_rule, py.hard_by_rule),
    violations,
    order,
    soft:
      same(ours.soft_penalties, py.soft_penalties) &&
      ours.soft_total === py.soft_total,
    bookings,
    exams: ours.exam_soft_penalty === py.exam_soft_penalty,
    stability: same(ours.stability, py.stability),
    warnings: same(ours.warnings, py.warnings),
    // The report contract types these as `string | null`, so a numeric `team` comes back as text.
    ids:
      ours.dataset_id === asText(py.dataset_id) &&
      ours.schedule_dataset_id === asText(py.schedule_dataset_id) &&
      ours.team === asText(py.team),
  };
  if (!columns.soft)
    notes.push(
      `soft: ours ${JSON.stringify(ours.soft_penalties)} python ${JSON.stringify(py.soft_penalties)}`,
    );
  if (!columns.exams)
    notes.push(
      `exam penalty: ours ${ours.exam_soft_penalty} python ${py.exam_soft_penalty}`,
    );
  if (!columns.stability)
    notes.push(
      `stability: ours ${JSON.stringify(ours.stability)} python ${JSON.stringify(py.stability)}`,
    );
  if (!columns.warnings)
    notes.push(
      `warnings: ${JSON.stringify(multisetDiff(ours.warnings, py.warnings))}`,
    );
  return { columns, notes };
}

// ------------------------------------------------------------------------- cases

function variantDataset(raw: Json): Json {
  const d = clone(raw) as Json & {
    sessions: Json[];
    faculty: Json[];
    rooms: Json[];
    room_unavailability: Json[];
    cancellations: Json[];
  };
  d.organiser_notes = "unknown top-level field";
  d.rooms[0].notes = "unknown room field";
  for (const r of d.rooms) {
    if (r.id === "CR-205" || r.id === "SH-2")
      r.allowed_uses = (r.allowed_uses as string[]).filter(
        (u) => u !== "event",
      );
  }
  const fixed: Record<string, [string, number]> = {
    "MA101-AB-L1": ["MON", 2],
    "PH191-A-P1": ["TUE", 6],
    "CS201-L1": ["WED", 3],
  };
  for (const s of d.sessions) {
    const slot = fixed[s.id as string];
    if (slot) s.fixed_slot = { day: slot[0], start_period: slot[1] };
  }
  for (const f of d.faculty) {
    if (["F01", "F03", "F19"].includes(f.id as string)) f.max_hours_per_day = 2;
    const prefs = f.preferences as Json[];
    if (f.id === "F06") delete prefs[0].days;
    if (f.id === "F07") prefs.push({ type: "prefer", periods: [1, 2] });
    if (f.id === "F11") delete f.max_hours_per_day;
  }
  d.room_unavailability.push({
    room_id: "CS-LAB-1",
    day: "MON",
    periods: [2, 3, 4],
    reason: "Variant",
  });
  d.cancellations.push({
    request_id: "BR-12",
    cancelled_at: "2027-02-01T10:00:00+05:30",
  });
  // A quote inside a list item changes how Python prints the list.
  const br14 = (d.booking_requests as Json[]).find((r) => r.id === "BR-14")!;
  br14.room_types = [
    ...(br14.room_types as string[]),
    "people's hall",
    'the "big" hall',
  ];
  return d;
}

function syntheticDisruption(data: Dataset): Json {
  const victim = data.sessions.find(
    (s) => s.kind === "lecture" && !s.basket_slot,
  )!;
  return {
    id: "parity-disruption",
    changes: [
      {
        type: "add_faculty",
        faculty: {
          id: "F99",
          name: "Dr. New Hire",
          department: "CSE",
          max_hours_per_day: 3,
          needs_accessible: false,
          unavailable: [{ day: "TUE", periods: [1, 2] }],
          preferences: [{ type: "avoid", periods: [9] }],
        },
      },
      {
        type: "faculty_unavailable",
        faculty_id: "F99",
        days: ["MON", "SAT"],
        periods: [1, 2, 3, 4, 5],
      },
      {
        type: "faculty_unavailable",
        faculty_id: "F01",
        days: ["THU", "SUN"],
        periods: [1, 2, 3, 4, 5, 6, 7, 8, 9],
        reason: "Leave",
      },
      {
        type: "room_unavailable",
        room_id: "LH-1",
        days: ["MON", "WED", "SAT"],
        periods: [1, 2, 3, 4],
      },
      {
        type: "add_session",
        session: {
          id: "CS299-L1",
          course_id: "CS299",
          kind: "lecture",
          groups: ["CSE-2"],
          faculty_id: "F99",
          size: 75,
          duration: 1,
          room_types: ["classroom", "lecture_hall"],
          needs_accessible: false,
          basket_slot: null,
          fixed_slot: null,
        },
      },
      { type: "remove_session", session_id: victim.id },
    ],
  };
}

function buildCases(): Case[] {
  const raw = readJson(DATA) as Json;
  const data = DatasetSchema.parse(raw);
  const cases: Case[] = [];

  cases.push({
    name: "example",
    data: raw,
    schedule: readJson(EXAMPLE) as Schedule,
  });

  const synthetic = synthesize(data, "Parity synthetic");
  cases.push({ name: "synthetic", data: raw, schedule: synthetic });
  cases.push({
    name: "synthetic-no-fest",
    data: raw,
    schedule: { ...clone(synthetic), fest_week: undefined },
  });

  cases.push({
    name: "edge-fest",
    data: raw,
    schedule: edgeCases(synthetic, true),
  });
  cases.push({
    name: "edge-no-fest",
    data: raw,
    schedule: edgeCases(synthetic, false),
  });

  for (let i = 0; i < MUTATIONS; i++) {
    const { schedule, ops } = mutate(synthetic, data, 1000 + i);
    cases.push({
      name: `mut-${String(i).padStart(2, "0")} ${ops.join("; ")}`,
      data: raw,
      schedule,
    });
  }

  // Disruption runs: sample change file, baseline = synthetic.
  const disruption = readJson(SAMPLE_DISRUPTION);
  const withNew = (s: Schedule, entry: Entry) => ({
    ...clone(s),
    sessions: [...clone(s.sessions), entry],
  });
  const cs202 = {
    session_id: "CS202-T2",
    day: "THU",
    start_period: 7,
    room_id: "CR-104",
  };
  cases.push({
    name: "dis-unchanged",
    data: raw,
    schedule: synthetic,
    disruption,
    baseline: synthetic,
  });
  cases.push({
    name: "dis-after-no-fest-no-exams",
    data: raw,
    schedule: {
      team: "Parity",
      dataset_id: data.dataset_id,
      sessions: withNew(synthetic, cs202).sessions,
    },
    disruption,
    baseline: synthetic,
  });
  for (let i = 0; i < 6; i++) {
    const { schedule, ops } = mutate(withNew(synthetic, cs202), data, 5000 + i);
    if (i % 2 === 1) delete schedule.exams;
    if (i % 3 === 2) delete schedule.fest_week;
    cases.push({
      name: `dis-mut-${i} ${ops.join("; ")}`,
      data: raw,
      schedule,
      disruption,
      baseline: synthetic,
    });
  }

  // A change file with all five change types (incl. non-calendar days).
  const dis2 = syntheticDisruption(data);
  const removed = (dis2.changes as Json[]).find(
    (c) => c.type === "remove_session",
  )!.session_id;
  const after2 = withNew(synthetic, {
    session_id: "CS299-L1",
    day: "TUE",
    start_period: 1,
    room_id: "LH-3",
  });
  cases.push({
    name: `dis-all-types (removes ${removed})`,
    data: raw,
    schedule: after2,
    disruption: dis2,
    baseline: synthetic,
  });
  const moved2 = mutate(after2, data, 7000).schedule;
  cases.push({
    name: "dis-all-types-mutated",
    data: raw,
    schedule: moved2,
    disruption: dis2,
    baseline: synthetic,
  });

  // Dataset variant: fixed slots, 2-hour caps, default avoid days, extra fields, extra cancellation.
  const variantRaw = variantDataset(raw);
  const variant = DatasetSchema.parse(variantRaw);
  const vsynthetic = synthesize(variant, "Parity variant");
  cases.push({
    name: "variant-synthetic",
    data: variantRaw,
    schedule: vsynthetic,
  });
  cases.push({
    name: "variant-on-base-schedule",
    data: variantRaw,
    schedule: synthetic,
  });
  cases.push({
    name: "variant-edge-fest",
    data: variantRaw,
    schedule: edgeCases(vsynthetic, true),
  });
  for (let i = 0; i < 10; i++) {
    const { schedule, ops } = mutate(vsynthetic, variant, 9000 + i);
    cases.push({
      name: `variant-mut-${i} ${ops.join("; ")}`,
      data: variantRaw,
      schedule,
    });
  }
  return cases;
}

// ------------------------------------------------------------------------- main

function main(): number {
  const verbose = process.argv.includes("--verbose");
  const keep = process.argv.includes("--keep");
  const cases = buildCases();
  const dir = mkdtempSync(path.join(tmpdir(), "cit-parity-"));
  const rows: string[][] = [];
  let failures = 0;
  const ruleTotals = new Map<string, number>();
  try {
    cases.forEach((c, index) => {
      const py = runPython(dir, c, index);
      const ours = runOurs(c);
      const { columns, notes } = compare(ours, py);
      for (const [rule, n] of Object.entries(py.hard_by_rule)) {
        ruleTotals.set(rule, (ruleTotals.get(rule) ?? 0) + n);
      }
      const ok = Object.values(columns).every(Boolean);
      if (!ok) failures++;
      rows.push([
        c.name.length > 58 ? `${c.name.slice(0, 55)}...` : c.name,
        `${ours.hard_violation_count}/${py.hard_violation_count}`,
        `${ours.soft_total}/${py.soft_total}`,
        ours.bookings
          ? `${ours.bookings.booking_score}/${py.bookings?.booking_score}`
          : "-",
        String(py.bookings?.priority_inversions.length ?? "-"),
        ...Object.values(columns).map((x) => (x ? "ok" : "XX")),
        ok ? "PASS" : "FAIL",
      ]);
      if (!ok) {
        console.log(`\n${c.name}: MISMATCH`);
        for (const note of verbose ? notes : notes.slice(0, 12))
          console.log(`  ${note}`);
        if (!verbose && notes.length > 12)
          console.log(`  ... ${notes.length - 12} more (--verbose)`);
      }
    });
  } finally {
    if (keep) console.log(`\nInputs and validator reports kept in ${dir}`);
    else rmSync(dir, { recursive: true, force: true });
  }

  const header = [
    "case",
    "hard o/p",
    "soft o/p",
    "score o/p",
    "inv",
    "count",
    "rules",
    "viol",
    "order",
    "soft",
    "book",
    "exam",
    "stab",
    "warn",
    "ids",
    "result",
  ];
  const widths = header.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => r[i].length)),
  );
  const line = (r: string[]) => r.map((x, i) => x.padEnd(widths[i])).join("  ");
  console.log(
    `\n${line(header)}\n${widths.map((w) => "-".repeat(w)).join("  ")}`,
  );
  for (const r of rows) console.log(line(r));
  const rules = [...ruleTotals]
    .sort(([a], [b]) => cmp(a, b))
    .map(([r, n]) => `${r}:${n}`);
  console.log(`\nRules exercised (validator totals): ${rules.join(" ")}`);
  console.log(
    `${cases.length - failures}/${cases.length} cases match exactly.`,
  );
  return failures === 0 ? 0 : 1;
}

process.exitCode = main();
