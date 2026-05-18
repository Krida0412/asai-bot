import { z } from "zod";

/**
 * Brief Ledger v3 schemas — single source of truth untuk Chief Chat (Pak Arga) v3.
 *
 * Skema ini mendefinisikan kontrak data untuk:
 * - `Brief_Ledger`: state per-thread yang menggerakkan keputusan deterministik Scope_Router.
 * - `pendingConfirmation`: snapshot payload createAgenTeamTask dengan kontrak auto-publish default.
 * - `pendingTaskExecution`: window pembatalan 30 detik antara konfirmasi user dan enqueue task.
 * - `advisoryNotes`: catatan opini/push-back saat scope-router mendeteksi konflik antar slot.
 *
 * Tipe TypeScript diturunkan via `z.infer` agar single source of truth tetap di skema.
 */

// ---------------------------------------------------------------------------
// Platform & format
// ---------------------------------------------------------------------------

/**
 * Platform yang dapat ditampung oleh tipe ledger. Hanya `"instagram"` yang aktif
 * untuk publish; nilai `"twitter"` dipertahankan sebagai type-only untuk
 * kompatibilitas dan ditandai deprecated untuk jalur publish.
 *
 * @see Requirement 1.3
 */
export const SupportedPlatformSchema = z
  .enum(["instagram", "twitter"])
  .describe("twitter is type-only, deprecated for publish");

/**
 * Platform aktif untuk auto-publish default. Selalu `"instagram"`.
 *
 * @see Requirement 1.3, 1.7
 */
export const ActivePlatformSchema = z.literal("instagram");

/**
 * Format Instagram aktif yang dapat dipublikasikan.
 *
 * v3 hanya mengizinkan dua format ini; format lain (Reels, Story, Twitter) v2
 * dihapus dari ledger karena tidak ada jalur publish yang men-support-nya.
 *
 * @see Requirement 1.4
 */
export const SupportedFormatSchema = z.enum([
  "instagram_feed_photo_caption",
  "instagram_carousel_photo",
]);

/**
 * Sumber asset visual untuk konten yang akan dipublikasikan.
 *
 * @see Requirement 1.5
 */
export const VisualSourceSchema = z.enum([
  "internet_reference",
  "user_owned_asset",
]);

// ---------------------------------------------------------------------------
// Intent & confidence
// ---------------------------------------------------------------------------

/**
 * Klasifikasi intent user di pesan terkini, hasil deteksi Scope_Router.
 *
 * @see Requirement 1.2
 */
export const UserIntentSchema = z.enum([
  "content_creation_interest",
  "publish_request",
  "casual_chat",
  "question",
  "out_of_scope",
  "other",
]);

/**
 * Tingkat keyakinan agregat ledger terhadap brief saat ini.
 *
 * @see Requirement 1.6
 */
export const ConfidenceSchema = z.enum(["low", "medium", "high"]);

/**
 * Brief maturity 0..5 — gate utama keputusan Scope_Router.
 *
 * - 0: vague intent / casual chat / out-of-scope.
 * - 1: preferensi terisi sebagian (platform atau format), topik belum ada.
 * - 2: topicCandidate ada, slot wajib lain belum lengkap.
 * - 3: task-ready (platform + format + confirmedTopic + goal + visualSource).
 * - 4: pendingTaskExecution aktif, cancellation window berjalan.
 * - 5: task berhasil di-enqueue, StoryMode siap dibuka.
 *
 * @see Requirement 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7
 */
export const BriefMaturitySchema = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
]);

// ---------------------------------------------------------------------------
// createAgenTeamTask payload schema (mirrors the AI SDK tool inputSchema)
// ---------------------------------------------------------------------------

/**
 * Skema input untuk tool `createAgenTeamTask`.
 *
 * Menyamai `inputSchema` di `src/lib/ai/tools/create-agen-team-task.ts` agar
 * `pendingConfirmation.taskInput` dapat di-snapshot tanpa import siklik dari
 * file tool. Nilai field `intentType` mengikuti enum tool yang lebih luas
 * (sembari `pendingConfirmation.intentType` sendiri di-narrow ke
 * `"full_auto_publish"`).
 */
