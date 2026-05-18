# Requirements Document

## Introduction

Dokumen ini mendefinisikan kebutuhan untuk **Chief Chat (Pak Arga) v3** — content strategist AI untuk Instagram di aplikasi Next.js/TypeScript. Chief mengambil briefing konten dari user lewat percakapan natural, lalu — setelah konfirmasi eksplisit dan jendela pembatalan 30 detik — secara otomatis mempublikasikan konten ke Instagram melalui pipeline LangGraph (writer → marketing_pre_publish → social_media → publish).

v3 fokus pada tiga perbaikan inti hasil audit v2:
1. **Determinisme gate.** `briefMaturity` (0..5) menjadi gate utama yang menggerakkan keputusan, bukan kombinasi flag yang ad-hoc, dan kontrak `pendingConfirmation` di scope-router dipersempit agar selaras dengan perilaku auto-publish (D4).
2. **Wizard cerdas + free-text.** Kartu wizard tetap dipakai untuk mengarahkan user yang menjawab "terserah", tetapi melewati slot yang sudah jelas, menerima jawaban free-text di samping tombol, dan mem-parse-nya kembali ke ledger lewat heuristics berlapis.
3. **Cancellation window 30 detik.** Penekanan tombol "Konfirmasi" tidak langsung memasukkan task ke queue; UI menampilkan countdown dan tombol "Batalkan publish" selama 30 detik. Task baru di-enqueue setelah window habis, sekali saja (idempotent), dan StoryMode hanya terbuka setelahnya.

Dokumen ini juga mengatur Chief untuk jujur soal limitasi platform (hanya Instagram aktif), mendorong Chief memberi opini / push-back saat brief berkonflik, dan menghapus jalur kode legacy yang masih dapat melewati gate deterministik.

## Glossary

- **Chief / Pak Arga**: Persona AI content strategist yang mengoperasikan briefing dan publish ke Instagram.
- **Scope_Router**: State machine deterministik intake yang berada di `src/lib/agen-team/chief/scope-router.ts`. Menggerakkan klasifikasi intent, slot detection, brief maturity, dan keputusan render kartu vs natural text.
- **Chief_Chat_Endpoint**: Streaming API `src/app/api/agen-team/chief-chat/route.ts` yang menerima pesan user dan menghasilkan event UI.
- **Chat_Bot_UI**: Komponen `src/components/chat-bot.tsx` mode `agen-team-chief` yang menerima event streaming dan membuka StoryMode saat task berhasil dibuat.
- **Interactive_Overlay**: Komponen `src/components/interactive-overlay.tsx` yang merender kartu `askUserInput` (target overhaul UI v3).
- **askUserInput**: AI SDK tool di `src/lib/ai/tools/interactive-input.ts`. Maksimum 3 pertanyaan dan 4 opsi per kartu. v3 menambahkan input free-text di setiap kartu.
- **createAgenTeamTask**: AI SDK tool di `src/lib/ai/tools/create-agen-team-task.ts` (schema-only, tidak meng-enforce validasi karena dipanggil deterministik dari scope-router).
- **enqueueAgenTeamTask**: Fungsi di `src/lib/agen-team/create-task.ts` yang memasukkan task ke pipeline LangGraph/Inngest.
- **LangGraph_Pipeline**: State machine di `src/lib/agen-team/graph.ts` dengan jalur `full_auto_publish` (writer → marketing_pre_publish → social_media → publish).
- **StoryMode**: UI di `src/components/agen-team/story-mode/*` yang menampilkan progres eksekusi task setelah enqueue.
- **Brief_Ledger**: Struktur state per-thread yang menyimpan slot yang sudah disimpulkan Scope_Router. Field-nya didefinisikan di Requirement 1.
- **Brief_Maturity**: Level 0..5 yang menjadi gate utama keputusan Scope_Router. Definisi level ada di Requirement 2.
- **pendingConfirmation**: Object yang berisi snapshot lengkap brief dan payload createAgenTeamTask yang akan dieksekusi, dengan `confirmationId` stabil. Disimpan di `Brief_Ledger.pendingConfirmation`.
- **pendingTaskExecution**: Object yang merepresentasikan cancellation window aktif `{ confirmationId, scheduledExecuteAt, cancelled }`.
- **Cancellation_Window**: Periode 30 detik antara user menekan tombol konfirmasi dan task benar-benar di-enqueue. Selama window ini eksekusi dapat dibatalkan tanpa efek samping.
- **Wizard_Card**: Kartu interaktif yang dirender oleh `askUserInput` untuk mengisi slot brief (goal, format, visualSource, dst). v3 wajib menampilkan free-text input di samping tombol.
- **Free_Text_Slot**: Jawaban teks bebas dari user di kartu wizard yang diparse oleh Slot_Detector menjadi nilai slot ledger.
- **Slot_Detector**: Subsistem di Scope_Router yang mem-parse jawaban user (free-text atau tool_answer) menjadi field Brief_Ledger lewat heuristics berlapis dengan fallback LLM.
- **Confirm_Card_Rich**: Kartu konfirmasi v3 yang menampilkan ringkasan slot brief, output target, dan tiga tombol ("Konfirmasi & mulai publish", "Ubah dulu", "Batal") plus free-text input.
- **Advisory_Note**: Paragraf opini singkat dari Chief saat scope-router mendeteksi konflik antar slot (mis. goal vs format).
- **Limitations_Card**: Kartu UI khusus untuk advisory dan penjelasan limitasi platform dengan tombol "Mengerti, lanjut" dan "Ganti pendekatan".
- **Auto_Publish_Default**: Kontrak bahwa keluaran default Chief adalah `intentType = "full_auto_publish"`, `output = "publish_to_instagram"`, `publish = true`. Tipe lain (`research_and_draft_content`, `draft_for_review`) boleh tetap ada untuk masa depan tetapi BUKAN jalur default.
- **confirmationId**: ID stabil untuk satu pendingConfirmation. Berfungsi sebagai token idempotensi enqueue.
- **director_text**: Mode respons natural-text dari LLM director (tanpa kartu interaktif), dipakai untuk casual chat, identitas, kapabilitas, follow-up vague, dan limitasi platform.
- **tool_answer**: Sinyal yang dikirim Chat_Bot_UI ke Chief_Chat_Endpoint saat user menekan tombol di kartu interaktif atau mengirim free-text dari kartu interaktif. Membawa marker `kind` dan optional `pendingConfirmationId`.
- **Legacy_Surface**: Jalur kode lama yang masih hidup di repo: `src/components/agen-team/ChiefChat.tsx`, action `chief_message`/`run_task` di `src/app/api/agen-team/route.ts`, dan `src/lib/agen-team/agents/chief-router.ts`.

