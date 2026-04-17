import { NextResponse } from "next/server";
import { getActiveUser } from "@/lib/auth";
import { getUserEmissions } from "@/lib/greenIct";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/me/emissions
 *
 * Returns a compact personal-footprint card for the signed-in user —
 * minutes transcribed and estimated carbon over the last 30 days.
 * Used by the SettingsDrawer "Your Carbon Footprint" section.
 */
export async function GET() {
  const user = await getActiveUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const data = await getUserEmissions(user.userId, 30);
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: "Failed to compute personal emissions." },
      { status: 500 }
    );
  }
}
