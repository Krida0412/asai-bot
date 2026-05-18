# Implementation Plan: Agentic Chief v3

## Overview

Berikut adalah pembagian tugas inkremental untuk men-deliver gate deterministik `briefMaturity` (0..5), wizard cerdas dengan free-text, cancellation window 30 detik, idempotent enqueue, advisory notes, dan deprecation jalur legacy untuk Chief Chat (Pak Arga) v3. Setiap tugas men-build di atas tugas sebelumnya dan diakhiri dengan integrasi end-to-end. Property tests dipetakan ke 14 correctness properties di design (validasi requirement spesifik tercantum di tiap sub-task).

Convention: TypeScript + `zod` + Vitest (`*.test.ts(x)` co-located) + Playwright E2E (`tests/`). `fast-check` ditambahkan ke `devDependencies` saja sesuai justifikasi NFR5 di design.

## Tasks

- [x] 1. Set up Brief_Ledger schemas, marker registry, and DB tables
  - [x] 1.1 Create zod schemas for Brief_Ledger v3, PendingConfirmation, PendingTaskExecution, AdvisoryNote
    - Buat file `src/lib/agen-team/chief/schemas.ts` berisi `SupportedPlatformSchema`, `ActivePlatformSchema`, `SupportedFormatSchema`, `VisualSourceSchema`, `UserIntentSchema`, `ConfidenceSchema`, `BriefMaturitySchema`, `PendingConfirmationSchema`, `PendingTaskExecutionSchema`, `AdvisoryNoteSchema`, `BriefLedgerSchema`
    - Turunkan tipe TS via `z.infer`; pastikan `pendingConfirmation.intentType/output/publish` literal types
    - Hapus field `unsupportedFormat` v2; pastikan `format` enum hanya `instagram_feed_photo_caption` dan `instagram_carousel_photo`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.10, NFR4_

  - [ ]* 1.2 Write unit tests for Brief_Ledger zod schemas
    - 1 happy path + 5 negative (missing required, wrong enum, format outside whitelist, pendingConfirmation intentType non-default, advisoryNotes wrong shape)
    - File: `src/lib/agen-team/chief/schemas.test.ts`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7_

  - [x] 1.3 Create marker registry and marker schema
    - Buat `src/lib/agen-team/chief/markers.ts` berisi `Marker` union type, `ChiefMarkerSchema` zod enum, dan tabel mapping marker → efek (dokumentasi JSDoc)
    - Export `KNOWN_MARKERS` set untuk validasi runtime
    - _Requirements: 8.1, 8.5_

  - [x] 1.4 Add Drizzle schema for `chief_brief_ledger` and `chief_confirmation_idempotency`
    - Tambahkan kedua tabel di `src/lib/db/pg/schema.pg.ts`
    - `chief_brief_ledger`: `threadId` PK, `userId`, `ledger jsonb`, `updatedAt`
    - `chief_confirmation_idempotency`: `confirmationId` PK, `taskId`, `userId`, `threadId`, `snapshot jsonb`, `createdAt`, `cancelledAt`, `enqueuedAt`
    - Generate migration via `pnpm db:migrate` workflow
    - _Requirements: 6.2, 7.6_

  - [x] 1.5 Create persistence helpers for ledger and idempotency rows
    - Buat `src/lib/agen-team/chief/persistence.ts` dengan `loadLedger`, `saveLedger`, `upsertConfirmationRow`, `markConfirmationCancelled`, `markConfirmationEnqueued`, `loadConfirmationRow`, `loadPendingConfirmationSnapshot`
    - Gunakan transaksi `BEGIN; SELECT ... FOR UPDATE; INSERT/UPDATE` untuk mark-cancelled dan mark-enqueued
    - _Requirements: 6.1, 6.2, 6.3, 6.8, 7.1, 7.2, 7.3, 7.5_

  - [ ]* 1.6 Write unit tests for persistence helpers
    - Test happy path upsert, idempotent cancel/enqueue, FOR UPDATE lock semantics dengan Postgres test container
    - File: `src/lib/agen-team/chief/persistence.test.ts`
    - _Requirements: 6.1, 6.2, 7.5_