## Notasi EARS

Dokumen ini memakai keyword EARS dalam Bahasa Indonesia secara konsisten:
- **KETIKA** ↔ WHEN (event-driven)
- **SELAGI** ↔ WHILE (state-driven)
- **JIKA ... MAKA** ↔ IF ... THEN (unwanted event)
- **BILA** ↔ WHERE (optional / conditional feature)
- **HARUS** ↔ SHALL

## Requirements

### Requirement 1: Skema Brief Ledger v3

**User Story:** Sebagai engineer yang merawat scope-router, saya ingin Brief_Ledger memiliki skema yang eksplisit dan tunggal untuk auto-publish default, sehingga seluruh keputusan deterministik berasal dari sumber data yang sama.

#### Acceptance Criteria

1. THE Brief_Ledger HARUS menyimpan field berikut: `userIntent`, `platform`, `format`, `topicCandidate`, `confirmedTopic`, `goal`, `audience`, `workflowPreference`, `visualSource`, `constraints`, `openQuestions`, `confidence`, `briefMaturity`, `pendingConfirmation`, `advisoryNotes`, `pendingTaskExecution`.
2. THE Brief_Ledger.userIntent HARUS bertipe enum dengan nilai `content_creation_interest`, `publish_request`, `casual_chat`, `question`, `out_of_scope`, atau `other`.
3. THE Brief_Ledger.platform default HARUS `"instagram"` dan tipe `platform` HARUS membatasi nilai aktif ke `"instagram"`; nilai `"twitter"` BOLEH ada di tipe untuk kompatibilitas tetapi HARUS ditandai deprecated untuk publish.
4. THE Brief_Ledger.format HARUS mengizinkan hanya format Instagram aktif: `instagram_feed_photo_caption` dan `instagram_carousel_photo`.
5. THE Brief_Ledger.visualSource HARUS bertipe enum `"internet_reference"` atau `"user_owned_asset"`.
6. THE Brief_Ledger.confidence HARUS bertipe enum `"low"`, `"medium"`, atau `"high"`.
7. THE pendingConfirmation tipe HARUS dipersempit sehingga `intentType` default-nya `"full_auto_publish"`, `output` `"publish_to_instagram"`, dan `publish` `true`; nilai `"research_and_draft_content"` dan `"draft_for_review"` BOLEH tetap ada di union tetapi BUKAN jalur default.
8. THE Brief_Ledger HARUS menjadi single source of truth untuk keputusan render kartu, payload createAgenTeamTask, dan pesan natural-text Chief.
9. KETIKA pesan baru diproses, THE Scope_Router HARUS memperbarui Brief_Ledger secara deterministik tanpa kehilangan slot yang sebelumnya sudah valid.
10. THE field `unsupportedFormat` di Brief_Ledger v2 HARUS dihapus atau dihubungkan secara nyata ke decision tree (tidak boleh menjadi field mati).

### Requirement 2: Brief Maturity sebagai Gate Utama

**User Story:** Sebagai user yang berinteraksi dengan Chief, saya ingin respons Chief sesuai dengan tingkat kelengkapan brief saya, sehingga saya tidak ditanya hal yang sudah saya jawab dan tidak diberi kartu konfirmasi sebelum brief jelas.

#### Acceptance Criteria

1. THE Scope_Router HARUS menghitung `briefMaturity` sebagai integer 0..5 setiap kali pesan diproses.
2. KETIKA `briefMaturity = 0` (vague intent), THE Scope_Router HARUS mengirim director_text follow-up tanpa membuka kartu wizard, tanpa membuat pendingConfirmation, dan tanpa membuat task.
3. KETIKA `briefMaturity = 1` (preferensi terisi sebagian, mis. platform atau format saja), THE Scope_Router HARUS menyimpan preferensi tersebut ke Brief_Ledger dan mengirim director_text natural untuk meminta topik.
4. KETIKA `briefMaturity = 2` (topicCandidate ada tetapi shape belum lengkap), THE Scope_Router HARUS membuka Wizard_Card hanya untuk slot yang missing atau ambiguous sesuai Requirement 3.
5. KETIKA `briefMaturity = 3` (task-ready: platform + format + confirmedTopic + goal + visualSource lengkap), THE Scope_Router HARUS menampilkan ringkasan brief dan Confirm_Card_Rich auto-publish.
6. KETIKA `briefMaturity = 4` (user telah menekan konfirmasi dan pendingTaskExecution aktif), THE UI HARUS menampilkan countdown overlay sesuai Requirement 5 dan TIDAK boleh membuka StoryMode.
7. KETIKA `briefMaturity = 5` (window habis dan task berhasil di-enqueue), THE Chat_Bot_UI HARUS membuka StoryMode dan menutup countdown card.
8. THE switch utama di `resolveChiefIntakeDecision` HARUS dipicu oleh `briefMaturity`; flag pendukung (mis. `confidence`, `openQuestions`) HARUS hanya menyesuaikan keputusan di dalam level tersebut, bukan menggantikan gate.
9. JIKA briefMaturity dihitung tanpa input yang cukup (state inkonsisten), MAKA THE Scope_Router HARUS default ke level 0 dan mengirim director_text yang meminta klarifikasi.

