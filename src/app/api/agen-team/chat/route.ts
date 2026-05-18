import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { headers } from "next/headers";
import globalLogger from "logger";
import { colorize } from "consola/utils";
import { handleLegacyChiefConversation } from "@/lib/agen-team/legacy-chief-gateway";

const logger = globalLogger.withDefaults({
  message: colorize("blackBright", "Agen Team Legacy Chat: "),
});

export async function POST(req: Request) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const legacyEnabled =
      process.env.AGEN_TEAM_LEGACY_API_ENABLED === "true";
    if (!legacyEnabled) {
      logger.warn("legacy chief router called without flag", {
        action: "chief_message",
        userId: session.user.id,
      });
      return new Response("Gone", { status: 410 });
    }

    const payload = await req.json();
    const messages = payload.messages || [];

    // Find the last user message to forward to the Chief Agent
    let userMessage = "";

    // Evaluate the last message
    const lastMessage = messages[messages.length - 1];

    if (lastMessage?.role === "user") {
      if (typeof lastMessage.content === "string") {
        userMessage = lastMessage.content;
      } else if (Array.isArray(lastMessage.parts)) {
        const textPart = lastMessage.parts.find(
          (p: any) => p.type === "text" || p.text,
        );
        if (textPart) userMessage = textPart.text;
      }
    } else if (lastMessage?.role === "tool") {
      // If it's a tool response (like the user answered askUserInput), stringify it so Chief knows what's up
      userMessage =
        "User provided response: " + JSON.stringify(lastMessage.content);
    } else {
      userMessage = "Hello Chief"; // Fallback
    }

    // Call the local Chief Router
    const data = await handleLegacyChiefConversation(
      session.user.id,
      userMessage,
      payload.id || "default",
    );

    // Convert the ChiefMessageResponse to Vercel AI SDK Data Stream Protocol v1
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        // 1. Send the text response
        const responseText =
          data.messageText || "Saya menerima instruksi Anda.";
        controller.enqueue(
          encoder.encode(`0:${JSON.stringify(responseText)}\n`),
        );

        // 2. If the Chief requires options, format it as an `askUserInput` tool call
        if (data.options && data.options.length > 0) {
          const toolCallId = "call_" + Math.random().toString(36).slice(2);
          const toolCall = {
            toolCallId: toolCallId,
            toolName: "askUserInput",
            args: {
              type: "single_select",
              questions: [
                {
                  question: "Pilih tindakan selanjutnya:",
                  options: data.options,
                },
              ],
            },
          };
          controller.enqueue(encoder.encode(`9:${JSON.stringify(toolCall)}\n`));
        }

        // 3. Close the stream
        controller.enqueue(
          encoder.encode(
            `e:{"finishReason":"stop","usage":{"promptTokens":0,"completionTokens":0}}\n`,
          ),
        );
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "x-vercel-ai-data-stream": "v1",
      },
    });
  } catch (error: any) {
    console.error("Agen Team Bridge Error:", error);
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            `0:${JSON.stringify("Terjadi kesalahan teknis: " + error.message)}\n`,
          ),
        );
        controller.enqueue(encoder.encode(`e:{"finishReason":"error"}\n`));
        controller.close();
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "x-vercel-ai-data-stream": "v1",
      },
    });
  }
}
