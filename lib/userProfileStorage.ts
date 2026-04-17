/**
 * Per-user profile storage — role id + UI preferences selected
 * during onboarding. One JSON file per user under data/users/.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import {
  ensureWithinDir,
  logSecurityEvent,
  sanitizePathSegment,
} from "@/lib/security";

export type UserProfile = {
  userId: string;
  roleId: string;
  preferredLanguages: string[];
  featurePriorities: string[];
  updatedAt: string;
};

const BASE_DIR =
  process.env.DHVANI_DATA_DIR ||
  path.join(process.cwd(), "data", "transcripts");
const USERS_DIR = path.join(BASE_DIR, "_users");

function fileFor(userId: string): string | null {
  const safe = sanitizePathSegment(userId);
  if (!safe) return null;
  const p = path.join(USERS_DIR, `${safe}.json`);
  if (!ensureWithinDir(p, USERS_DIR)) {
    logSecurityEvent({
      type: "path_traversal",
      userId,
      details: "user profile path escaped USERS_DIR",
    });
    return null;
  }
  return p;
}

export async function readUserProfile(
  userId: string
): Promise<UserProfile | null> {
  const p = fileFor(userId);
  if (!p) return null;
  try {
    const raw = await fs.readFile(p, "utf8");
    return JSON.parse(raw) as UserProfile;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

export async function writeUserProfile(
  profile: UserProfile
): Promise<void> {
  const p = fileFor(profile.userId);
  if (!p) throw new Error("Invalid user id");
  await fs.mkdir(path.dirname(p), { recursive: true });
  const tmp = p + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(profile), "utf8");
  await fs.rename(tmp, p);
}
