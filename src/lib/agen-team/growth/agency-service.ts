import { ChatMistralAI } from "@langchain/mistralai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { and, asc, eq } from "drizzle-orm";
import { inngest } from "@/lib/inngest/client";
import { pgDb as db } from "@/lib/db/pg/db.pg";
import {
  AgentAgencyDecisionTable,
  GrowthExperimentTable,
  GrowthReviewTable,
  GrowthSprintCalendarItemTable,
  GrowthSprintPostTable,
  GrowthSprintTable,
} from "@/lib/db/pg/schema.pg";
import { publishInstagramFromPayload } from "@/lib/agen-team/tools/instagram-publisher";
import {
  AgentAgencyDecisionSchema,
  ContentCalendarItemSchema,
  CreateGrowthSprintInputSchema,
  GrowthAgencyPlanSchema,
  GrowthReviewSchema,
  GrowthSprintBriefSchema,
  type AgentAgencyDecision,
  type ContentCalendarItem,
  type CreateGrowthSprintInput,
  type GrowthAgencyPlan,
  type GrowthReview,
  type GrowthSprintBrief,
} from "./schemas";

const DEFAULT_MODEL = "mistral-medium-latest";
const DEFAULT_IMAGE_URL =
  "https://placehold.co/1080x1080.jpg?text=Agen+Team+Growth";

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function isoAtLocalNoon(daysFromNow: number) {
  const date = addDays(new Date(), daysFromNow);
  date.setHours(12, 0, 0, 0);
  return date.toISOString();
}

function fallbackPlan(brief: GrowthSprintBrief): GrowthAgencyPlan {
  const pillars = [
    "problem-aware education",
    "behind-the-scenes credibility",
    "proof and social trust",
    "soft offer and profile visit",
  ];
  const weeklyThemes = [
    `Minggu 1: posisikan ${brief.brandName} sebagai akun yang jelas dan mudah dipercaya.`,
    "Minggu 2: naikkan reach lewat masalah yang audience alami.",
    "Minggu 3: bangun trust dengan bukti, proses, dan cerita brand.",
    "Minggu 4: dorong profile visit dan follow dengan CTA yang natural.",
  ];
  const calendar: ContentCalendarItem[] = Array.from({ length: 12 }).map(
    (_, index) => {
      const pillar = pillars[index % pillars.length];
      const week = Math.floor(index / 3) + 1;
      const date = isoAtLocalNoon(index * 2 + 1);
      const riskLevel = index % 7 === 6 ? "medium" : "low";
      return ContentCalendarItemSchema.parse({
        date,
        status: riskLevel === "high" ? "needs_user_approval" : "scheduled",
        pillar,
        objective:
          index % 3 === 0
            ? "reach"
            : index % 3 === 1
              ? "saves"
              : "profile_visit",
        format: "feed_photo_caption",
        brief: `Post ${index + 1} untuk ${brief.brandName}: ${pillar}. Fokus pada ${brief.targetAudience} dan target ${brief.targetGoal}.`,
        caption: `${brief.targetAudience} sering butuh alasan yang jelas sebelum percaya pada ${brief.niche}.\n\n${brief.brandName} hadir untuk membuat pilihan itu terasa lebih mudah, praktis, dan relevan.\n\nSimpan post ini sebagai pengingat. #${brief.brandName.replace(/\s+/g, "")} #InstagramGrowth #BrandStory`,
        visualPlan: brief.visualPolicy,
        publishMode: "auto_after_strategy_approval",
        riskLevel,
      });
    },
  );

  return GrowthAgencyPlanSchema.parse({
    strategy: {
      positioning: `${brief.brandName} diposisikan sebagai akun ${brief.niche} yang membantu ${brief.targetAudience} memahami masalah mereka dan percaya sebelum membeli/engage.`,
      targetMetric: brief.targetGoal,
      weeklyThemes,
      contentPillars: pillars,
      experimentPlan: [
        "Uji hook berbasis problem vs hook berbasis proof.",
        "Uji CTA save/share vs CTA profile visit.",
      ],
      riskPolicy:
        "Konten high-risk, klaim sensitif, atau visual dengan sumber tidak jelas wajib manual approval.",
      successCriteria: [
        "Posting konsisten sesuai frekuensi.",
        "Reach mingguan naik dibanding baseline sprint.",
        "Profile visit dan follower delta tidak negatif selama dua minggu berturut-turut.",
      ],
      chiefVerdict:
        "Strategi layak dijalankan sebagai 30-Day Growth Sprint dengan kontrol risiko publish.",
    },
    calendar,
    experiments: [
      "Problem-first hooks",
      "Proof-based carousel",
      "Profile-visit CTA",
    ],
    decisions: [
      {
        agentId: "chief",
        decision: "approve_strategy_for_user_review",
        confidence: 0.78,
        reason:
          "Brand brief cukup untuk membuat sprint awal; performa akan divalidasi lewat weekly review.",
      },
      {
        agentId: "intelgen",
        decision: "market_assumptions_need_validation",
        confidence: 0.68,
        reason:
          "Metrics Instagram belum tersedia saat strategi dibuat, jadi baseline harus dikumpulkan saat sprint aktif.",
      },
      {
        agentId: "marketing",
        decision: "calendar_ready",
        confidence: 0.76,
        reason:
          "Kalender 12 post memberi ritme 3 post per minggu dengan ruang adaptasi.",
      },
    ],
  });
}

