import { getSession } from "auth/server";
import { NextResponse } from "next/server";
import {
  createGrowthSprint,
  listGrowthSprints,
} from "@/lib/agen-team/growth/agency-service";
import { CreateGrowthSprintInputSchema } from "@/lib/agen-team/growth/schemas";

export async function GET() {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const sprints = await listGrowthSprints(session.user.id);
    return NextResponse.json({ sprints });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const input = CreateGrowthSprintInputSchema.parse(await request.json());
    const sprint = await createGrowthSprint({
      userId: session.user.id,
      input,
    });

    return NextResponse.json({ sprint }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 400 },
    );
  }
}