- [x] 2. Implement Slot_Detector with layered heuristics
  - [x] 2.1 Implement `detectSlotsFromFreeText` layered pipeline
    - File baru: `src/lib/agen-team/chief/slot-detector.ts`
    - Layer 1 keyword whitelist berdasarkan slot context (`marker`)
    - Layer 2 normalisasi (lowercase, strip emoji, fuzzy sinonim untuk `carousel`/`feed`/`edukasi`/`promo`/dll.)
    - Layer 3 LLM fallback hanya bila confidence < threshold; LLM hanya boleh return JSON slot, bukan keputusan gate
    - Return `{ slot: keyof BriefLedger | null, value, confidence }`
    - _Requirements: 3.7, 3.9, 9.6, NFR3_

  - [ ]* 2.2 Write property test for Slot_Detector layered determinism
    - **Property 5: Slot_Detector layered determinism**
    - **Validates: Requirements 3.7, 3.9, 9.6**
    - File: `src/lib/agen-team/chief/slot-detector.property.test.ts`
    - Mock LLM, hitung jumlah fallback call; assert layer 1+2 deterministik untuk input identik dan layer 3 hanya dipanggil saat low-confidence

  - [ ]* 2.3 Write unit tests for Slot_Detector edge cases
    - Free-text dengan emoji, mixed-case, Bahasa Indonesia gaul (`gw`, `lu`, `bro`), string panjang (>1000 char), string kosong
    - Test free-text `"kayaknya gw mau yg lebih edukatif tapi gak boring"` → `goal = "edukasi"` + `constraints` includes `"tidak membosankan"`
    - File: `src/lib/agen-team/chief/slot-detector.test.ts`
    - _Requirements: 15.18_

- [x] 3. Refactor Scope_Router with `briefMaturity` gate
  - [x] 3.1 Implement `briefMaturity` computation and finalize state
    - Refactor `src/lib/agen-team/chief/scope-router.ts` `finalizeState` untuk menghitung `briefMaturity` 0..5 deterministik berdasarkan tabel level di design
    - Helper-flag (`readyForConfirmation`, `confirmed`, dll.) tetap dihitung tapi hanya untuk membentuk maturity, bukan switch utama
    - Tambah default level 0 saat state inkonsisten
    - _Requirements: 1.8, 1.9, 2.1, 2.8, 2.9_

  - [x] 3.2 Implement `resolveChiefIntakeDecision` with maturity-driven switch
    - Switch utama `state.briefMaturity` mengembalikan salah satu `IntakeDecision` variant: `ask_user_input` | `director_text` | `open_cancellation_window` | `cancel_window_acknowledged` | `ready_for_story`
    - Hapus decision lama `create_task` dari Scope_Router
    - Inject `newConfirmationId: () => string` untuk testability
    - _Requirements: 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8_

  - [ ]* 3.3 Write property test for gate semantics determined by `briefMaturity`
    - **Property 1: Gate semantics ditentukan sepenuhnya oleh briefMaturity**
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 3.2, 4.10, 5.3, 5.5, 10.5, 12.4**
    - File: `src/lib/agen-team/chief/scope-router.property.test.ts`
    - Use `arbBriefLedgerAtLevel(level)` × {0..5}; assert decision.type sesuai tabel

  - [x] 3.4 Implement marker-based dispatch in Scope_Router
    - Identifikasi konfirmasi via `marker` + `pendingConfirmationId`, BUKAN regex teks pertanyaan
    - Marker tidak dikenal → fall through ke jalur free-text biasa
    - Hapus semua regex `/konfirmasi (brief|publish|upload)/i` dari kode lama
    - _Requirements: 8.1, 8.3, 8.4, 8.5_

  - [ ]* 3.5 Write property test for marker-based dispatch
    - **Property 6: Dispatch berbasis marker, bukan teks pertanyaan**
    - **Validates: Requirements 4.6, 8.1, 8.3, 8.4, 8.5**
    - File: `src/lib/agen-team/chief/scope-router.property.test.ts` (same suite, separate `describe`)
    - Vary `questionText` dengan `(marker, pendingConfirmationId)` sama; assert jalur identik

  - [x] 3.6 Implement slot preservation invariant in update path
    - Setiap update slot via Slot_Detector / wizard tool_answer / correction tidak boleh menghilangkan slot lain yang sudah valid
    - Refactor `updateLedger` helper agar merge per-slot, bukan replace
    - _Requirements: 1.9, 3.8, 9.1, 9.4, 10.3_

  - [ ]* 3.7 Write property test for slot preservation
    - **Property 4: Slot preservation di bawah update apapun**
    - **Validates: Requirements 1.9, 3.8, 9.1, 9.4, 10.3**
    - File: `src/lib/agen-team/chief/scope-router.property.test.ts` (separate `describe`)
    - Generate random updates targeting one slot; assert all `S' ≠ S` preserved

  - [x] 3.8 Implement topic capture deterministic transitions
    - Pesan eksploratif (`tentang ...` + uncertainty marker `gatau`/`kepikiran`/`cuma`) hanya update `topicCandidate`, bukan `confirmedTopic`
    - Pesan perintah eksplisit (`bikin (carousel|feed|post|konten) ... tentang X`) langsung set `confirmedTopic = X`
    - `topicCandidate` ada tapi `confirmedTopic` null → decision tidak boleh `confirm_brief`
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

  - [ ]* 3.9 Write property test for topic capture transitions
    - **Property 12: Topic capture deterministic transitions**
    - **Validates: Requirements 10.1, 10.2, 10.4, 10.5**
    - File: `src/lib/agen-team/chief/topic-capture.property.test.ts`

