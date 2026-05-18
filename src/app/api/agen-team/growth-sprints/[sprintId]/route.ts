import { getSession } from "auth/server";
import { NextResponse } from "next/server";
import {
  approveGrowthSprint,
  getGrowthSprint,
  updateGrowthSprintStatus,
} from "@/lib/agen-team/growth/agency-service";

type RouteContext = {
  params: Promise<{ sprintId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { sprintId } = await context.params;
    const details = await getGrowthSprint(session.user.id, sprintId);
    if (!details) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(details);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { sprintId } = await context.params;
    const body = (await request.json()) as {
      action?: "approve_strategy" | "pause" | "resume" | "cancel";
    };

    if (body.action === "approve_strategy") {
      const details = await approveGrowthSprint(session.user.id, sprintId);
      return NextResponse.json(details);
    }

    if (
      body.action === "pause" ||
      body.action === "resume" ||
      body.action === "cancel"
    ) {
      const details = await updateGrowthSprintStatus({
        userId: session.user.id,
        sprintId,
        action: body.action,
      });
      return NextResponse.json(details);
    }

    return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 400 },
    );
  }
}
