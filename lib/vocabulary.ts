import { promises as fs } from "node:fs";
import path from "node:path";

const DATA_DIR =
  process.env.DHVANI_DATA_DIR || path.join(process.cwd(), "data", "transcripts");

type VocabEntry = { id: string; term: string; definition: string };

export async function loadVocabulary(userId: string): Promise<string[]> {
  const file = path.join(DATA_DIR, "_vocabulary", `${userId}.json`);
  try {
    const raw = await fs.readFile(file, "utf8");
    const entries = JSON.parse(raw) as VocabEntry[];
    return entries.map((e) => e.term);
  } catch {
    return [];
  }
}