### Requirement 3: Wizard Cerdas dengan Free-text dan Slot Skipping

**User Story:** Sebagai user yang baru menyebut platform dan format di pesan pertama, saya ingin Chief tidak menanyakan ulang hal itu di kartu wizard, dan saya ingin bisa menjawab kartu wizard dengan teks bebas saya sendiri.

#### Acceptance Criteria

1. KETIKA Wizard_Card akan dirender, THE Scope_Router HARUS membaca Brief_Ledger dan hanya membuat pertanyaan untuk slot yang missing atau ambiguous.
2. BILA seluruh slot wajib (`platform`, `format`, `confirmedTopic`, `goal`, `visualSource`) sudah valid di Brief_Ledger, THE Scope_Router HARUS skip wizard dan langsung menampilkan Confirm_Card_Rich.
3. THE Wizard_Card HARUS menampilkan input free-text di samping tombol pilihan di Interactive_Overlay.
4. THE Wizard_Card HARUS menampilkan maksimum 4 opsi tombol kontekstual sesuai kebijakan askUserInput.
5. KETIKA user menekan tombol di Wizard_Card, THE Chat_Bot_UI HARUS mengirim tool_answer dengan marker tombol ke Chief_Chat_Endpoint.
6. KETIKA user mengirim free-text dari Wizard_Card, THE Chat_Bot_UI HARUS mengirim tool_answer dengan `answer` berisi string free-text apa adanya dan marker `kind` yang menandai konteks slot.
7. KETIKA tool_answer free-text diterima, THE Slot_Detector HARUS mem-parse jawaban menggunakan layered heuristics (kata kunci slot, normalisasi case, sinonim umum) sebelum melakukan fallback ke LLM.
8. KETIKA Slot_Detector berhasil mem-parse free-text menjadi nilai slot, THE Scope_Router HARUS memperbarui Brief_Ledger dengan nilai tersebut tanpa kehilangan slot lain yang sudah valid.
9. JIKA Slot_Detector tidak dapat mem-parse free-text dengan keyakinan cukup, MAKA THE Scope_Router HARUS mengirim director_text klarifikasi singkat alih-alih memaksa nilai default.
10. THE Wizard_Card HARUS mencantumkan hint kontekstual yang menampilkan slot yang sudah Chief simpulkan dari ledger sehingga user tahu apa yang sudah diketahui Chief.

### Requirement 4: Confirm Card Rich (Auto-publish Default)

**User Story:** Sebagai user yang siap menekan publikasi, saya ingin melihat ringkasan lengkap brief saya, output target, dan estimasi waktu, sehingga saya tahu persis apa yang akan dipublikasikan sebelum saya mengkonfirmasi.

#### Acceptance Criteria

1. THE Confirm_Card_Rich HARUS dirender oleh Interactive_Overlay dengan header `"Rencana publish Instagram"`.
2. THE Confirm_Card_Rich HARUS menampilkan ringkasan slot berikut sebagai daftar: topik, arah/goal, format, sumber visual, platform, output target = `"Auto-publish ke Instagram"`, dan estimasi waktu eksekusi.
3. THE Confirm_Card_Rich HARUS menyediakan tepat tiga tombol: `"Konfirmasi & mulai publish"`, `"Ubah dulu"`, dan `"Batal"`.
4. THE Confirm_Card_Rich HARUS menampilkan helper text yang menjelaskan bahwa setelah konfirmasi akan ada window 30 detik untuk membatalkan publish.
5. THE Confirm_Card_Rich HARUS menerima jawaban free-text dari user.
6. THE Confirm_Card_Rich HARUS membawa marker `kind = "confirm_brief"` dan `pendingConfirmationId` di payload askUserInput.input sehingga Scope_Router dapat mengidentifikasi konfirmasi tanpa regex teks.
7. KETIKA user menekan `"Konfirmasi & mulai publish"`, THE Chat_Bot_UI HARUS mengirim tool_answer dengan marker konfirmasi ke Chief_Chat_Endpoint.
8. KETIKA user menekan `"Ubah dulu"`, THE Chat_Bot_UI HARUS mengirim tool_answer dengan marker correction ke Chief_Chat_Endpoint sesuai Requirement 9.
9. KETIKA user menekan `"Batal"`, THE Chat_Bot_UI HARUS mengirim tool_answer dengan marker cancel dan THE Scope_Router HARUS menghapus pendingConfirmation tanpa membuat task.
10. THE Confirm_Card_Rich HARUS dirender HANYA SAAT briefMaturity = 3 dan pendingConfirmation telah dibuat dengan confirmationId yang stabil.

### Requirement 5: Cancellation Window 30 Detik

**User Story:** Sebagai user yang baru menekan konfirmasi, saya ingin punya 30 detik untuk berubah pikiran dan menghentikan publish, sehingga saya merasa aman bahwa Chief tidak melakukan tindakan permanen tanpa kesempatan saya batalkan.

#### Acceptance Criteria