export const CreateAgenTeamTaskInputSchema = z.object({
  intentType: z.enum([
    "research_only",
    "research_and_draft_content",
    "full_auto_publish",
    "ask_operations_cost",
    "find_photo_only",
    "continue_from_memory",
    "schedule_content",
    "cancel_task",
  ]),
  topic: z.string(),
  brief: z.string().optional(),
  platform: z.string().optional(),
  outputFormat: z.string().optional(),
  requirements: z.array(z.string()).optional(),
  maxSources: z.number().optional(),
  needsPhoto: z.boolean().optional(),
});

// ---------------------------------------------------------------------------
// pendingConfirmation
// ---------------------------------------------------------------------------

/**
 * Snapshot brief yang dipersiapkan untuk Confirm_Card_Rich. Isi `taskInput`
 * dibekukan saat user menekan tombol konfirmasi (payload freeze) — apa yang
 * dilihat user di kartu konfirmasi adalah persis apa yang akan dikirim ke
 * `enqueueAgenTeamTask` setelah cancellation window habis.
 *
 * Kontrak auto-publish v3 di-narrow lewat literal types: `intentType`,
 * `output`, dan `publish` tidak boleh berbeda dari nilai default auto-publish.
 *
 * @see Requirement 1.7, 7.1, 7.2, 7.3, 7.4, 7.6
 */
export const PendingConfirmationSchema = z.object({
  confirmationId: z.string().uuid(),
  topic: z.string().min(1),
  platform: ActivePlatformSchema.default("instagram"),
  format: SupportedFormatSchema,
  goal: z.string().min(1),
  audience: z.string().nullable(),
  visualSource: VisualSourceSchema,
  intentType: z.literal("full_auto_publish"),
  output: z.literal("publish_to_instagram"),
  publish: z.literal(true),
  taskInput: CreateAgenTeamTaskInputSchema,
  createdAt: z.string().datetime(),
});

// ---------------------------------------------------------------------------
// pendingTaskExecution
// ---------------------------------------------------------------------------

/**
 * Status kegagalan eksekusi pendingTaskExecution.
 *
 * - `"error"`: kegagalan non-retryable umum (mis. Postgres invariant violation,
 *   skema payload korup, schema validation gagal).
 * - `"rate_limited"`: pengguna sudah melebihi batas task running konkuren saat
 *   `enqueueAgenTeamTask` di-fire — UI menampilkan opsi retry / batal kepada user.
 *
 * @see Requirement 13.6
 */
export const PendingTaskFailureStatusSchema = z.enum(["error", "rate_limited"]);

/**
 * Representasi cancellation window 30 detik antara user menekan
 * "Konfirmasi & mulai publish" dan saat `enqueueAgenTeamTask` benar-benar
 * dipanggil.
 *
 * Selama `cancelled = false`, `enqueuedAt = null`, dan `failureStatus = null`,
 * klien menampilkan countdown card. Backend (Inngest) tidak boleh memanggil
 * enqueue sebelum `scheduledExecuteAt` tercapai dan harus skip enqueue bila
 * `cancelled = true`.
 *
 * `failureStatus` (v3 task 8.4): di-set oleh handler Inngest
 * `chiefExecuteConfirmation` saat `enqueueAgenTeamTask` gagal non-retryable
 * (atau mengembalikan `rate_limited`). Field ini menjadi sumber kebenaran
 * deterministik untuk emisi `createAgenTeamTask` tool output dengan
 * `readyForStory: false` dan `status: "error" | "rate_limited"` di
 * Scope_Router pada request berikutnya. `failedAt` adalah timestamp ISO saat
 * status di-set.
 *
 * @see Requirement 5.1, 5.2, 5.4, 5.6, 5.7, 5.8, 5.11, 13.6
 */
export const PendingTaskExecutionSchema = z.object({
  confirmationId: z.string().uuid(),
  scheduledExecuteAt: z.string().datetime(),
  cancelled: z.boolean(),
  cancelledAt: z.string().datetime().nullable(),
  enqueuedAt: z.string().datetime().nullable(),
  failureStatus: PendingTaskFailureStatusSchema.nullable().default(null),
  failedAt: z.string().datetime().nullable().default(null),
  failureMessage: z.string().nullable().default(null),
});