async function generatePlanWithAgent(
  brief: GrowthSprintBrief,
): Promise<GrowthAgencyPlan> {
  const fallback = fallbackPlan(brief);
  try {
    const llm = new ChatMistralAI({
      model: process.env.AGEN_TEAM_GROWTH_MODEL ?? DEFAULT_MODEL,
      temperature: 0.35,
    }).withStructuredOutput(GrowthAgencyPlanSchema);

    return GrowthAgencyPlanSchema.parse(
      await llm.invoke([
        new SystemMessage(
          "Anda adalah Agen Team: Chief Growth Director, Intelgen Intelligence, dan Marketing Operator. Buat 30-Day Instagram Growth Sprint yang realistis, aman, dan bisa auto-publish setelah strategi disetujui user.",
        ),
        new HumanMessage(
          `Brief:
${JSON.stringify(brief, null, 2)}

Buat GrowthAgencyPlan:
- 4 weeklyThemes.
- 3-6 contentPillars.
- 12 calendar items untuk 30 hari, mayoritas scheduled, high-risk harus needs_user_approval.
- Caption harus siap publish, tidak overclaim, maksimal 3 hashtag.
- Decisions hanya agentId chief/intelgen/marketing/system.`,
        ),
      ]),
    );
  } catch {
    return fallback;
  }
}

export async function createGrowthSprint(args: {
  userId: string;
  input: CreateGrowthSprintInput;
}) {
  const input = CreateGrowthSprintInputSchema.parse(args.input);
  const [row] = await db
    .insert(GrowthSprintTable)
    .values({
      userId: args.userId,
      accountId: input.brief.accountId,
      status: "draft",
      approvalPolicy: input.approvalPolicy,
      brief: input.brief,
    })
    .returning();

  await inngest.send({
    name: "growth-sprint/create-strategy",
    data: { sprintId: row.id, userId: args.userId },
  });

  return row;
}

export async function getGrowthSprint(userId: string, sprintId: string) {
  const [sprint] = await db
    .select()
    .from(GrowthSprintTable)
    .where(and(eq(GrowthSprintTable.id, sprintId), eq(GrowthSprintTable.userId, userId)))
    .limit(1);
  if (!sprint) return null;

  const [calendar, experiments, reviews, decisions, posts] = await Promise.all([
    db
      .select()
      .from(GrowthSprintCalendarItemTable)
      .where(eq(GrowthSprintCalendarItemTable.sprintId, sprintId))
      .orderBy(asc(GrowthSprintCalendarItemTable.scheduledFor)),
    db
      .select()
      .from(GrowthExperimentTable)
      .where(eq(GrowthExperimentTable.sprintId, sprintId)),
    db
      .select()
      .from(GrowthReviewTable)
      .where(eq(GrowthReviewTable.sprintId, sprintId)),
    db
      .select()
      .from(AgentAgencyDecisionTable)
      .where(eq(AgentAgencyDecisionTable.sprintId, sprintId))
      .orderBy(asc(AgentAgencyDecisionTable.createdAt)),
    db
      .select()
      .from(GrowthSprintPostTable)
      .where(eq(GrowthSprintPostTable.sprintId, sprintId))
      .orderBy(asc(GrowthSprintPostTable.createdAt)),
  ]);

  return { sprint, calendar, experiments, reviews, decisions, posts };
}

