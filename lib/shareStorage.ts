import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const DATA_DIR =
  process.env.DHVANI_DATA_DIR || path.join(process.cwd(), "data", "transcripts");
const SHARES_FILE = path.join(DATA_DIR, "_shares.json");

export type ShareRecord = {
  token: string;
  transcriptId: string;
  userId: string;
  expiresAt: string | null;
  requireAuth: boolean;
  createdAt: string;
};

async function readShares(): Promise<ShareRecord[]> {
  try {
    const raw = await fs.readFile(SHARES_FILE, "utf8");
    return JSON.parse(raw) as ShareRecord[];
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

async function writeShares(shares: ShareRecord[]): Promise<void> {
  await fs.mkdir(path.dirname(SHARES_FILE), { recursive: true });
  const tmp = SHARES_FILE + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(shares), "utf8");
  await fs.rename(tmp, SHARES_FILE);
}

export async function createShare(
  transcriptId: string,
  userId: string,
  expiresIn: "24h" | "7d" | "30d" | "never",
  requireAuth: boolean
): Promise<ShareRecord> {
  const token = crypto.randomUUID();
  const now = new Date();
  let expiresAt: string | null = null;
  if (expiresIn === "24h") expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
  else if (expiresIn === "7d") expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
  else if (expiresIn === "30d") expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();

  const record: ShareRecord = {
    token,
    transcriptId,
    userId,
    expiresAt,
    requireAuth,
    createdAt: now.toISOString(),
  };

  const shares = await readShares();
  shares.push(record);
  await writeShares(shares);
  return record;
}

export async function getShare(token: string): Promise<ShareRecord | null> {
  const shares = await readShares();
  const record = shares.find((s) => s.token === token);
  if (!record) return null;
  if (record.expiresAt && new Date(record.expiresAt).getTime() < Date.now()) return null;
  return record;
}

export async function deleteShare(token: string, userId: string): Promise<boolean> {
  const shares = await readShares();
  const idx = shares.findIndex((s) => s.token === token && s.userId === userId);
  if (idx === -1) return false;
  shares.splice(idx, 1);
  await writeShares(shares);
  return true;
}