1. KETIKA user menekan `"Konfirmasi & mulai publish"`, THE Scope_Router HARUS membuat pendingTaskExecution dengan field `confirmationId`, `scheduledExecuteAt = now + 30_detik`, dan `cancelled = false`.
2. THE Cancellation_Window HARUS berdurasi tepat 30 detik.
3. SELAGI pendingTaskExecution aktif dan `cancelled = false`, THE Interactive_Overlay HARUS menampilkan countdown card dengan progress bar, hitungan mundur dalam detik, dan tombol `"Batalkan publish"`.
4. SELAGI pendingTaskExecution aktif dan `cancelled = false`, THE Backend HARUS TIDAK memanggil enqueueAgenTeamTask.
5. SELAGI pendingTaskExecution aktif, THE Chat_Bot_UI HARUS TIDAK membuka StoryMode.
6. KETIKA user menekan `"Batalkan publish"` sebelum `scheduledExecuteAt` tercapai, THE Scope_Router HARUS menandai `pendingTaskExecution.cancelled = true`, mereset `Brief_Ledger.pendingConfirmation`, dan mengirim director_text yang mengkonfirmasi pembatalan secara natural.
7. JIKA `pendingTaskExecution.cancelled = true`, MAKA THE Backend HARUS TIDAK pernah memanggil enqueueAgenTeamTask untuk `confirmationId` tersebut, baik melalui jalur client-trigger maupun jalur scheduled backend.
8. KETIKA `scheduledExecuteAt` tercapai dan `cancelled = false`, THE Backend HARUS memanggil enqueueAgenTeamTask tepat satu kali untuk `confirmationId` tersebut sesuai Requirement 6.
9. THE countdown card HARUS menampilkan label `"Membatalkan dalam X detik akan menghentikan publish"` dengan X yang menurun setiap detik.
10. KETIKA `scheduledExecuteAt` tercapai dan task berhasil di-enqueue, THE countdown card HARUS hilang dari UI dan StoryMode HARUS dibuka.
11. JIKA enqueueAgenTeamTask gagal dengan error retryable, MAKA THE Backend HARUS retry dengan idempotency token yang sama (lihat Requirement 6).
12. JIKA user menutup tab atau kehilangan koneksi selama window, MAKA THE Backend HARUS tetap mengeksekusi enqueue setelah window habis BILA jalur scheduled backend dipakai, atau membatalkan eksekusi BILA hanya client-trigger yang dipakai; spec MEMPERSYARATKAN dokumentasi keputusan ini di design phase.

### Requirement 6: Idempotent Task Enqueue

**User Story:** Sebagai operator pipeline, saya ingin satu konfirmasi user hanya menghasilkan satu task di queue, sehingga tidak ada duplikat publish ke Instagram walaupun trigger eksekusi datang dari beberapa jalur.

#### Acceptance Criteria

1. THE enqueueAgenTeamTask HARUS idempotent terhadap `confirmationId`: pemanggilan kedua dengan `confirmationId` yang sama HARUS TIDAK menghasilkan task baru di queue.
2. THE Backend HARUS menyimpan idempotency token yang berasal dari `confirmationId` di store yang persistent (DB atau cache yang dapat dibaca dari semua jalur trigger).
3. KETIKA jalur trigger client-side (countdown habis di browser) dan jalur trigger backend (Inngest scheduled event) berjalan bersamaan untuk `confirmationId` yang sama, THE Backend HARUS memastikan hanya satu task masuk ke pipeline LangGraph.
4. **Correctness property (idempotency):** UNTUK setiap `confirmationId` `c`, `|tasks_enqueued(c)|` HARUS termasuk dalam himpunan `{0, 1}` setelah window selesai, untuk semua kombinasi event input (cancel pada t=0..30, double-click confirm, double trigger end-of-window).
5. **Correctness property (no-cancel-no-task):** JIKA `pendingTaskExecution.cancelled = true` pada saat manapun selama window, MAKA `|tasks_enqueued(confirmationId)|` HARUS = 0.
6. **Correctness property (no-bypass):** JIKA `pendingConfirmation` tidak pernah dibuat untuk sebuah thread, MAKA `tasks_enqueued` untuk thread tersebut HARUS = 0.
7. THE Backend HARUS TIDAK memberi LLM otoritas untuk memanggil enqueueAgenTeamTask langsung tanpa konfirmasi user dan window selesai.
8. JIKA enqueueAgenTeamTask dipanggil ulang dengan `confirmationId` yang sudah punya task, MAKA THE Backend HARUS mengembalikan referensi task lama tanpa membuat baru.

### Requirement 7: Payload Freeze dari pendingConfirmation

**User Story:** Sebagai user yang melihat ringkasan brief di kartu konfirmasi, saya ingin yang dipublikasikan persis sama dengan apa yang saya lihat, sehingga tidak ada surprise akibat state baru yang masuk antara saya melihat kartu dan sistem mengeksekusi.

#### Acceptance Criteria

1. KETIKA pendingConfirmation dibuat, THE Scope_Router HARUS men-snapshot payload createAgenTeamTask lengkap ke dalam `pendingConfirmation` dengan `confirmationId` stabil.
2. THE Backend HARUS menggunakan `pendingConfirmation` sebagai sumber payload createAgenTeamTask, BUKAN merebuild dari state mentah lewat `buildCreateTaskInputFromState(state)`.
3. KETIKA window habis dan eksekusi dijalankan, THE Backend HARUS membaca snapshot pendingConfirmation yang dipersist dengan `confirmationId` tersebut, BUKAN menghitung ulang dari Brief_Ledger saat itu.
4. **Correctness property (payload freeze):** UNTUK setiap `confirmationId` `c`, payload yang dikirim ke enqueueAgenTeamTask HARUS deep-equal dengan payload yang ditampilkan di Confirm_Card_Rich saat user menekan konfirmasi.
5. JIKA Brief_Ledger berubah selama window (mis. user kirim pesan baru), MAKA THE Scope_Router HARUS TIDAK memodifikasi `pendingConfirmation` snapshot; perubahan baru HARUS membuat pendingConfirmation baru dengan `confirmationId` baru jika user kembali ke konfirmasi.
6. THE `confirmationId` HARUS dihasilkan secara deterministik atau random-unik dan dipersist sebelum kartu konfirmasi dirender ke UI.