export async function listGrowthSprints(userId: string) {
  return db
    .select()
    .from(GrowthSprintTable)
    .where(eq(GrowthSprintTable.userId, userId))
    .orderBy(asc(GrowthSprintTable.createdAt));
}

export async function createStrategyForSprint(args: {
  userId: string;
  sprintId: string;
}) {
  const [sprint] = await db
    .select()
    .from(GrowthSprintTable)
    .where(and(eq(GrowthSprintTable.id, args.sprintId), eq(GrowthSprintTable.userId, args.userId)))
    .limit(1);
  if (!sprint) throw new Error("Growth sprint not found.");

  const brief = GrowthSprintBriefSchema.parse(sprint.brief);
  const plan = await generatePlanWithAgent(brief);

  await db
    .update(GrowthSprintTable)
    .set({
      status: "awaiting_strategy_approval",
      strategy: plan.strategy,
      updatedAt: new Date(),
    })
    .where(eq(GrowthSprintTable.id, args.sprintId));

  await db.delete(GrowthSprintCalendarItemTable).where(
    eq(GrowthSprintCalendarItemTable.sprintId, args.sprintId),
  );
  await db.insert(GrowthSprintCalendarItemTable).values(
    plan.calendar.map((item) => ({
      sprintId: args.sprintId,
      userId: args.userId,
      scheduledFor: new Date(item.date),
      status: item.status,
      content: item,
    })),
  );

  if (plan.experiments.length > 0) {
    await db.insert(GrowthExperimentTable).values(
      plan.experiments.map((title) => ({
        sprintId: args.sprintId,
        userId: args.userId,
        title,
        hypothesis: `Jika ${title.toLowerCase()} dijalankan konsisten, audience signal akan lebih jelas untuk strategi minggu berikutnya.`,
        status: "planned",
      })),
    );
  }

  if (plan.decisions.length > 0) {
    await db.insert(AgentAgencyDecisionTable).values(
      plan.decisions.map((decision) => ({
        sprintId: args.sprintId,
        userId: args.userId,
        decision: AgentAgencyDecisionSchema.parse(decision),
      })),
    );
  }

  return getGrowthSprint(args.userId, args.sprintId);
}

export async function approveGrowthSprint(userId: string, sprintId: string) {
  const details = await getGrowthSprint(userId, sprintId);
  if (!details) throw new Error("Growth sprint not found.");
  if (details.sprint.status !== "awaiting_strategy_approval") {
    throw new Error("Sprint strategy is not awaiting approval.");
  }

  const startedAt = new Date();
  const endsAt = addDays(startedAt, 30);
  await db
    .update(GrowthSprintTable)
    .set({ status: "active", startedAt, endsAt, updatedAt: new Date() })
    .where(eq(GrowthSprintTable.id, sprintId));

  for (const item of details.calendar) {
    const content = ContentCalendarItemSchema.parse(item.content);
    if (content.riskLevel === "high" || content.publishMode === "manual_required") {
      await db
        .update(GrowthSprintCalendarItemTable)
        .set({ status: "needs_user_approval", updatedAt: new Date() })
        .where(eq(GrowthSprintCalendarItemTable.id, item.id));
      continue;
    }
    await inngest.send({
      name: "growth-sprint/scheduled-publish",
      data: { sprintId, calendarItemId: item.id, userId },
    });
  }

  await inngest.send({
    name: "growth-sprint/weekly-review",
    data: { sprintId, userId, weekIndex: 1 },
  });

  return getGrowthSprint(userId, sprintId);
}

export async function updateGrowthSprintStatus(args: {
  userId: string;
  sprintId: string;
  action: "pause" | "resume" | "cancel";
}) {
  const status =
    args.action === "pause"
      ? "paused"
      : args.action === "resume"
        ? "active"
        : "cancelled";
  await db
    .update(GrowthSprintTable)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(GrowthSprintTable.id, args.sprintId), eq(GrowthSprintTable.userId, args.userId)));
  return getGrowthSprint(args.userId, args.sprintId);
}