- [x] 4. Checkpoint - Ensure all tests pass
  - Jalankan `pnpm test` dan `pnpm tsc --noEmit`. Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement Confirm_Card_Rich and Wizard_Card emission
  - [x] 5.1 Implement Wizard_Card payload builder with slot skipping
    - Helper `buildWizardCardPayload(ledger)` di scope-router yang membaca ledger dan hanya buat pertanyaan untuk slot belum valid
    - Selalu set `allowFreeText: true`, `kind: "wizard_<slot>"`, `questions.length ≤ 3`, `options.length ≤ 4`
    - Sertakan `message` ringkasan slot yang sudah Chief simpulkan dari ledger
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.10_

  - [ ]* 5.2 Write property test for Wizard_Card invariants
    - **Property 8: Invarian payload Wizard_Card**
    - **Validates: Requirements 3.1, 3.3, 3.4, 3.10**
    - File: `src/lib/agen-team/chief/wizard-card.property.test.ts`

  - [x] 5.3 Implement Confirm_Card_Rich payload builder
    - Helper `buildConfirmCardRichPayload(ledger, confirmationId)` di scope-router
    - Header `"Rencana publish Instagram"`; ringkasan: topik, goal, format, sumber visual, platform, output target = `"Auto-publish ke Instagram"`, estimasi waktu eksekusi
    - 3 tombol exact: `"Konfirmasi & mulai publish"`, `"Ubah dulu"`, `"Batal"`
    - Helper text menjelaskan window 30 detik
    - Marker `kind = "confirm_brief"` + `pendingConfirmationId` di payload
    - Hanya dirender saat `briefMaturity = 3`
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.10_

  - [ ]* 5.4 Write property test for Confirm_Card_Rich invariants
    - **Property 7: Invarian payload Confirm_Card_Rich**
    - **Validates: Requirements 4.2, 4.3, 4.4, 4.5, 4.6, 8.2**
    - File: `src/lib/agen-team/chief/confirm-card.property.test.ts`

  - [x] 5.5 Snapshot pendingConfirmation with stable confirmationId
    - Saat masuk Level 3, persist snapshot lengkap `taskInput` ke `chief_confirmation_idempotency` sebelum kartu dirender ke UI
    - `confirmationId` UUID v4 yang dipersist sebelum dikirim ke klien
    - Saat eksekusi window habis, baca snapshot, jangan rebuild dari state
    - _Requirements: 7.1, 7.2, 7.3, 7.5, 7.6_

  - [ ]* 5.6 Write property test for payload freeze
    - **Property 3: Payload freeze dari pendingConfirmation**
    - **Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5, 7.6**
    - File: `src/lib/agen-team/chief/payload-freeze.property.test.ts`
    - Mutate ledger during simulated window; assert payload sent ke enqueueAgenTeamTask deep-equal snapshot