### Requirement 8: Identifikasi Konfirmasi via Marker Eksplisit

**User Story:** Sebagai engineer yang menjaga kode scope-router, saya ingin gate konfirmasi tidak bergantung pada teks pertanyaan UI, sehingga perubahan copy tidak memecahkan deteksi konfirmasi.

#### Acceptance Criteria

1. THE askUserInput.input HARUS menyertakan marker eksplisit `kind` (mis. `"confirm_brief"`, `"wizard_goal"`, `"wizard_format"`, `"wizard_visual"`, `"correction"`, `"cancel"`) untuk setiap kartu interaktif.
2. THE Confirm_Card_Rich HARUS menyertakan `pendingConfirmationId` di payload askUserInput.input.
3. KETIKA tool_answer datang, THE Scope_Router HARUS mengidentifikasi konfirmasi melalui marker `kind` dan/atau `pendingConfirmationId`, BUKAN melalui regex pencocokan teks pertanyaan.
4. THE Scope_Router HARUS TIDAK memakai pola regex `/konfirmasi (brief|publish|upload)/i` atau pola serupa terhadap teks pertanyaan untuk memutuskan gate konfirmasi.
5. JIKA tool_answer tiba tanpa marker `kind` yang dikenali, MAKA THE Scope_Router HARUS memperlakukannya sebagai pesan free-text biasa, bukan konfirmasi.

### Requirement 9: Correction Handling Deterministik dan Free-text

**User Story:** Sebagai user yang mengetik "ganti jadi promo kopi susu aja" saat melihat kartu konfirmasi, saya ingin Chief mem-parse update saya dan menampilkan kartu konfirmasi baru, bukan langsung membatalkan brief saya seluruhnya.

#### Acceptance Criteria

1. KETIKA tool_answer datang dengan marker `kind = "correction"` (tombol `"Ubah dulu"`), THE Scope_Router HARUS menjaga slot ledger yang sudah valid, hanya menghapus `pendingConfirmation`, dan mengirim pertanyaan natural yang menanyakan bagian mana yang ingin diubah.
2. THE Scope_Router HARUS TIDAK mendeteksi correction lewat trigger over-eager pada kata tunggal `"bukan"`, `"jangan"`, `"salah"`, atau `"ubah"` di pesan free-text bebas.
3. KETIKA user mengirim free-text yang mengandung `"ganti"`, `"salah"`, `"bukan"`, `"jangan"`, atau `"ubah"` di luar konteks Confirm_Card_Rich aktif, THE Scope_Router HARUS mengalirkan pesan ke jalur LLM director untuk re-parse, BUKAN langsung membatalkan pendingConfirmation.
4. KETIKA user mengirim free-text correction SAAT Confirm_Card_Rich aktif (mis. `"ganti jadi promo kopi susu aja"`), THE Scope_Router HARUS:
   a. Mem-parse update slot dari free-text via Slot_Detector,
   b. Memperbarui Brief_Ledger dengan slot baru,
   c. Membuang pendingConfirmation lama beserta `confirmationId`-nya,
   d. Menghasilkan pendingConfirmation baru dengan `confirmationId` baru,
   e. Merender ulang Confirm_Card_Rich dengan ringkasan baru.
5. **Correctness property (correction-id-rotation):** UNTUK setiap correction yang berhasil, `confirmationId` lama HARUS tidak sama dengan `confirmationId` baru, dan task HARUS TIDAK pernah di-enqueue dengan `confirmationId` lama.
6. JIKA Slot_Detector tidak yakin menerjemahkan correction free-text, MAKA THE Scope_Router HARUS mengirim director_text klarifikasi alih-alih membuat asumsi.

### Requirement 10: Topic Capture Deterministik

**User Story:** Sebagai user yang mengetik "gw kepikiran sesuatu tentang tren skincare deh tapi gatau", saya tidak ingin Chief langsung menjadikan "tren skincare" sebagai topik konten yang fix, sehingga saya tidak terjebak ke kartu konfirmasi yang salah arah.

#### Acceptance Criteria

1. KETIKA user menyebut frasa eksploratif yang mengandung `"tentang ..."` tanpa intent konten yang jelas, THE Scope_Router HARUS hanya mempromosikan kata kunci ke `topicCandidate` (Level 2), BUKAN ke `confirmedTopic`.
2. THE Scope_Router HARUS hanya mempromosikan `topicCandidate` ke `confirmedTopic` ketika user secara eksplisit re-affirm via tool_answer marker konfirmasi atau via Confirm_Card_Rich di brief level 3.
3. THE `topicCandidate` HARUS dapat dibatalkan tanpa efek samping pada slot lain ketika user kembali ke pesan eksploratif.
4. KETIKA user menulis pesan yang dengan jelas adalah perintah konten (mis. `"bikin carousel Instagram tentang X"`), THE Scope_Router HARUS langsung mengisi `confirmedTopic = X` tanpa lewat `topicCandidate`.
5. JIKA `topicCandidate` ada tetapi `confirmedTopic` belum, MAKA THE Confirm_Card_Rich HARUS TIDAK dirender (tetap di level 2).

### Requirement 11: Chief Push-back / Advisory Notes

**User Story:** Sebagai user yang minta Carousel untuk goal "engagement" tapi formatnya konflik, saya ingin Chief jujur memberi opini bahwa Carousel mungkin lebih cocok daripada Feed foto, sehingga saya bisa mengambil keputusan informed dan bukan iya-iya.

#### Acceptance Criteria

