/**
 * RnR API — Supabase Edge Function
 * Parity with backend/code.gs (Google Apps Script).
 *
 * Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *          RNR_FAMILY_PASSWORD, RNR_ADMIN_PASSWORD
 * Requires `rnr` in Project Settings → API → Exposed Schemas.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const DB_SCHEMA = "rnr";
const VALID_ROOMS = ["Entire House", "Master", "Twin", "Bunk"];
const ACTIVITY_LOG_LIMIT = 1000;

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function responseJson(obj: unknown, status = 200): Response {
  return new Response(
    JSON.stringify(obj, (_k, v) => typeof v === "bigint" ? Number(v) : v),
    {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
}

function getSupabase() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
    );
  }
  return createClient(supabaseUrl, serviceKey, {
    db: { schema: DB_SCHEMA },
  });
}

function formatDateISO(date: unknown): string {
  if (!date) return "";
  if (typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return date;
  }
  const d = new Date(String(date));
  if (isNaN(d.getTime())) return "";
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizePin(pin: unknown): string {
  return String(pin || "").replace(/\s+/g, " ").trim();
}

type AuthRole = "family" | "admin";

function resolveAuthRole(password: string): AuthRole | null {
  const family = Deno.env.get("RNR_FAMILY_PASSWORD") ?? "";
  const admin = Deno.env.get("RNR_ADMIN_PASSWORD") ?? "";
  if (password === admin && admin !== "") return "admin";
  if (password === family && family !== "") return "family";
  return null;
}

function requireAuth(authPassword: unknown): AuthRole {
  const role = resolveAuthRole(String(authPassword || ""));
  if (!role) throw new Error("Invalid password");
  return role;
}

function validateRoom(roomValue: string): void {
  if (roomValue.includes(",")) {
    const rooms = roomValue.split(",").map((r) => r.trim());
    const invalid = rooms.filter((r) => !VALID_ROOMS.includes(r));
    if (invalid.length > 0) {
      throw new Error("Invalid room selection: " + invalid.join(", "));
    }
  } else if (!VALID_ROOMS.includes(roomValue)) {
    throw new Error("Invalid room selection");
  }
}

type BookingRow = {
  id: number;
  guest_name: string;
  room: string;
  start_date: string;
  end_date: string;
  notes: string;
  pin: string;
};

function rowToBooking(row: BookingRow) {
  const id = Number(row.id);
  return {
    id,
    rowId: id,
    guestName: row.guest_name || "",
    room: row.room || "",
    startDate: formatDateISO(row.start_date),
    endDate: formatDateISO(row.end_date),
    notes: row.notes || "",
    pin: normalizePin(row.pin),
  };
}

function conflictMessage(room: string): string {
  if (room === "Entire House") {
    return "The entire house is already booked for the selected dates";
  }
  if (room.includes(",")) {
    return "One or more of the selected rooms are already booked for the selected dates";
  }
  return "This room is already booked for the selected dates";
}

function checkBookingConflict(
  rows: BookingRow[],
  room: string,
  startDate: string,
  endDate: string,
  excludeId: number | null,
): boolean {
  const newStart = new Date(startDate);
  const newEnd = new Date(endDate);

  for (const row of rows) {
    if (!row.guest_name) continue;
    if (excludeId != null && Number(row.id) === excludeId) continue;

    const existingRoom = row.room;
    const existingStart = new Date(String(row.start_date));
    const existingEnd = new Date(String(row.end_date));

    const datesOverlap = newStart < existingEnd && newEnd > existingStart;
    if (!datesOverlap) continue;

    const newRooms = room === "Entire House"
      ? ["Entire House"]
      : room.split(",").map((r) => r.trim());
    const existingRooms = existingRoom === "Entire House"
      ? ["Entire House"]
      : existingRoom.split(",").map((r) => r.trim());

    if (newRooms.includes("Entire House")) return true;
    if (existingRooms.includes("Entire House")) return true;

    for (const nr of newRooms) {
      if (existingRooms.includes(nr)) return true;
    }
  }

  return false;
}

async function getAllBookingRows(
  sb: ReturnType<typeof createClient>,
): Promise<BookingRow[]> {
  const { data, error } = await sb
    .from("bookings")
    .select("id, guest_name, room, start_date, end_date, notes, pin")
    .order("id", { ascending: true });
  if (error) throw new Error(error.message);
  return (data || []) as BookingRow[];
}

async function getBookingById(
  sb: ReturnType<typeof createClient>,
  bookingId: number,
): Promise<BookingRow> {
  const { data, error } = await sb
    .from("bookings")
    .select("id, guest_name, room, start_date, end_date, notes, pin")
    .eq("id", bookingId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Booking not found");
  return data as BookingRow;
}

async function verifyPassword(body: { password?: string }) {
  const password = String(body.password || "");
  const role = resolveAuthRole(password);
  if (!role) throw new Error("Invalid password");
  return { role };
}

async function getBookings(sb: ReturnType<typeof createClient>) {
  const rows = await getAllBookingRows(sb);
  return rows
    .filter((r) => r.guest_name !== "")
    .map(rowToBooking);
}

async function createBooking(
  sb: ReturnType<typeof createClient>,
  body: Record<string, unknown>,
) {
  requireAuth(body.authPassword);

  const guestName = String(body.guestName || "");
  const room = String(body.room || "");
  const startDate = String(body.startDate || "");
  const endDate = String(body.endDate || "");
  const notes = String(body.notes || "");
  const pin = normalizePin(body.pin);

  if (!guestName || !room || !startDate || !endDate) {
    throw new Error("Missing required fields");
  }

  validateRoom(room);

  const allRows = await getAllBookingRows(sb);
  if (checkBookingConflict(allRows, room, startDate, endDate, null)) {
    throw new Error(conflictMessage(room));
  }

  const { data, error } = await sb
    .from("bookings")
    .insert({
      guest_name: guestName,
      room,
      start_date: startDate,
      end_date: endDate,
      notes,
      pin,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  return {
    bookingId: Number((data as { id: number }).id),
    message: "Booking created successfully",
  };
}

async function updateBooking(
  sb: ReturnType<typeof createClient>,
  body: Record<string, unknown>,
) {
  const role = requireAuth(body.authPassword);

  const bookingId = parseInt(String(body.bookingId), 10);
  if (isNaN(bookingId) || bookingId < 1) {
    throw new Error("Invalid booking ID");
  }

  const existing = await getBookingById(sb, bookingId);
  const existingPin = normalizePin(existing.pin);

  if (existingPin !== "" && body.pin) {
    const providedPin = normalizePin(body.pin);
    if (providedPin !== existingPin && role !== "admin") {
      throw new Error("Invalid PIN code");
    }
  }

  const guestName = body.guestName !== undefined
    ? String(body.guestName)
    : existing.guest_name;
  const room = body.room !== undefined ? String(body.room) : existing.room;
  const startDate = body.startDate !== undefined
    ? String(body.startDate)
    : formatDateISO(existing.start_date);
  const endDate = body.endDate !== undefined
    ? String(body.endDate)
    : formatDateISO(existing.end_date);
  const notes = body.notes !== undefined
    ? String(body.notes)
    : existing.notes;

  if (body.room) validateRoom(room);

  const allRows = await getAllBookingRows(sb);
  if (checkBookingConflict(allRows, room, startDate, endDate, bookingId)) {
    throw new Error(conflictMessage(room));
  }

  const { error } = await sb
    .from("bookings")
    .update({
      guest_name: guestName,
      room,
      start_date: startDate,
      end_date: endDate,
      notes,
    })
    .eq("id", bookingId);

  if (error) throw new Error(error.message);

  return { message: "Booking updated successfully" };
}

async function deleteBooking(
  sb: ReturnType<typeof createClient>,
  body: Record<string, unknown>,
) {
  const role = requireAuth(body.authPassword);

  const bookingId = parseInt(String(body.bookingId), 10);
  if (isNaN(bookingId) || bookingId < 1) {
    throw new Error("Invalid booking ID");
  }

  const existing = await getBookingById(sb, bookingId);
  const existingPin = normalizePin(existing.pin);

  if (existingPin !== "" && body.pin && role !== "admin") {
    const providedPin = normalizePin(body.pin);
    if (providedPin !== existingPin) {
      throw new Error("Invalid PIN code");
    }
  }

  const { error } = await sb.from("bookings").delete().eq("id", bookingId);
  if (error) throw new Error(error.message);

  return { message: "Booking deleted successfully" };
}

async function logActivity(
  sb: ReturnType<typeof createClient>,
  body: Record<string, unknown>,
) {
  requireAuth(body.authPassword);

  let activity: Record<string, unknown>;
  if (typeof body.activity === "string") {
    activity = JSON.parse(body.activity);
  } else if (body.activity && typeof body.activity === "object") {
    activity = body.activity as Record<string, unknown>;
  } else {
    throw new Error("Missing activity data");
  }

  const bookingIdRaw = activity.bookingId;
  const bookingId = bookingIdRaw != null && bookingIdRaw !== ""
    ? parseInt(String(bookingIdRaw), 10)
    : null;

  const { error } = await sb.from("activity_log").insert({
    ts: activity.timestamp || new Date().toISOString(),
    action: activity.action || "",
    booking_id: bookingId != null && !isNaN(bookingId) ? bookingId : null,
    data: activity.data || {},
    session_info: activity.sessionInfo || {},
  });

  if (error) throw new Error(error.message);

  return { message: "Activity logged successfully" };
}

async function getActivityLog(
  sb: ReturnType<typeof createClient>,
  body: Record<string, unknown>,
) {
  const role = requireAuth(body.authPassword);
  if (role !== "admin") throw new Error("Admin access required");

  const { data, error } = await sb
    .from("activity_log")
    .select("id, ts, action, booking_id, data, session_info")
    .order("ts", { ascending: false })
    .limit(ACTIVITY_LOG_LIMIT);

  if (error) throw new Error(error.message);

  return (data || []).map((row) => {
    const r = row as {
      id: number;
      ts: string;
      action: string;
      booking_id: number | null;
      data: Record<string, unknown>;
      session_info: Record<string, unknown>;
    };
    return {
      id: Number(r.id),
      timestamp: r.ts,
      action: r.action,
      bookingId: r.booking_id != null ? Number(r.booking_id) : null,
      data: r.data,
      sessionInfo: r.session_info,
    };
  });
}

async function doGet(
  sb: ReturnType<typeof createClient>,
  url: URL,
): Promise<Response> {
  const action = url.searchParams.get("action") || "";
  const out: { error: string | null; data: unknown } = { error: null, data: null };
  try {
    if (action === "getBookings") {
      out.data = await getBookings(sb);
    } else {
      throw new Error("Unknown or missing action");
    }
  } catch (err) {
    out.error = err instanceof Error ? err.message : String(err);
  }
  return responseJson(out);
}

async function doPost(
  sb: ReturnType<typeof createClient>,
  req: Request,
): Promise<Response> {
  let body: Record<string, unknown> = {};
  try {
    const text = await req.text();
    if (text) body = JSON.parse(text);
  } catch {
    body = {};
  }

  const action = String(body.action || "");
  const out: { error: string | null; data: unknown } = { error: null, data: null };
  try {
    if (action === "verifyPassword") {
      out.data = await verifyPassword(body as { password?: string });
    } else if (action === "createBooking") {
      out.data = await createBooking(sb, body);
    } else if (action === "updateBooking") {
      out.data = await updateBooking(sb, body);
    } else if (action === "deleteBooking") {
      out.data = await deleteBooking(sb, body);
    } else if (action === "logActivity") {
      out.data = await logActivity(sb, body);
    } else if (action === "getActivityLog") {
      out.data = await getActivityLog(sb, body);
    } else {
      throw new Error("Unknown or missing action");
    }
  } catch (err) {
    out.error = err instanceof Error ? err.message : String(err);
  }
  return responseJson(out);
}

Deno.serve(async (req: Request) => {
  try {
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const sb = getSupabase();

    if (req.method === "GET") {
      return await doGet(sb, new URL(req.url));
    }
    if (req.method === "POST") {
      return await doPost(sb, req);
    }
    return responseJson({ error: "Method not allowed", data: null }, 405);
  } catch (err) {
    return responseJson({
      error: err instanceof Error ? err.message : String(err),
      data: null,
    }, 500);
  }
});
