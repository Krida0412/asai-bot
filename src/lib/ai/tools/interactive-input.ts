import { tool } from "ai";
import { z } from "zod";
import { ChiefMarkerSchema } from "lib/agen-team/chief/markers";

export const askUserInputTool = tool({
  description:
    "Request structured clarification from the user before providing recommendations. Call this tool silently with NO text before or after it. STRICT LIMITS: max 3 questions, max 4 options per question. Exceeding these limits will cause an error.",
  inputSchema: z.object({
    type: z.enum(["single_select", "multi_select", "rank_priorities"]),
    message: z.string().optional().describe("opsional, teks pembuka"),
    questions: z
      .array(
        z.object({
          question: z.string(),
          options: z.array(z.string()).max(4),
        }),
      )
      .max(3),
    /**
     * Requirement 8.1, 8.2 — Marker tag yang dipakai `Scope_Router` untuk
     * dispatch berbasis intent (wizard slot, confirm, correction, cancel,
     * advisory) tanpa regex pada teks pertanyaan. Field opsional dan
     * di-server-inject oleh Chief Chat v3; LLM TIDAK pernah perlu mengisi
     * marker secara manual sehingga tool tetap schema-only dari sudut model.
     *
     * @see lib/agen-team/chief/markers
     */
    kind: ChiefMarkerSchema.optional(),
    /**
     * Requirement 4.6 — UUID v4 yang mengikat overlay payload ke baris
     * `chief_confirmation_idempotency` tertentu sehingga setiap jawaban
     * konfirmasi/koreksi/cancel dapat dirutekan ke snapshot pendingConfirmation
     * yang benar (idempotent enqueue). Hanya diisi oleh Scope_Router saat
     * meng-emit Confirm_Card_Rich, CountdownCard, atau Wizard_Card hasil
     * koreksi.
     */
    pendingConfirmationId: z.string().uuid().optional(),
    /**
     * Requirement 3.3 — Bila `true` (default), Interactive_Overlay merender
     * input free-text di bawah opsi sehingga user dapat mengetik jawaban
     * sendiri ketika opsi tidak cocok. Diset `false` hanya untuk kartu yang
     * memang single-action (mis. CountdownCard cancel button).
     */
    allowFreeText: z.boolean().optional().default(true),
    /**
     * Requirement 3.3 — Placeholder untuk input free-text agar Chief dapat
     * memberi hint konteks slot (mis. `"Ketik topik yang ingin dibahas"`).
     * Hanya relevan saat `allowFreeText` aktif.
     */
    freeTextPlaceholder: z.string().optional(),
  }),
});