1. KETIKA Scope_Router mendeteksi konflik antara `goal` dan `format` (contoh: `goal = "engagement"` + `format = "instagram_feed_photo_caption"`), THE Scope_Router HARUS menambahkan entry ke `Brief_Ledger.advisoryNotes` dengan saran alternatif format dan alasannya.
2. KETIKA Scope_Router mendeteksi konflik antara topik real-time (mis. berita 24 jam) dan platform Instagram, THE Scope_Router HARUS menambahkan advisoryNote yang menyarankan adaptasi pendekatan.
3. THE advisoryNote HARUS ditampilkan di UI sebagai Limitations_Card / Advisory_Card yang dirender SEBELUM atau DI SAMPING Confirm_Card_Rich.
4. THE Advisory_Card HARUS memuat ikon info, judul ringkas, body penjelasan, dan dua tombol: `"Mengerti, lanjut"` dan `"Ganti pendekatan"`.
5. THE advisoryNote HARUS TIDAK memblokir tombol `"Konfirmasi & mulai publish"` di Confirm_Card_Rich; user tetap dapat memilih konfirmasi setelah menerima advisory.
6. KETIKA user menekan `"Mengerti, lanjut"`, THE Scope_Router HARUS menjaga brief saat ini dan memunculkan Confirm_Card_Rich.
7. KETIKA user menekan `"Ganti pendekatan"`, THE Scope_Router HARUS membuka Wizard_Card untuk slot yang konflik dengan opsi alternatif yang Chief sarankan.
8. THE Chief HARUS menyampaikan advisoryNote dalam bahasa natural yang sopan, jujur, dan tidak iya-iya, sesuai persona Pak Arga.

### Requirement 12: Chief Honest tentang Limitasi Platform

**User Story:** Sebagai user yang minta Chief publikasikan ke YouTube atau TikTok, saya ingin Chief jujur menyatakan bahwa platform tersebut tidak didukung, dan saya ingin Chief menawarkan adaptasi konkret ke Instagram.

#### Acceptance Criteria

1. KETIKA user meminta publikasi ke YouTube, TikTok, LinkedIn, Blog, atau Threads, THE Chief HARUS membalas dengan director_text yang menjelaskan bahwa platform aktif HANYA Instagram.
2. THE Chief HARUS TIDAK mengarang dukungan platform yang tidak ada di sistem.
3. KETIKA platform yang diminta tidak didukung, THE Chief HARUS memberikan minimal satu contoh konkret bagaimana topik atau goal yang sama dapat diadaptasi ke Instagram (mis. "thread Twitter" → "Carousel Instagram", "long video TikTok" → "Reels-style Carousel").
4. THE Chief HARUS TIDAK menampilkan Confirm_Card_Rich untuk platform tidak didukung; jalur konfirmasi HANYA tersedia setelah user menyetujui adaptasi ke Instagram.
5. THE jawaban limitasi platform HARUS dirender sebagai director_text natural, BUKAN sebagai Limitations_Card kaku, kecuali user sudah pernah berulang kali meminta platform yang sama (di mana Limitations_Card dengan tombol adaptasi BOLEH dirender).

### Requirement 13: StoryMode Gating Berdasarkan Cancellation Window

**User Story:** Sebagai user yang baru menekan konfirmasi, saya tidak ingin StoryMode langsung terbuka selama 30 detik window berlangsung, sehingga saya bisa fokus ke countdown dan tombol batalkan tanpa terganggu UI eksekusi.

#### Acceptance Criteria

1. THE field `readyForStory` di event streaming Chief_Chat_Endpoint HARUS bernilai `true` HANYA SETELAH cancellation window habis dan task berhasil di-enqueue.
2. SELAGI cancellation window berjalan, THE Chief_Chat_Endpoint HARUS TIDAK mengirim event `readyForStory: true`.
3. SELAGI cancellation window berjalan, THE Chat_Bot_UI HARUS TIDAK membuka StoryMode walaupun `createAgenTeamTask` tool result terdeteksi.
4. SELAGI cancellation window berjalan, THE Chat_Bot_UI HARUS menampilkan countdown card sesuai Requirement 5 sebagai gantinya.
5. KETIKA cancellation window habis dan enqueueAgenTeamTask berhasil, THE Chief_Chat_Endpoint HARUS mengirim event `readyForStory: true` dan THE Chat_Bot_UI HARUS membuka StoryMode dan menutup countdown card.
6. JIKA enqueue gagal setelah window habis, MAKA THE Chief_Chat_Endpoint HARUS mengirim error event dan Chat_Bot_UI HARUS TIDAK membuka StoryMode; UI HARUS menampilkan kartu error dengan opsi retry atau batal.

### Requirement 14: Deprecation Legacy Code Path

**User Story:** Sebagai engineer yang menjaga sistem, saya ingin tidak ada jalur kode lama yang dapat melewati gate deterministik scope-router dan langsung men-trigger publish, sehingga gate v3 benar-benar menjadi single entry point.

#### Acceptance Criteria

1. THE legacy action `chief_message` di `src/app/api/agen-team/route.ts` HARUS mengembalikan HTTP 410 Gone untuk request UI normal.
2. THE legacy action `run_task` di `src/app/api/agen-team/route.ts` HARUS mengembalikan HTTP 410 Gone untuk request UI normal.
3. BILA dev-only feature flag `AGEN_TEAM_LEGACY_API_ENABLED` aktif, THE legacy action `chief_message` dan `run_task` BOLEH dipertahankan untuk dev tooling dengan logging eksplisit.
4. THE komponen `src/components/agen-team/ChiefChat.tsx` HARUS TIDAK lagi diimpor dari rute aktif manapun di `src/app/`.
5. THE modul `src/lib/agen-team/agents/chief-router.ts` (legacy LangChain Mistral router) HARUS TIDAK lagi dipanggil oleh path produksi; pemanggilannya HARUS hanya melalui jalur dev-only feature flag.
6. KETIKA jalur legacy dipanggil di production tanpa flag, THE Backend HARUS log warning "legacy chief router called without flag" dan mengembalikan 410 Gone.
7. **Correctness property (no-bypass-legacy):** UNTUK setiap task yang masuk ke LangGraph_Pipeline, sumber trigger HARUS dapat ditelusuri ke `confirmationId` yang berasal dari Scope_Router v3, BUKAN dari legacy chief-router.