- [x] 6. Implement correction handling and advisory notes
  - [x] 6.1 Implement correction marker handling
    - Tombol `"Ubah dulu"` (marker `correction`): jaga slot valid, drop pendingConfirmation only, kirim director_text yang menanyakan bagian mana yang ingin diubah
    - Free-text correction saat `briefMaturity = 3`: parse via Slot_Detector, update ledger, drop pendingConfirmation lama, generate `confirmationId` baru, render Confirm_Card_Rich baru
    - Mark `cancelled_at` row idempotency lama sebelum `c_new` diemisikan
    - JANGAN over-eager pada kata `"bukan"`/`"jangan"`/`"salah"`/`"ubah"` di luar konteks Confirm_Card_Rich aktif
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.6_

  - [ ]* 6.2 Write property test for correction ID rotation
    - **Property 13: Correction ID rotation**
    - **Validates: Requirements 9.5**
    - File: `src/lib/agen-team/chief/correction-id-rotation.property.test.ts`
    - Replay confirm + correct; assert `c_new ≠ c_old` and `tasks_enqueued(c_old) = 0`

  - [x] 6.3 Implement advisory note detection (goal-format conflict, platform-topic mismatch)
    - Tambah `detectAdvisoryNotes(ledger): AdvisoryNote[]` ke scope-router
    - Konflik `goal = "engagement"` + `format = "instagram_feed_photo_caption"` → suggestion ke Carousel
    - Topik real-time vs Instagram → suggestion adaptasi
    - Append ke `ledger.advisoryNotes`
    - _Requirements: 11.1, 11.2, 11.8_

  - [x] 6.4 Implement advisory marker handling (advisory_continue, advisory_change)
    - `advisory_continue` → render Confirm_Card_Rich
    - `advisory_change` → open Wizard_Card untuk slot konflik dengan opsi alternatif yang Chief sarankan
    - Advisory tidak memblokir tombol konfirmasi di Confirm_Card_Rich
    - _Requirements: 11.3, 11.4, 11.5, 11.6, 11.7_

  - [ ]* 6.5 Write property test for advisory non-blocking semantics
    - **Property 10: Advisory tidak memblokir confirmation**
    - **Validates: Requirements 11.1, 11.2, 11.5, 11.6, 11.7**
    - File: `src/lib/agen-team/chief/advisory.property.test.ts`

  - [x] 6.6 Implement honest unsupported platform handling
    - Deteksi request YouTube/TikTok/LinkedIn/Blog/Threads → director_text dengan minimal satu hint adaptasi konkret ke Instagram (mis. "thread Twitter" → "Carousel Instagram")
    - Tidak emit `confirm_brief` untuk request tersebut
    - Limitations_Card boleh dirender hanya bila request berulang
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5_

  - [ ]* 6.7 Write property test for honest unsupported platform handling
    - **Property 11: Honest unsupported platform handling**
    - **Validates: Requirements 12.1, 12.3, 12.4, 12.5**
    - File: `src/lib/agen-team/chief/platform-limit.property.test.ts`

- [x] 7. Implement idempotent enqueue and Inngest cancellation handler
  - [x] 7.1 Refactor `enqueueAgenTeamTask` to use confirmationId as task_id
    - Update `src/lib/agen-team/create-task.ts`: `payload.task_id` HARUS sama dengan `confirmationId`
    - Bungkus SELECT-then-INSERT dalam transaksi `BEGIN; SELECT ... FOR UPDATE; INSERT;`
    - Update `mapChiefToolInputToRunTaskPayload` untuk menerima `confirmationId` opsional
    - Pemanggilan ulang dengan `confirmationId` sama → return referensi task lama tanpa create baru
    - _Requirements: 6.1, 6.2, 6.3, 6.8, NFR2_

  - [x] 7.2 Implement Inngest function `chiefExecuteConfirmation`
    - Tambah ke `src/lib/inngest/functions.ts`
    - `concurrency: { key: "event.data.confirmationId", limit: 1 }`
    - Steps: `sleepUntil(scheduledExecuteAt)` → `loadConfirmationRow` → check cancelled/enqueued → `loadPendingConfirmationSnapshot` → `enqueueAgenTeamTask` → `markConfirmationEnqueued` → `publishReadyForStory`
    - Return early dengan `skipped: cancelled | already_enqueued | missing_pending`
    - _Requirements: 5.4, 5.7, 5.8, 5.11, 6.3, 6.4, 6.5, 6.6, 6.7_

  - [ ]* 7.3 Write property test for idempotency on confirmationId
    - **Property 2: Idempotency enqueue terhadap confirmationId**
    - **Validates: Requirements 5.7, 5.8, 5.11, 5.12, 6.1, 6.3, 6.4, 6.5, 6.6, 6.8, 13.1**
    - File: `src/lib/agen-team/chief/inngest-handler.property.test.ts`
    - Use `arbEventSequence` + Postgres test container; assert `|tasks_enqueued(c)| ∈ {0, 1}` dan kondisi membentuk count = 1