// ---------------------------------------------------------------------------
// advisoryNotes
// ---------------------------------------------------------------------------

/**
 * Catatan opini / push-back dari Chief saat scope-router mendeteksi konflik
 * antar slot (mis. goal vs format) atau ketidakcocokan platform-topic.
 *
 * Advisory note tidak memblokir konfirmasi — user tetap dapat memilih
 * "Konfirmasi & mulai publish" setelah membaca advisory.
 *
 * @see Requirement 11.1, 11.2, 11.5, 11.8
 */
export const AdvisoryNoteSchema = z.object({
  id: z.string(),
  kind: z.enum([
    "goal_format_conflict",
    "platform_topic_mismatch",
    "general",
  ]),
  title: z.string(),
  body: z.string(),
  suggestion: z
    .object({
      targetSlot: z.enum(["format", "goal", "visualSource", "platform"]),
      suggestedValue: z.string(),
      reasoning: z.string(),
    })
    .optional(),
});

// ---------------------------------------------------------------------------
// Brief_Ledger
// ---------------------------------------------------------------------------

/**
 * State per-thread yang menyimpan slot brief yang sudah disimpulkan
 * Scope_Router dan menjadi single source of truth untuk semua keputusan
 * deterministik (render kartu, payload createAgenTeamTask, pesan natural).
 *
 * Catatan v3:
 * - Field `unsupportedFormat` v2 telah dihapus (Requirement 1.10). Logika
 *   format yang tidak didukung dipindah ke advisory notes + director_text.
 * - `format` enum hanya menerima dua format Instagram aktif.
 * - `pendingConfirmation`, `pendingTaskExecution`, dan `advisoryNotes` adalah
 *   field baru yang mendukung gate level 3..5 dan push-back.
 *
 * @see Requirement 1.1, 1.8, 1.9, 1.10, NFR4
 */
export const BriefLedgerSchema = z.object({
  userIntent: UserIntentSchema.optional(),
  platform: SupportedPlatformSchema.optional(),
  format: SupportedFormatSchema.optional(),
  topicCandidate: z.string().nullable().optional(),
  confirmedTopic: z.string().nullable().optional(),
  goal: z.string().nullable().optional(),
  audience: z.string().nullable().optional(),
  workflowPreference: z.string().nullable().optional(),
  visualSource: VisualSourceSchema.nullable().optional(),
  constraints: z.array(z.string()).default([]),
  openQuestions: z.array(z.string()).default([]),
  confidence: ConfidenceSchema.default("low"),
  briefMaturity: BriefMaturitySchema.default(0),
  pendingConfirmation: PendingConfirmationSchema.nullable().default(null),
  advisoryNotes: z.array(AdvisoryNoteSchema).default([]),
  pendingTaskExecution: PendingTaskExecutionSchema.nullable().default(null),
});

// ---------------------------------------------------------------------------
// Inferred TypeScript types
// ---------------------------------------------------------------------------

export type SupportedPlatform = z.infer<typeof SupportedPlatformSchema>;
export type ActivePlatform = z.infer<typeof ActivePlatformSchema>;
export type SupportedFormat = z.infer<typeof SupportedFormatSchema>;
export type VisualSource = z.infer<typeof VisualSourceSchema>;
export type UserIntent = z.infer<typeof UserIntentSchema>;
export type Confidence = z.infer<typeof ConfidenceSchema>;
export type BriefMaturity = z.infer<typeof BriefMaturitySchema>;
export type CreateAgenTeamTaskInput = z.infer<
  typeof CreateAgenTeamTaskInputSchema
>;
export type PendingConfirmation = z.infer<typeof PendingConfirmationSchema>;
export type PendingTaskExecution = z.infer<typeof PendingTaskExecutionSchema>;
export type PendingTaskFailureStatus = z.infer<
  typeof PendingTaskFailureStatusSchema
>;
export type AdvisoryNote = z.infer<typeof AdvisoryNoteSchema>;
export type BriefLedger = z.infer<typeof BriefLedgerSchema>;
