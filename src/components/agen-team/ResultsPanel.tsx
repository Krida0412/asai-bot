"use client";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn, safeJSONParse } from "@/lib/utils";
import type { ReactNode } from "react";

export interface StageOutput {
  id?: string;
  stageName: string;
  content: unknown;
  tokenUsageInput?: number;
  tokenUsageOutput?: number;
  createdAt?: string;
}

interface ResultsPanelProps {
  taskId: string;
  outputs: StageOutput[];
  status: string;
  onRetry: (taskId: string) => void;
  onApprove: (taskId: string) => void;
}

function parseContent(content: unknown) {
  if (typeof content === "string") {
    const parsed = safeJSONParse<Record<string, unknown>>(content);
    return parsed.success ? parsed.value : content;
  }

  return content;
}

function plainText(value: unknown) {
  if (typeof value === "string") {
    return value.replaceAll("**", "").trim();
  }

  if (typeof value === "object" && value !== null) {
    return JSON.stringify(value, null, 2);
  }

  return String(value ?? "");
}

function renderLink(url: string) {
  return (
    <a
      key={url}
      href={url}
      target="_blank"
      rel="noreferrer"
      className="block break-all text-sm text-primary hover:underline"
    >
      {url}
    </a>
  );
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatStatus(value: string) {
  const map: Record<string, string> = {
    success: "Sukses",
    partial: "Parsial",
    partial_fail: "Parsial",
    failed: "Gagal",
    approved: "Disetujui",
    drafted: "Draft",
    published: "Dipublikasikan",
    scheduled: "Terjadwal",
    pending_approval: "Menunggu Persetujuan",
    failed_publish: "Gagal Publikasi",
    running: "Berjalan",
    completed: "Selesai",
    cancelled: "Dibatalkan",
  };

  return map[value] ?? value;
}

interface PublishResultView {
  status: string;
  publicationUrl?: string;
  publicationId?: string;
  mediaContainerId?: string;
  caption?: string;
  imageUrl?: string;
  errorReason?: string;
}

function parsePublishResult(content: unknown): PublishResultView {
  const value = parseContent(content);

  if (typeof value === "string") {
    if (value.startsWith("PUBLISH_FAILED")) {
      return {
        status: "failed_publish",
        errorReason: value.replace(/^PUBLISH_FAILED:\s*/i, "").trim(),
      };
    }

    const parsed = safeJSONParse<Record<string, unknown>>(value);
    if (parsed.success) return parsePublishResult(parsed.value);

    return {
      status: value.toLowerCase().includes("published")
        ? "published"
        : "failed_publish",
      errorReason: value.toLowerCase().includes("published") ? "" : value,
    };
  }

  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    const status = String(record.status ?? "").trim();
    return {
      status:
        status === "success"
          ? "published"
          : status === "failed"
            ? "failed_publish"
            : status,
      publicationUrl: String(
        record.publicationUrl ?? record.permalink ?? "",
      ).trim(),
      publicationId: String(
        record.publicationId ?? record.mediaId ?? "",
      ).trim(),
      mediaContainerId: String(
        record.mediaContainerId ?? record.creationId ?? "",
      ).trim(),
      caption: String(record.caption ?? "").trim(),
      imageUrl: String(record.imageUrl ?? "").trim(),
      errorReason: String(
        record.error ?? record.errorReason ?? record.reason ?? "",
      ).trim(),
    };
  }

  return { status: "failed_publish", errorReason: "Output publikasi kosong." };
}

function getPublishStatusTone(status: string) {
  return status === "published" || status === "success"
    ? "Upload berhasil"
    : "Upload gagal / perlu dicek";
}