- [x] 8. Implement chief-chat endpoint dispatch and supporting endpoints
  - [x] 8.1 Refactor `POST /api/agen-team/chief-chat` dispatch on IntakeDecision
    - File: `src/app/api/agen-team/chief-chat/route.ts`
    - Hapus enqueue inline; switch `decision.type` ke handler `emitText`/`emitAskUserInput`/`emitCancellationWindow`/`emitCreateTaskOutput`
    - `open_cancellation_window` → `persistPendingTaskExecution` + `inngest.send("agen-team/chief.execute-confirmation")` dengan `scheduled_utc = scheduledExecuteAt`
    - `ready_for_story` → emit `createAgenTeamTask` tool output dengan `readyForStory: true`
    - _Requirements: 5.1, 5.2, 5.4, 5.5, 13.1, 13.2_

  - [x] 8.2 Add `POST /api/agen-team/chief-chat/cancel` endpoint
    - Body: `{ confirmationId: string }`
    - Auth: session user pemilik thread
    - `UPDATE chief_confirmation_idempotency SET cancelled_at = now() WHERE confirmation_id = $1 AND enqueued_at IS NULL`
    - Response: `{ ok: true, status: "cancelled" | "already_enqueued" | "already_cancelled" }`
    - _Requirements: 5.6, 5.7, 6.1_

  - [x] 8.3 Add `GET /api/agen-team/chief-chat/confirmation-status` endpoint
    - Query: `?confirmationId=...`
    - Response: `{ status: "armed" | "cancelled" | "enqueued", taskId? }`
    - Klien polling saat countdown lokal mencapai 0 untuk deteksi `readyForStory`
    - _Requirements: 5.10, 13.5_

  - [x] 8.4 Implement error event emission for enqueue failure
    - Emit `createAgenTeamTask` tool output dengan `readyForStory: false` dan `status: "error" | "rate_limited"` saat Inngest handler gagal non-retryable
    - _Requirements: 13.6_

  - [ ]* 8.5 Write property test for no-bypass (all tasks traceable to Scope_Router v3)
    - **Property 9: No-bypass — semua task traceable ke Scope_Router v3**
    - **Validates: Requirements 6.7, 14.4, 14.5, 14.7**
    - File: `src/lib/agen-team/chief/no-bypass.integration.test.ts`
    - Seed `AgentTaskTable`, cross-check `task_id` ada di `chief_confirmation_idempotency`

- [x] 9. Update askUserInput tool schema and add cancellation window tool
  - [x] 9.1 Extend `askUserInputTool` inputSchema with v3 fields
    - File: `src/lib/ai/tools/interactive-input.ts`
    - Tambah optional `kind: ChiefMarkerSchema`, `pendingConfirmationId: z.string().uuid()`, `allowFreeText: z.boolean().default(true)`, `freeTextPlaceholder: z.string()`
    - Tool tetap schema-only (LLM tidak perlu tahu marker)
    - _Requirements: 3.3, 4.6, 8.1, 8.2_

  - [x] 9.2 Add `agenTeamCancellationWindow` tool registration
    - Tool baru schema-only di registry untuk konsistensi tipe
    - Output schema: `{ confirmationId, scheduledExecuteAt, durationSeconds: 30, status: "armed" | "cancelled" | "enqueued" }`
    - _Requirements: 5.3, 13.4_