### Requirement 15: Acceptance Test Scenarios

**User Story:** Sebagai QA dan engineer yang memverifikasi v3, saya ingin daftar skenario end-to-end yang konkret dan deterministik, sehingga saya dapat menulis tes integrasi dan property-based yang menutup semua perilaku gate utama.

#### Acceptance Criteria

1. KETIKA user mengirim `"yaudah deh gua pengen bikin konten"`, THE Scope_Router HARUS membalas dengan director_text follow-up, TIDAK membuka Wizard_Card, TIDAK membuat pendingConfirmation, dan TIDAK memicu countdown.
2. KETIKA user mengirim pesan casual seperti `"bro kocak lu ya"`, THE Scope_Router HARUS membalas dengan director_text natural tanpa kartu interaktif apapun.
3. KETIKA user mengirim pesan eksploratif seperti `"gua kepikiran sesuatu deh cuma gatau dah"`, THE Scope_Router HARUS membalas dengan director_text yang meminta detail tanpa kartu interaktif.
4. KETIKA user mengirim `"Instagram aja"` sebagai pesan pertama, THE Scope_Router HARUS menyimpan `platform = "instagram"` ke Brief_Ledger, TIDAK membuka Wizard_Card, dan mengirim director_text yang meminta topik secara natural.
5. KETIKA user mengirim `"feed carousel"` sebagai pesan pertama, THE Scope_Router HARUS menyimpan `format = "instagram_carousel_photo"` ke Brief_Ledger dan mengirim director_text yang meminta topik tanpa kartu wizard.
6. KETIKA user mengirim `"burger lokal"` sebagai topic candidate, THE Scope_Router HARUS mengisi `topicCandidate` dan membuka Wizard_Card hanya untuk slot yang missing (mis. goal), dengan free-text input tersedia, dan TIDAK menampilkan Confirm_Card_Rich.
7. KETIKA user mengirim `"bikin carousel Instagram edukasi tentang kesalahan skincare"`, THE Scope_Router HARUS mengisi seluruh slot wajib, mencapai briefMaturity = 3, dan menampilkan Confirm_Card_Rich auto-publish; TIDAK boleh ada task di queue saat ini.
8. KETIKA user menekan `"Konfirmasi & mulai publish"` di Confirm_Card_Rich, THE UI HARUS menampilkan countdown card 30 detik dengan tombol `"Batalkan publish"`; TIDAK boleh ada task masuk DB selama window.
9. KETIKA user menekan `"Batalkan publish"` pada detik ke-15 selama window, THE Scope_Router HARUS mereset `pendingTaskExecution` dan `pendingConfirmation`, TIDAK ada task di DB, TIDAK ada StoryMode terbuka, dan Chief HARUS mengirim director_text yang mengkonfirmasi pembatalan.
10. KETIKA cancellation window 30 detik habis tanpa pembatalan, THE Backend HARUS memanggil enqueueAgenTeamTask tepat satu kali, StoryMode HARUS terbuka, dan countdown card HARUS hilang.
11. KETIKA user mengetik `"lanjut"` tanpa Confirm_Card_Rich aktif sebelumnya, THE Scope_Router HARUS TIDAK membuat task; Chief HARUS mengirim director_text yang menjelaskan bahwa brief masih perlu detail.
12. KETIKA user menekan tombol `"Ubah dulu"` di Confirm_Card_Rich, THE Scope_Router HARUS menjaga slot ledger valid, hanya menghapus pendingConfirmation, dan menanyakan bagian mana yang ingin diubah.
13. KETIKA user mengetik `"ganti jadi promo kopi susu aja"` saat Confirm_Card_Rich aktif, THE Scope_Router HARUS mem-parse update topic dan goal, membuang pendingConfirmation lama beserta `confirmationId`-nya, dan merender Confirm_Card_Rich baru dengan `confirmationId` baru.
14. KETIKA user mengirim `"postingkan ke Instagram sekarang"` sebagai publish request eksplisit dengan brief belum lengkap, THE Scope_Router HARUS tetap masuk briefing lane (Wizard_Card untuk slot missing) BUKAN langsung memicu publish raw text; auto-publish tetap menjadi default tetapi melewati gate konfirmasi.
15. KETIKA user meminta publikasi ke YouTube, TikTok, LinkedIn, Blog, atau Threads, THE Chief HARUS mengirim director_text yang menjelaskan limitasi dan menawarkan adaptasi ke Instagram dengan minimal satu contoh konkret.
16. KETIKA brief mencapai level 3 tetapi `goal = "engagement"` konflik dengan `format = "instagram_feed_photo_caption"`, THE Scope_Router HARUS menambahkan advisoryNote yang menyarankan Carousel; user tetap dapat menekan konfirmasi.
17. KETIKA user menyebut platform, format, topik, dan goal sekaligus di pesan pertama, THE Scope_Router HARUS skip semua Wizard_Card dan langsung menampilkan Confirm_Card_Rich; TIDAK boleh menanyakan ulang slot yang sudah dijawab.
18. KETIKA user mengetik `"kayaknya gw mau yg lebih edukatif tapi gak boring"` di Wizard_Card slot goal, THE Slot_Detector HARUS mem-parse menjadi `goal = "edukasi"` dan menambahkan `"tidak membosankan"` ke `constraints`.
19. KETIKA user mengirim pertanyaan identitas seperti `"lu siapa sih?"`, THE Scope_Router HARUS membalas dengan director_text persona Pak Arga tanpa kartu interaktif.
20. KETIKA user mengirim pertanyaan kapabilitas seperti `"bisa apa aja?"`, THE Scope_Router HARUS membalas dengan director_text yang menjelaskan kemampuan + limitasi platform tanpa kartu interaktif.