function renderScoreRow(label: string, score: number) {
  const pct = Math.round(score * 100);
  const barColor =
    score >= 0.7
      ? "bg-emerald-500"
      : score >= 0.5
        ? "bg-amber-500"
        : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <span className="w-24 shrink-0 text-xs text-muted-foreground">
        {label}
      </span>
      <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-muted/30">
        <div
          className={`absolute inset-y-0 left-0 rounded-full ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-8 text-right text-xs font-medium text-foreground">
        {pct}%
      </span>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="border-b border-border px-5 py-4">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function ResultsPanel({
  taskId,
  outputs,
  status,
  onRetry,
  onApprove,
}: ResultsPanelProps) {
  const filteredOutputs = outputs.filter(
    (output) =>
      !output.stageName.startsWith("progress:") &&
      !output.stageName.startsWith("story:"),
  );

  const hasPendingApproval = filteredOutputs.some((output) => {
    if (
      filteredOutputs.some(
        (entry) => entry.stageName === "instagram_publish_result",
      )
    ) {
      return false;
    }

    if (
      output.stageName !== "marketing" &&
      output.stageName !== "marketing_draft"
    ) {
      return false;
    }

    const content = parseContent(output.content) as
      | Record<string, unknown>
      | string;
    return (
      typeof content === "object" &&
      content !== null &&
      content.status === "pending_approval"
    );
  });

  return (
    <aside className="flex min-h-0 w-full flex-col border-l border-border bg-background lg:w-[380px]">
      <div className="sticky top-0 z-10 border-b border-border bg-background/95 px-5 py-4 backdrop-blur">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-foreground">
              Ringkasan Eksekutif
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Task ID: {taskId.slice(0, 8)}
            </p>
          </div>
          <Badge
            variant="outline"
            className="rounded-full border-border bg-background"
          >
            {formatStatus(status)}
          </Badge>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {filteredOutputs.length === 0 ? (
          <div className="px-5 py-8 text-sm text-muted-foreground">
            Belum ada hasil yang siap ditampilkan untuk tugas ini.
          </div>
        ) : null}

        {filteredOutputs.map((output, index) => {
          const content = parseContent(output.content);

          if (output.stageName === "intelligence") {
            const record =
              typeof content === "object" && content !== null
                ? (content as Record<string, unknown>)
                : {};
            const facts = Array.isArray(record.keyFacts) ? record.keyFacts : [];
            const links = Array.isArray(record.referenceLinks)
              ? record.referenceLinks
              : [];

            return (
              <Section
                key={`${output.stageName}-${index}`}
                title="📋 Laporan Intelijen"
              >
                <div className="rounded-xl border-l-4 border-primary bg-primary/5 px-4 py-3 text-sm leading-relaxed text-foreground">
                  {plainText(record.executiveSummary)}
                </div>

                <div className="mt-4">
                  <div className="text-sm font-semibold text-foreground">
                    📌 Temuan Utama
                  </div>
                  <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm text-foreground">
                    {facts.map((fact) => (
                      <li key={String(fact)}>{plainText(fact)}</li>
                    ))}
                  </ol>
                </div>

                <div className="mt-4">
                  <div className="text-sm font-semibold text-foreground">
                    🔗 Sumber Referensi
                  </div>
                  <div className="mt-2 space-y-2">
                    {links.map((link) => renderLink(String(link)))}
                  </div>
                </div>

                <div className="mt-4">
                  <Badge className="rounded-full">
                    Status: {formatStatus(String(record.status ?? status))}
                  </Badge>
                </div>
              </Section>
            );
          }

          {
            /* P4: Audit report with independent verification */
          }
          if (output.stageName === "audit") {
            const record =
              typeof content === "object" && content !== null
                ? (content as Record<string, unknown>)
                : {};
            const riskNotes = Array.isArray(record.riskNotes)
              ? record.riskNotes
              : [];
            const verification = record.independentVerification as
              | Record<string, unknown>
              | undefined;
            const verifiedClaims = Array.isArray(verification?.verifiedClaims)
              ? (verification.verifiedClaims as string[])
              : [];
            const contradictedClaims = Array.isArray(
              verification?.contradictedClaims,
            )
              ? (verification.contradictedClaims as string[])
              : [];
            const verificationSources = Array.isArray(
              verification?.verificationSources,
            )
              ? (verification.verificationSources as string[])
              : [];
            const borderColor =
              contradictedClaims.length > 0
                ? "border-amber-500"
                : "border-emerald-500";

            return (
              <Section
                key={`${output.stageName}-${index}`}
                title="🔍 Laporan Audit Maya"
              >
                <div
                  className={`rounded-xl border-l-4 ${borderColor} bg-muted/10 px-4 py-3 text-sm leading-relaxed text-foreground`}
                >
                  {plainText(record.overallAssessment ?? record.summary)}
                </div>

                {riskNotes.length > 0 && (
                  <div className="mt-3">
                    <div className="text-sm font-semibold text-foreground">
                      ⚠️ Catatan Risiko
                    </div>
                    <ul className="mt-1 space-y-1 pl-4 text-sm text-foreground">
                      {riskNotes.map((note) => (
                        <li key={String(note)}>• {plainText(note)}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {verifiedClaims.length > 0 && (
                  <div className="mt-3">
                    <div className="text-sm font-semibold text-emerald-500">
                      ✅ Klaim Terverifikasi ({verifiedClaims.length})
                    </div>
                    <ul className="mt-1 space-y-1 pl-4 text-sm text-foreground">
                      {verifiedClaims.map((c) => (
                        <li key={c}>• {c}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {contradictedClaims.length > 0 && (
                  <div className="mt-3">
                    <div className="text-sm font-semibold text-amber-500">
                      ⚠️ Klaim Kontradiksi ({contradictedClaims.length})
                    </div>
                    <ul className="mt-1 space-y-1 pl-4 text-sm text-foreground">
                      {contradictedClaims.map((c) => (
                        <li key={c}>• {c}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {verificationSources.length > 0 && (
                  <div className="mt-3">
                    <div className="text-sm font-semibold text-foreground">
                      🔗 Sumber Verifikasi Independen
                    </div>
                    <div className="mt-1 space-y-1">
                      {verificationSources.map((s) => renderLink(s))}
                    </div>
                  </div>
                )}

                <div className="mt-3">
                  <Badge className="rounded-full">
                    Confidence:{" "}
                    {Math.round(Number(record.confidence ?? 0) * 100)}%
                  </Badge>
                </div>
              </Section>
            );
          }

          {
            /* P6: Marketing pre-publish review */
          }
          if (output.stageName === "marketing_pre_publish") {
            const record =
              typeof content === "object" && content !== null
                ? (content as Record<string, unknown>)
                : {};
            const decision = String(record.decision ?? "");
            const review = record.marketingReview as
              | Record<string, unknown>
              | undefined;
            const borderColor = decision.startsWith("approve")
              ? "border-emerald-500"
              : decision.startsWith("revise")
                ? "border-amber-500"
                : "border-red-500";

            return (
              <Section
                key={`${output.stageName}-${index}`}
                title="📊 Review Pak Bima (Pre-Publish)"
              >
                <div
                  className={`rounded-xl border-l-4 ${borderColor} bg-muted/10 px-4 py-3 text-sm leading-relaxed text-foreground`}
                >
                  <span className="font-semibold">
                    {decision.replace(/_/g, " ")}
                  </span>
                  {record.reason ? ` — ${plainText(record.reason)}` : ""}
                </div>

                {review && (
                  <div className="mt-3 space-y-2 rounded-xl bg-muted/5 px-4 py-3">
                    <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Skor Review
                    </div>
                    {renderScoreRow(
                      "Positioning",
                      Number(review.positioningScore ?? 0),
                    )}
                    {renderScoreRow(
                      "Audience Fit",
                      Number(review.audienceFitScore ?? 0),
                    )}
                    {renderScoreRow(
                      "Hook Strength",
                      Number(review.hookStrengthScore ?? 0),
                    )}
                    {renderScoreRow(
                      "Brief Alignment",
                      Number(review.briefAlignmentScore ?? 0),
                    )}
                    <div className="mt-1 text-xs font-medium text-foreground">
                      Verdict:{" "}
                      {String(review.overallVerdict ?? "").replace(/_/g, " ")}
                    </div>
                  </div>
                )}

                {Array.isArray(record.requiredChanges) &&
                  (record.requiredChanges as string[]).length > 0 && (
                    <div className="mt-3">
                      <div className="text-sm font-semibold text-foreground">
                        Perubahan Wajib
                      </div>
                      <ul className="mt-1 space-y-1 pl-4 text-sm text-foreground">
                        {(record.requiredChanges as string[]).map((c) => (
                          <li key={c}>• {c}</li>
                        ))}
                      </ul>
                    </div>
                  )}
              </Section>
            );
          }

          {
            /* P8: Chief final review */
          }
          if (output.stageName === "chief_final_review") {
            const record =
              typeof content === "object" && content !== null
                ? (content as Record<string, unknown>)
                : {};
            const decision = record.decision as
              | Record<string, unknown>
              | undefined;
            const finalStatus = String(decision?.final_status ?? "");
            const borderColor =
              finalStatus === "success"
                ? "border-emerald-500"
                : finalStatus === "failed"
                  ? "border-red-500"
                  : "border-blue-500";

            return (
              <Section
                key={`${output.stageName}-${index}`}
                title="🏛️ Final Review Pak Arga"
              >
                <div
                  className={`rounded-xl border-l-4 ${borderColor} bg-muted/10 px-4 py-3`}
                >
                  <div className="text-sm font-semibold text-foreground">
                    {plainText(decision?.verdict)}
                  </div>
                  {typeof decision?.user_facing_summary === "string" && (
                    <p className="mt-1 text-sm text-foreground/80">
                      {decision.user_facing_summary}
                    </p>
                  )}
                </div>

                {typeof decision?.reason === "string" &&
                  decision.reason !== decision.user_facing_summary && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      {decision.reason}
                    </p>
                  )}

                {Array.isArray(decision?.required_follow_up) &&
                  (decision.required_follow_up as string[]).length > 0 && (
                    <div className="mt-3">
                      <div className="text-sm font-semibold text-foreground">
                        Follow-up
                      </div>
                      <ul className="mt-1 space-y-1 pl-4 text-sm text-foreground">
                        {(decision.required_follow_up as string[]).map(
                          (item) => (
                            <li key={item}>• {item}</li>
                          ),
                        )}
                      </ul>
                    </div>
                  )}

                <div className="mt-3">
                  <Badge className="rounded-full">
                    Status: {formatStatus(finalStatus || status)}
                  </Badge>
                </div>
              </Section>
            );
          }

          if (output.stageName === "instagram_publish_result") {
            const record = parsePublishResult(output.content);
            const isPublished =
              record.status === "published" || Boolean(record.publicationUrl);

            return (
              <Section
                key={`${output.stageName}-${index}`}
                title="📣 Hasil Upload Instagram"
              >
                <div className="rounded-xl border-l-4 border-primary bg-primary/5 px-4 py-3 text-sm leading-relaxed text-foreground">
                  {getPublishStatusTone(record.status)}
                </div>

                <div className="mt-4 space-y-2 text-sm text-foreground">
                  {record.publicationUrl ? (
                    <div>
                      <div className="font-semibold">Link post</div>
                      {renderLink(record.publicationUrl)}
                    </div>
                  ) : null}
                  {record.publicationId ? (
                    <div>Publication ID: {record.publicationId}</div>
                  ) : null}
                  {record.mediaContainerId ? (
                    <div>Media Container ID: {record.mediaContainerId}</div>
                  ) : null}
                  {record.imageUrl ? (
                    <div>
                      <div className="font-semibold">Visual yang dipakai</div>
                      {renderLink(record.imageUrl)}
                    </div>
                  ) : null}
                  {record.caption ? (
                    <div>
                      <div className="font-semibold">Caption</div>
                      <div className="whitespace-pre-wrap">
                        {record.caption}
                      </div>
                    </div>
                  ) : null}
                  {!isPublished && record.errorReason ? (
                    <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3">
                      {record.errorReason}
                    </div>
                  ) : null}
                </div>
              </Section>
            );
          }

          if (
            output.stageName === "marketing" ||
            output.stageName === "marketing_draft"
          ) {
            const record =
              typeof content === "object" && content !== null
                ? (content as Record<string, unknown>)
                : {};
            const paragraphs = plainText(record.finalCopy)
              .split(/\n{2,}|\r\n\r\n/)
              .filter(Boolean);
            const [firstParagraph, ...restParagraphs] = paragraphs;

            return (
              <Section
                key={`${output.stageName}-${index}`}
                title="📝 Konten Marketing"
              >
                {firstParagraph ? (
                  <p className="text-sm font-semibold leading-relaxed text-foreground">
                    {firstParagraph}
                  </p>
                ) : null}
                <div className="mt-2 space-y-3 text-sm leading-relaxed text-foreground">
                  {restParagraphs.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Badge
                    variant="outline"
                    className="rounded-full border-border bg-background"
                  >
                    Format: {plainText(record.postFormat)}
                  </Badge>
                  <Badge className="rounded-full">
                    Status: {formatStatus(String(record.status ?? status))}
                  </Badge>
                </div>

                {typeof record.publicationUrl === "string" &&
                record.publicationUrl ? (
                  <div className="mt-4">
                    <div className="text-sm font-semibold text-foreground">
                      Link publikasi
                    </div>
                    <div className="mt-2">
                      {renderLink(record.publicationUrl)}
                    </div>
                  </div>
                ) : null}

                {typeof record.errorReason === "string" &&
                record.errorReason ? (
                  <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-foreground">
                    {plainText(record.errorReason)}
                  </div>
                ) : null}

                {hasPendingApproval ? (
                  <Button
                    type="button"
                    className="mt-4 w-full rounded-lg bg-green-600 text-white hover:bg-green-600/90"
                    onClick={() => onApprove(taskId)}
                  >
                    Setujui Draft
                  </Button>
                ) : null}
              </Section>
            );
          }

          if (output.stageName === "operations") {
            const record =
              typeof content === "object" && content !== null
                ? (content as Record<string, unknown>)
                : {};

            return (
              <Section
                key={`${output.stageName}-${index}`}
                title="💰 Laporan Operasional"
              >
                <div className="space-y-2 text-sm text-foreground">
                  <div>Total Tugas: {Number(record.totalTasksRun ?? 0)}</div>
                  <div>
                    Total Biaya:{" "}
                    {formatCurrency(Number(record.totalCostUsd ?? 0))}
                  </div>
                  <div>
                    Tingkat Gagal: {Number(record.failureRatePct ?? 0)}%
                  </div>
                  <div>
                    Rata-rata Durasi: {Number(record.avgDurationSeconds ?? 0)}{" "}
                    detik
                  </div>
                </div>
              </Section>
            );
          }

          if (output.stageName === "research_raw") {
            return (
              <Section
                key={`${output.stageName}-${index}`}
                title="🧾 Data Mentah Riset"
              >
                <Accordion type="single" collapsible>
                  <AccordionItem value="raw">
                    <AccordionTrigger>Buka data mentah</AccordionTrigger>
                    <AccordionContent>
                      <pre className="overflow-x-auto rounded-xl bg-muted p-3 text-xs text-foreground">
                        {plainText(content)}
                      </pre>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </Section>
            );
          }

          if (output.stageName === "system_error") {
            const record =
              typeof content === "object" && content !== null
                ? (content as Record<string, unknown>)
                : {};

            return (
              <Section
                key={`${output.stageName}-${index}`}
                title="❌ Terjadi Kesalahan"
              >
                <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-foreground">
                  {plainText(record.message)}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="mt-4 w-full rounded-lg"
                  onClick={() => onRetry(taskId)}
                >
                  🔄 Ulangi Tugas
                </Button>
              </Section>
            );
          }

          return (
            <Section
              key={`${output.stageName}-${index}`}
              title={output.stageName}
            >
              <div
                className={cn(
                  "rounded-xl bg-muted px-4 py-3 text-sm text-foreground",
                )}
              >
                <pre className="whitespace-pre-wrap break-words font-sans">
                  {plainText(content)}
                </pre>
              </div>
            </Section>
          );
        })}
      </div>

      <div className="border-t border-border px-5 py-4">
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            className="flex-1 rounded-lg"
            onClick={() => onRetry(taskId)}
          >
            Ulangi
          </Button>
          {hasPendingApproval ? (
            <Button
              type="button"
              className="flex-1 rounded-lg"
              onClick={() => onApprove(taskId)}
            >
              Setujui Draft
            </Button>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