- [x] 10. Refactor Interactive_Overlay UI
  - [x] 10.1 Add free-text input rendering for wizard/confirm/correction kinds
    - File: `src/components/interactive-overlay.tsx`
    - Bila `kind ∈ {"confirm_brief", "wizard_*", "correction"}` → render free-text input di bawah opsi
    - Submit free-text → `tool_answer` dengan `answer = string apa adanya`, `marker = kind`, `pendingConfirmationId` (jika ada)
    - Hanya aktif untuk mode `agen-team-chief`; mode lain TIDAK terpengaruh
    - _Requirements: 3.3, 3.5, 3.6, 4.5, 4.7, 4.8, 4.9, NFR6_

  - [x] 10.2 Render countdown card for `agenTeamCancellationWindow` tool output
    - Komponen baru `CountdownCard` di-render saat tool output `agenTeamCancellationWindow` dengan `status: "armed"`
    - Progress bar + hitungan mundur per detik dari `scheduledExecuteAt - now`
    - Label `"Membatalkan dalam X detik akan menghentikan publish"`
    - Tombol `"Batalkan publish"` → POST `/api/agen-team/chief-chat/cancel`
    - Update minimal sekali per detik tanpa polling backend berat
    - _Requirements: 5.3, 5.6, 5.9, NFR8_

  - [x] 10.3 Render Limitations_Card / Advisory_Card
    - Saat `kind ∈ {"advisory_continue", "advisory_change"}` → render Limitations_Card dengan ikon info, judul, body, dan dua tombol `"Mengerti, lanjut"` / `"Ganti pendekatan"`
    - _Requirements: 11.3, 11.4, 12.5_

  - [ ]* 10.4 Write snapshot tests for Confirm_Card_Rich, Wizard_Card, CountdownCard, Limitations_Card
    - File: `src/components/interactive-overlay.test.tsx`
    - Vitest + React Testing Library; verify free-text input visible, tombol exact, progress bar update, label countdown
    - _Requirements: 3.3, 4.2, 4.3, 5.3, 5.9, 11.4_

- [ ] 11. Refactor chat-bot mode `agen-team-chief` for new tool outputs
  - [x] 11.1 Tunda pembukaan StoryMode hingga `readyForStory: true`
    - File: `src/components/chat-bot.tsx` (mode `agen-team-chief`)
    - Saat tool output `agenTeamCancellationWindow` masuk → buka CountdownCard, JANGAN panggil `onAgenTeamTaskCreated`
    - Saat tool output `createAgenTeamTask` dengan `readyForStory: true` → tutup CountdownCard, panggil `onAgenTeamTaskCreated(taskId)`
    - Saat tool output `createAgenTeamTask` dengan `readyForStory: false` → tampilkan kartu error retry/batal, JANGAN buka StoryMode
    - _Requirements: 5.5, 5.10, 13.1, 13.2, 13.3, 13.4, 13.5, 13.6_

  - [-] 11.2 Wire client polling for confirmation-status when local countdown reaches 0
    - Saat countdown lokal habis, `fetch GET /api/agen-team/chief-chat/confirmation-status?confirmationId=...`
    - Bila `status === "enqueued"` → tutup CountdownCard, buka StoryMode dengan `taskId`
    - Bila `status === "cancelled"` atau `"armed"` (still pending) → tampilkan state sesuai
    - _Requirements: 5.10, 13.5_

- [ ] 12. Deprecate legacy code paths
  - [-] 12.1 Add 410 Gone for legacy `chief_message` and `run_task` actions
    - File: `src/app/api/agen-team/route.ts`
    - Bila `action ∈ {"chief_message", "run_task"}` dan env `AGEN_TEAM_LEGACY_API_ENABLED !== "true"` → log warning `"legacy chief router called without flag"` + return 410 Gone
    - JANGAN ubah action lain di endpoint ini
    - _Requirements: 14.1, 14.2, 14.3, 14.6, NFR6_

  - [ ] 12.2 Remove imports of `ChiefChat.tsx` and `chief-router.ts` from active routes
    - Cari dan hapus `import` dari `src/app/` ke `src/components/agen-team/ChiefChat.tsx` dan `src/lib/agen-team/agents/chief-router.ts`
    - Tambah JSDoc `@deprecated` banner di kedua file dan re-export error stub di luar dev flag
    - File tetap ada (Out of Scope item 1)
    - _Requirements: 14.4, 14.5_

  - [ ]* 12.3 Write smoke tests for no-regex and legacy-imports
    - **Property 14: No regex on question text**
    - **Validates: Requirements 8.4**
    - File: `src/lib/agen-team/chief/no-regex.smoke.test.ts` — grep `/konfirmasi (brief|publish|upload)/i` tidak boleh muncul di scope-router/route/interactive-overlay
    - File: `src/lib/agen-team/chief/legacy-imports.smoke.test.ts` — grep `ChiefChat` dan `chief-router` tidak boleh diimport dari `src/app/`
    - _Requirements: 8.4, 14.4, 14.5_

- [~] 13. Checkpoint - Ensure all tests pass
  - Jalankan `pnpm test`, `pnpm tsc --noEmit`, `pnpm lint`. Ensure all tests pass, ask the user if questions arise.

