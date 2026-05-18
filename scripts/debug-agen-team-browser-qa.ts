#!/usr/bin/env tsx
import "dotenv/config";

import { chromium, expect, type Page } from "@playwright/test";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

async function waitForServer(timeoutMs = 120000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(`${BASE_URL}/sign-in`, {
        redirect: "manual",
      });
      if (response.status < 500) {
        return;
      }
    } catch {}

    await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  throw new Error(`Server at ${BASE_URL} did not become ready in time.`);
}

async function signUpFreshUser(page: Page, label: string) {
  const uniqueSuffix =
    Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const email = `playwright.agen-team.${label}.${uniqueSuffix}@example.com`;
  const name = `Agen Team QA ${label} ${uniqueSuffix}`;
  const password = "AgenTeam1234";

  await page.goto(`${BASE_URL}/sign-up/email`);

  await page.locator("#email").fill(email);
  await page.locator("#email").press("Enter");
  await page.locator("#name").waitFor({ state: "visible", timeout: 30000 });
  await page.locator("#name").fill(name);
  await page.locator("#name").press("Enter");
  await page.locator("#password").waitFor({
    state: "visible",
    timeout: 30000,
  });
  await page.locator("#password").fill(password);
  await page.locator("#password").press("Enter");

  await page.waitForURL(
    (url) => {
      const href = url.toString();
      return !href.includes("/sign-up") && !href.includes("/sign-in");
    },
    { timeout: 30000 },
  );
}

async function gotoAgenTeam(page: Page) {
  await page.goto(`${BASE_URL}/agen-team`);
  await expect(page.getByText("Pak Arga · Chief Agent")).toBeVisible({
    timeout: 30000,
  });
  await expect(
    page.getByText("Beri brief, lalu Pak Arga akan membagi kerja ke tim."),
  ).toBeVisible();
}

async function sendChiefMessage(page: Page, message: string) {
  const input = page.locator(".ProseMirror").last();
  await input.click();
  await page.keyboard.type(message, { delay: 12 });
  await page.keyboard.press("Enter");
}

async function waitForStoryMode(page: Page) {
  await expect(page.getByText("Mode cerita kantor")).toBeVisible({
    timeout: 45000,
  });
  await expect(page.getByRole("button", { name: "Pak Arga" })).toBeVisible();
}

async function isStoryModeVisible(page: Page) {
  return (await page.getByText("Mode cerita kantor").count()) > 0;
}

async function clickInteractiveOption(page: Page, index: number) {
  const locator = page.getByTestId(`interactive-option-${index}`);
  await expect(locator).toBeVisible({ timeout: 30000 });
  await locator.click();
}

async function runDirectTaskScenario() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await signUpFreshUser(page, "direct-task");
    await gotoAgenTeam(page);
    await sendChiefMessage(
      page,
      "Bantu riset tren AI 2026 dan buat draft konten sosmed.",
    );
    await waitForStoryMode(page);
    console.log("[browser-qa] direct task scenario passed");
  } finally {
    await browser.close();
  }
}

async function runResearchOnlyScenario() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await signUpFreshUser(page, "research-only");
    await gotoAgenTeam(page);
    await sendChiefMessage(page, "Bantu riset tren AI 2026");
    await waitForStoryMode(page);
    console.log("[browser-qa] research-only scenario passed");
  } finally {
    await browser.close();
  }
}

async function runClarificationScenario() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await signUpFreshUser(page, "clarification");
    await gotoAgenTeam(page);
    await sendChiefMessage(page, "kasih gua referensi");

    await expect(page.getByTestId("interactive-overlay-question")).toBeVisible({
      timeout: 30000,
    });
    await clickInteractiveOption(page, 0);
    await expect(page.getByTestId("interactive-overlay")).toHaveCount(0, {
      timeout: 30000,
    });

    await sendChiefMessage(page, "jasa perdagangan");

    for (let attempt = 0; attempt < 10; attempt++) {
      if (await isStoryModeVisible(page)) {
        break;
      }
      await page.waitForTimeout(1000);
    }

    if (!(await isStoryModeVisible(page))) {
      await sendChiefMessage(page, "perdagangan lokal kaya makanan hamburger");
    }

    await waitForStoryMode(page);
    console.log("[browser-qa] clarification scenario passed");
  } finally {
    await browser.close();
  }
}

async function runOutOfScopeScenario() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await signUpFreshUser(page, "out-of-scope");
    await gotoAgenTeam(page);
    await sendChiefMessage(page, "bantu gua bikin coding login page");

    await expect(
      page.getByText(
        /tim saya belum punya divisi yang tepat|fokus di riset\/intelijen dan konten sosial media/i,
      ),
    ).toBeVisible({ timeout: 30000 });
    await expect(page.getByText("Mode cerita kantor")).toHaveCount(0);
    console.log("[browser-qa] out-of-scope scenario passed");
  } finally {
    await browser.close();
  }
}

async function main() {
  await waitForServer();
  await runDirectTaskScenario();
  await runResearchOnlyScenario();
  await runClarificationScenario();
  await runOutOfScopeScenario();
  console.log("[browser-qa] all Agen Team scenarios passed");
}

main().catch((error) => {
  console.error("[browser-qa] failed", error);
  process.exitCode = 1;
});
