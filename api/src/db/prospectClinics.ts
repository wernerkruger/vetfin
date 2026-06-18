import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { HttpError } from "../errors.js";
import { getDb } from "./connection.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export type ProspectClinicRow = {
  id: string;
  category: string | null;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  state_short: string | null;
  phone: string | null;
  website: string | null;
  rating: number | null;
  source_url: string | null;
  email: string | null;
  signed_up: number;
  practice_id: string | null;
  created_at: string;
  updated_at: string;
};

export type ProspectClinicFilters = {
  category?: string;
  name?: string;
  address?: string;
  city?: string;
  state?: string;
  stateShort?: string;
  phone?: string;
  website?: string;
  rating?: string;
  sourceUrl?: string;
  email?: string;
  signedUp?: "yes" | "no" | "all";
  page?: number;
  limit?: number;
};

function clinicsCsvPath(): string {
  const candidates = [
    path.join(__dirname, "../data/wowvets_clinics.csv"),
    path.join(__dirname, "../../data/wowvets_clinics.csv"),
    path.join(process.cwd(), "api/data/wowvets_clinics.csv"),
    path.join(process.cwd(), "data/wowvets_clinics.csv"),
    path.join(process.cwd(), "Analysis/wowvets_clinics.csv"),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  throw new Error("wowvets_clinics.csv not found");
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]!;
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      fields.push(current);
      current = "";
      continue;
    }
    current += ch;
  }

  fields.push(current);
  return fields;
}

