import { NextRequest, NextResponse } from "next/server";
import { getActiveUser } from "@/lib/auth";
import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DATA_DIR =
  process.env.DHVANI_DATA_DIR || path.join(process.cwd(), "data", "transcripts");

type VocabEntry = {
  id: string;
  term: string;
  definition: string;
};

function vocabFile(userId: string): string {
  return path.join(DATA_DIR, "_vocabulary", `${userId}.json`);
}

async function readVocab(userId: string): Promise<VocabEntry[]> {
  try {
    const raw = await fs.readFile(vocabFile(userId), "utf8");
    return JSON.parse(raw);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

async function writeVocab(userId: string, entries: VocabEntry[]): Promise<void> {
  const dir = path.dirname(vocabFile(userId));
  await fs.mkdir(dir, { recursive: true });
  const tmp = vocabFile(userId) + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(entries), "utf8");
  await fs.rename(tmp, vocabFile(userId));
}

export async function GET() {
  const user = await getActiveUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const vocab = await readVocab(user.userId);
  return NextResponse.json({ terms: vocab });
}

export async function POST(req: NextRequest) {
  const user = await getActiveUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { term?: string; definition?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const term = (body.term || "").trim().slice(0, 200);
  if (!term) {
    return NextResponse.json({ error: "Term is required." }, { status: 400 });
  }

  const vocab = await readVocab(user.userId);
  if (vocab.length >= 500) {
    return NextResponse.json({ error: "Too many terms (max 500)." }, { status: 400 });
  }
  if (vocab.some((v) => v.term.toLowerCase() === term.toLowerCase())) {
    return NextResponse.json({ error: "Term already exists." }, { status: 409 });
  }

  const entry: VocabEntry = {
    id: crypto.randomBytes(8).toString("hex"),
    term,
    definition: (body.definition || "").trim().slice(0, 500),
  };
  vocab.push(entry);
  await writeVocab(user.userId, vocab);

  return NextResponse.json({ term: entry }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const user = await getActiveUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "ID is required." }, { status: 400 });
  }

  const vocab = await readVocab(user.userId);
  const idx = vocab.findIndex((v) => v.id === id);
  if (idx === -1) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  vocab.splice(idx, 1);
  await writeVocab(user.userId, vocab);

  return NextResponse.json({ ok: true });
}