## Non-Functional Requirements

### NFR1: Determinisme Gate

1. THE Scope_Router HARUS deterministik untuk input `(thread_history, current_message, ledger_state)` yang sama: keluaran `(decision, ledger_after, ui_event)` HARUS identik di setiap pemanggilan, kecuali bagian yang sengaja menggunakan random `confirmationId`.
2. THE LLM director HARUS HANYA dipanggil untuk men-generate teks natural / fallback parsing slot, BUKAN untuk membuat keputusan gate (level transition, render kartu, enqueue task).

### NFR2: Idempotent Task Creation

1. THE enqueueAgenTeamTask HARUS idempotent terhadap `confirmationId` (lihat Requirement 6).
2. THE Backend HARUS TIDAK pernah membuat dua task untuk satu `confirmationId` walaupun trigger datang dari beberapa jalur (client-trigger, scheduled backend, retry).

### NFR3: No LLM Authority untuk Create Task

1. THE LLM director HARUS TIDAK memiliki tool call yang dapat membuat atau meng-enqueue task secara langsung tanpa melewati gate konfirmasi user dan cancellation window.
2. THE createAgenTeamTask AI SDK tool BOLEH ada di registry untuk schema typing, tetapi pemanggilan aktualnya HARUS dilakukan oleh Scope_Router setelah Requirement 5 dan 6 terpenuhi.

### NFR4: TypeScript Strict

1. THE seluruh kode v3 di `src/lib/agen-team/chief/`, `src/app/api/agen-team/chief-chat/`, `src/components/interactive-overlay.tsx`, dan `src/components/chat-bot.tsx` (mode chief) HARUS lulus `tsc --noEmit` di mode strict tanpa `any` baru.
2. THE tipe `pendingConfirmation` HARUS dipersempit sesuai Requirement 1.7 sehingga tidak ada cabang impossible yang dibiarkan terbuka.

### NFR5: Tidak Menambah Dependency Baru

1. THE implementasi v3 HARUS TIDAK menambah dependency npm baru kecuali absolutely necessary; idempotency store HARUS memakai DB Postgres / Redis yang sudah dipakai project.
2. JIKA dependency baru benar-benar diperlukan, MAKA HARUS dijustifikasi di design phase sebelum menjadi task.

### NFR6: Tidak Memecahkan Flow Non-Agen-Team

1. THE perubahan v3 HARUS TIDAK mengubah perilaku chat reguler di mode lain (`chat`, `voice`, `temporary`).
2. THE perubahan di Interactive_Overlay HARUS hanya aktif untuk mode `agen-team-chief`; kartu interaktif untuk mode lain HARUS tetap berfungsi seperti sebelumnya.
3. THE perubahan di /api/agen-team/route.ts (deprecation legacy action) HARUS TIDAK memengaruhi action lain di endpoint tersebut yang masih dipakai.

### NFR7: Observability

1. THE Scope_Router HARUS menulis log terstruktur untuk transisi level briefMaturity, pembuatan dan pembatalan pendingConfirmation, pembuatan dan pembatalan pendingTaskExecution, serta pemanggilan enqueueAgenTeamTask.
2. THE log HARUS menyertakan `threadId` dan `confirmationId` (jika ada) untuk memudahkan tracing.

### NFR8: Performance

1. KETIKA pesan masuk, THE Scope_Router HARUS menyelesaikan klasifikasi dan pemilihan keputusan dalam waktu kurang dari 200ms, tidak termasuk panggilan LLM director.
2. THE countdown card HARUS update minimal sekali per detik di klien tanpa polling backend yang berat.

## Out of Scope

Hal-hal berikut TIDAK termasuk dalam ruang lingkup feature `agentic-chief-v3` ini dan akan ditangani secara terpisah:

1. **Penghapusan total file legacy.** Penghapusan fisik `src/components/agen-team/ChiefChat.tsx`, action `chief_message` dan `run_task` di `src/app/api/agen-team/route.ts`, dan `src/lib/agen-team/agents/chief-router.ts` dicatat sebagai cleanup task low-priority terpisah. Dalam scope v3, jalur tersebut hanya di-deprecate (410 Gone + dev-only feature flag) sesuai Requirement 14, tidak dihapus.
2. **Penambahan platform baru.** Dukungan untuk YouTube, TikTok, LinkedIn, Blog, atau Threads sebagai target publish tidak termasuk; v3 hanya menangani Instagram. Twitter dipertahankan di tipe untuk kompatibilitas mundur tetapi tidak diaktifkan untuk publish.
3. **Multi-account Instagram.** v3 menggunakan satu akun Instagram aktif. Switch antar akun adalah pekerjaan terpisah.
4. **Scheduled future publish.** v3 hanya menyediakan cancellation window 30 detik, bukan penjadwalan publish ke waktu tertentu di masa depan.
5. **Format Instagram tambahan.** Reels, Stories, dan Live tidak termasuk; v3 mendukung Feed foto + caption dan Carousel foto saja.
6. **Editor caption manual setelah enqueue.** Setelah task masuk pipeline, editor caption manual oleh user tidak termasuk di v3; user harus membatalkan dalam window jika ingin perubahan.
7. **Migrasi data Brief_Ledger v2 ke v3.** Asumsi: thread chat lama tidak perlu di-migrate. Thread baru memakai skema v3.