function emptyToNull(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function importProspectClinicsIfEmpty(): number {
  const database = getDb();
  const existing = database
    .prepare("SELECT COUNT(*) AS n FROM prospect_clinics")
    .get() as { n: number };
  if ((existing.n ?? 0) > 0) return 0;

  const csv = fs.readFileSync(clinicsCsvPath(), "utf8");
  const lines = csv.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) return 0;

  const insert = database.prepare(
    `INSERT INTO prospect_clinics (
      id, category, name, address, city, state, state_short,
      phone, website, rating, source_url, email
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  const importMany = database.transaction((rows: string[][]) => {
    for (const row of rows) {
      if (row.length < 12) continue;
      const [
        category,
        name,
        address,
        city,
        state,
        stateShort,
        phone,
        website,
        rating,
        bid,
        sourceUrl,
        email,
      ] = row;
      if (!bid?.trim() || !name?.trim()) continue;

      insert.run(
        bid.trim(),
        emptyToNull(category),
        name.trim(),
        emptyToNull(address),
        emptyToNull(city),
        emptyToNull(state),
        emptyToNull(stateShort),
        emptyToNull(phone),
        emptyToNull(website),
        rating?.trim() ? Number(rating) : null,
        emptyToNull(sourceUrl),
        emptyToNull(email),
      );
    }
  });

  const dataRows = lines.slice(1).map(parseCsvLine);
  importMany(dataRows);
  syncSignedUpFromPractices();
  return dataRows.length;
}

export function syncSignedUpFromPractices(): void {
  const database = getDb();

  database.exec(`
    UPDATE prospect_clinics
    SET signed_up = 1,
        practice_id = (
          SELECT vp.id
          FROM vet_practices vp
          WHERE vp.prospect_clinic_id = prospect_clinics.id
          LIMIT 1
        ),
        updated_at = datetime('now')
    WHERE id IN (
      SELECT prospect_clinic_id FROM vet_practices
      WHERE prospect_clinic_id IS NOT NULL
    )
  `);

  database.exec(`
    UPDATE prospect_clinics
    SET signed_up = 1,
        practice_id = (
          SELECT vp.id
          FROM vet_practices vp
          WHERE LOWER(TRIM(vp.name)) = LOWER(TRIM(prospect_clinics.name))
            AND vp.prospect_clinic_id IS NULL
          LIMIT 1
        ),
        updated_at = datetime('now')
    WHERE signed_up = 0
      AND EXISTS (
        SELECT 1
        FROM vet_practices vp
        WHERE LOWER(TRIM(vp.name)) = LOWER(TRIM(prospect_clinics.name))
      )
  `);
}

export function toPublicProspectClinic(row: ProspectClinicRow) {
  return {
    id: row.id,
    category: row.category,
    name: row.name,
    address: row.address,
    city: row.city,
    state: row.state,
    stateShort: row.state_short,
    phone: row.phone,
    website: row.website,
    rating: row.rating,
    sourceUrl: row.source_url,
    email: row.email,
    signedUp: row.signed_up === 1,
    practiceId: row.practice_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function searchProspectClinics(query: string, limit = 10) {
  const q = query.trim();
  if (q.length < 2) return [];

  const rows = getDb()
    .prepare(
      `SELECT *
       FROM prospect_clinics
       WHERE signed_up = 0
         AND LOWER(name) LIKE ?
       ORDER BY name
       LIMIT ?`,
    )
    .all(`${q.toLowerCase()}%`, limit) as ProspectClinicRow[];

  return rows.map(toPublicProspectClinic);
}

export function getProspectClinicById(id: string): ProspectClinicRow | undefined {
  return getDb()
    .prepare("SELECT * FROM prospect_clinics WHERE id = ?")
    .get(id) as ProspectClinicRow | undefined;
}

function likeFilter(column: string, value: string | undefined): {
  clause: string;
  param: string;
} | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return { clause: `LOWER(${column}) LIKE '%' || LOWER(?) || '%'`, param: trimmed };
}

export function listAdminProspectClinics(filters: ProspectClinicFilters) {
  const page = Math.max(1, filters.page ?? 1);
  const limit = Math.min(100, Math.max(1, filters.limit ?? 50));
  const offset = (page - 1) * limit;

  const where: string[] = [];
  const params: Array<string | number> = [];

  const textFilters: Array<[string, string | undefined]> = [
    ["category", filters.category],
    ["name", filters.name],
    ["address", filters.address],
    ["city", filters.city],
    ["state", filters.state],
    ["state_short", filters.stateShort],
    ["phone", filters.phone],
    ["website", filters.website],
    ["source_url", filters.sourceUrl],
    ["email", filters.email],
  ];

  for (const [column, value] of textFilters) {
    const filter = likeFilter(column, value);
    if (!filter) continue;
    where.push(filter.clause);
    params.push(filter.param);
  }

  if (filters.rating?.trim()) {
    where.push("CAST(rating AS TEXT) LIKE ?");
    params.push(`%${filters.rating.trim()}%`);
  }

  if (filters.signedUp === "yes") {
    where.push("signed_up = 1");
  } else if (filters.signedUp === "no") {
    where.push("signed_up = 0");
  }

  const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

  const database = getDb();
  const totalRow = database
    .prepare(`SELECT COUNT(*) AS n FROM prospect_clinics ${whereSql}`)
    .get(...params) as { n: number };

  const rows = database
    .prepare(
      `SELECT *
       FROM prospect_clinics
       ${whereSql}
       ORDER BY name
       LIMIT ? OFFSET ?`,
    )
    .all(...params, limit, offset) as ProspectClinicRow[];

  return {
    clinics: rows.map(toPublicProspectClinic),
    total: totalRow.n ?? 0,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil((totalRow.n ?? 0) / limit)),
  };
}

export function linkProspectClinicToPractice(
  clinicId: string,
  practiceId: string,
): void {
  const database = getDb();
  const clinic = getProspectClinicById(clinicId);
  if (!clinic) {
    throw new HttpError(404, "Clinic not found in prospect list");
  }
  if (clinic.signed_up === 1 && clinic.practice_id !== practiceId) {
    throw new HttpError(409, "This clinic is already registered on VetFin");
  }

  database
    .prepare(
      `UPDATE prospect_clinics
       SET signed_up = 1, practice_id = ?, updated_at = datetime('now')
       WHERE id = ?`,
    )
    .run(practiceId, clinicId);

  database
    .prepare(
      `UPDATE vet_practices
       SET prospect_clinic_id = ?, updated_at = datetime('now')
       WHERE id = ?`,
    )
    .run(clinicId, practiceId);
}
