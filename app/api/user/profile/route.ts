import { NextRequest, NextResponse } from "next/server";
import { getActiveUser } from "@/lib/auth";
import { readUserProfile, writeUserProfile } from "@/lib/userProfileStorage";
import { findRoleProfile } from "@/lib/roleProfiles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getActiveUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const profile = await readUserProfile(user.userId);
  return NextResponse.json({ profile });
}

export async function POST(req: NextRequest) {
  const user = await getActiveUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: {
    roleId?: string;
    preferredLanguages?: string[];
    featurePriorities?: string[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const resolved = findRoleProfile(body.roleId); // always a valid id
  const profile = {
    userId: user.userId,
    roleId: resolved.id,
    preferredLanguages: Array.isArray(body.preferredLanguages)
      ? body.preferredLanguages.slice(0, 10)
      : resolved.languages,
    featurePriorities: Array.isArray(body.featurePriorities)
      ? body.featurePriorities.slice(0, 10)
      : [],
    updatedAt: new Date().toISOString(),
  };
  try {
    await writeUserProfile(profile);
  } catch (err) {
    console.error("[user/profile] write failed", err);
    return NextResponse.json(
      { error: "Failed to save profile." },
      { status: 500 }
    );
  }
  return NextResponse.json({ profile });
}