export async function publishScheduledCalendarItem(args: {
  userId: string;
  sprintId: string;
  calendarItemId: string;
}) {
  const details = await getGrowthSprint(args.userId, args.sprintId);
  if (!details) throw new Error("Growth sprint not found.");
  const item = details.calendar.find((entry) => entry.id === args.calendarItemId);
  if (!item) throw new Error("Calendar item not found.");

  if (details.sprint.status !== "active") {
    return { skipped: "sprint_not_active" as const };
  }

  const content = ContentCalendarItemSchema.parse(item.content);
  if (content.riskLevel === "high" || content.publishMode === "manual_required") {
    await db
      .update(GrowthSprintCalendarItemTable)
      .set({ status: "needs_user_approval", updatedAt: new Date() })
      .where(eq(GrowthSprintCalendarItemTable.id, item.id));
    return { skipped: "needs_user_approval" as const };
  }

  const publishResult = await publishInstagramFromPayload(
    JSON.stringify({
      userId: args.userId,
      topic: content.objective,
      caption: content.caption,
      image_url:
        process.env.AGEN_TEAM_DEFAULT_INSTAGRAM_IMAGE_URL ?? DEFAULT_IMAGE_URL,
      postFormat: content.format,
    }),
  );
  const parsedResult = parsePublishResult(publishResult);
  const ok = parsedResult.status === "success" || parsedResult.status === "published";

  await db.insert(GrowthSprintPostTable).values({
    sprintId: args.sprintId,
    calendarItemId: item.id,
    userId: args.userId,
    caption: content.caption,
    imageUrl: String(parsedResult.imageUrl ?? ""),
    status: ok ? "published" : "failed",
    publishResult: parsedResult,
  });

  await db
    .update(GrowthSprintCalendarItemTable)
    .set({
      status: ok ? "published" : "failed",
      publishResult: parsedResult,
      retryCount: item.retryCount + (ok ? 0 : 1),
      updatedAt: new Date(),
    })
    .where(eq(GrowthSprintCalendarItemTable.id, item.id));

  if (!ok && item.retryCount >= 1) {
    await db
      .update(GrowthSprintTable)
      .set({ status: "paused", updatedAt: new Date() })
      .where(eq(GrowthSprintTable.id, args.sprintId));
  }

  return { published: ok, result: parsedResult };
}

export async function createWeeklyReview(args: {
  userId: string;
  sprintId: string;
  weekIndex: number;
}) {
  const details = await getGrowthSprint(args.userId, args.sprintId);
  if (!details) throw new Error("Growth sprint not found.");

  const published = details.calendar.filter((item) => item.status === "published");
  const failed = details.calendar.filter((item) => item.status === "failed");
  const review: GrowthReview = GrowthReviewSchema.parse({
    whatWorked:
      published.length > 0
        ? [`${published.length} post berhasil dipublikasikan minggu ini.`]
        : ["Belum ada post publish yang bisa dievaluasi."],
    whatFailed:
      failed.length > 0
        ? [`${failed.length} post gagal publish dan perlu diagnosis.`]
        : [],
    audienceSignals: [
      "Metrics Instagram belum tersedia otomatis; review berbasis publish log.",
    ],
    strategyChanges:
      failed.length > 0
        ? ["Pause auto-publish bila kegagalan berulang dan cek koneksi Instagram."]
        : ["Pertahankan ritme posting dan kumpulkan sinyal audience."],
    nextWeekPlan: ["Lanjutkan calendar item scheduled dan evaluasi post yang sudah publish."],
    chiefVerdict:
      "Metrics otomatis belum tersedia, jadi Chief tidak mengklaim growth. Sprint tetap berjalan dengan publish log dan review konservatif.",
  });
  const snapshot = {
    reach: null,
    impressions: null,
    likes: null,
    comments: null,
    shares: null,
    saves: null,
    profileVisits: null,
    followerDelta: null,
    collectedAt: new Date().toISOString(),
    source: "metrics_unavailable" as const,
  };

  await db.insert(GrowthReviewTable).values({
    sprintId: args.sprintId,
    userId: args.userId,
    weekIndex: args.weekIndex,
    performanceSnapshot: snapshot,
    review,
  });

  await db.insert(AgentAgencyDecisionTable).values({
    sprintId: args.sprintId,
    userId: args.userId,
    decision: {
      agentId: "chief",
      decision: "weekly_review_conservative_continue",
      confidence: 0.65,
      reason: review.chiefVerdict,
      createdAt: new Date().toISOString(),
    } satisfies AgentAgencyDecision,
  });

  return getGrowthSprint(args.userId, args.sprintId);
}

function parsePublishResult(value: string) {
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return {
      status: value.includes("PUBLISH_FAILED") ? "failed" : "unknown",
      raw: value,
    };
  }
}
