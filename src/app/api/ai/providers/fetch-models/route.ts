import { NextRequest, NextResponse } from "next/server";
import { getSession } from "auth/server";

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { baseURL, apiKey } = await request.json();

    if (!baseURL) {
      return NextResponse.json({ error: "baseURL is required" }, { status: 400 });
    }

    const normalizedBase = baseURL.endsWith("/") ? baseURL.slice(0, -1) : baseURL;
    const modelsUrl = `${normalizedBase}/models`;

    const startTime = Date.now();
    const response = await fetch(modelsUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      signal: AbortSignal.timeout(10000),
    });

    const latencyMs = Date.now() - startTime;

    if (!response.ok) {
      return NextResponse.json({
        success: false,
        latencyMs,
        error: `Provider returned HTTP ${response.status}: ${response.statusText}`,
      });
    }

    const data = await response.json();
    const models: string[] = [];

    // Handle both OpenAI format ({ data: [{ id }] }) and simple array format ([{ id }])
    if (Array.isArray(data)) {
      models.push(...data.map((m: any) => m.id || m.name).filter(Boolean));
    } else if (data?.data && Array.isArray(data.data)) {
      models.push(...data.data.map((m: any) => m.id || m.name).filter(Boolean));
    }

    return NextResponse.json({
      success: true,
      latencyMs,
      models,
      total: models.length,
    });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message || "Connection failed",
      latencyMs: null,
    });
  }
}