- [ ] 14. End-to-end integration scenarios
  - [~] 14.1 Add `fast-check` to devDependencies and configure global seed
    - `pnpm add -D fast-check`
    - Tambah `fc.configureGlobal({ seed: 42, numRuns: 100 })` di `vitest.setup.ts` (atau setup file existing)
    - Buat `src/lib/agen-team/chief/__test__/arbs.ts` dengan `arbBriefLedger`, `arbBriefLedgerAtLevel`, `arbToolAnswer`, `arbUserText`, `arbEventSequence`
    - _Requirements: NFR5_

  - [~] 14.2 Wire scope-router, persistence, endpoint, and Inngest end-to-end
    - Pastikan `reconstructChiefIntakeState(messages)` membaca persistedLedger via `loadLedger`
    - Pastikan endpoint memanggil `saveLedger` setelah setiap decision
    - Pastikan Inngest handler memanggil `publishReadyForStory` lewat jalur stream/realtime atau row update yang dipoll oleh status endpoint
    - _Requirements: 1.8, 5.4, 5.5, 5.10, 13.1, 13.5_

  - [ ]* 14.3 Write Playwright E2E spec files for Requirement 15 scenarios (one file per scenario)
    - Folder: `tests/agen-team/chief-v3/`
    - `15.01-vague-intent.spec.ts` ... `15.20-capability-question.spec.ts`
    - Helper `tests/agen-team/chief-v3/helpers.ts` dengan stub Inngest dev server dan akselerasi waktu (mock `Date`) untuk fast-forward window 30 detik
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.6, 15.7, 15.8, 15.9, 15.10, 15.11, 15.12, 15.13, 15.14, 15.15, 15.16, 15.17, 15.18, 15.19, 15.20_

- [~] 15. Final checkpoint - Ensure all tests pass
  - Jalankan `pnpm check` (lint + types + tests). Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` adalah optional dan dapat diskip untuk MVP cepat. Inti gate determinisme, idempotensi, dan cancellation window tetap berfungsi tanpa property tests, tetapi ke-14 properties di design HARUS divalidasi sebelum release supaya gate v3 benar-benar deterministik.
- Setiap task referensi requirements spesifik untuk traceability.
- Checkpoints (tasks 4, 13, 15) memastikan validasi inkremental.
- Property tests memvalidasi correctness properties universal (Property 1–14 di design).
- Unit tests memvalidasi contoh spesifik dan edge cases.
- Persistence (task 1.5) digunakan oleh scope-router (task 3.x) dan Inngest handler (task 7.2); urutan wave menjamin file dependency.
- File `src/lib/agen-team/chief/scope-router.ts` ditulis oleh task 3.1, 3.2, 3.4, 3.6, 3.8, 6.1, 6.3, 6.4, 6.6 — semuanya ditempatkan di wave berbeda untuk hindari konflik.
- File `src/components/interactive-overlay.tsx` ditulis oleh task 10.1, 10.2, 10.3 — wave berbeda.
- File `src/app/api/agen-team/chief-chat/route.ts` ditulis oleh task 8.1, 8.4 — wave berbeda.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.3", "1.4"] },
    { "id": 1, "tasks": ["1.2", "1.5", "2.1", "9.1", "9.2"] },
    { "id": 2, "tasks": ["1.6", "2.2", "2.3", "3.1"] },
    { "id": 3, "tasks": ["3.2", "10.1"] },
    { "id": 4, "tasks": ["3.3", "3.4", "10.2"] },
    { "id": 5, "tasks": ["3.5", "3.6", "10.3"] },
    { "id": 6, "tasks": ["3.7", "3.8", "10.4"] },
    { "id": 7, "tasks": ["3.9", "5.1", "7.1"] },
    { "id": 8, "tasks": ["5.2", "5.3", "7.2"] },
    { "id": 9, "tasks": ["5.4", "5.5", "7.3"] },
    { "id": 10, "tasks": ["5.6", "6.1", "8.1"] },
    { "id": 11, "tasks": ["6.2", "6.3", "8.2", "8.3"] },
    { "id": 12, "tasks": ["6.4", "8.4", "11.1"] },
    { "id": 13, "tasks": ["6.5", "6.6", "8.5", "11.2"] },
    { "id": 14, "tasks": ["6.7", "12.1", "12.2"] },
    { "id": 15, "tasks": ["12.3", "14.1"] },
    { "id": 16, "tasks": ["14.2"] },
    { "id": 17, "tasks": ["14.3"] }
  ]
}
```
