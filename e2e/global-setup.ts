import { chromium } from "@playwright/test";

/**
 * Global setup: log in once and persist the browser storage state.
 * All test workers reuse this state, so no test ever performs a login
 * request — avoiding the in-memory rate limiter entirely.
 */
async function globalSetup() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.goto("http://localhost:3080/login", { waitUntil: "networkidle" });
  await page.waitForSelector("input[type='email']", { timeout: 15000 });

  await page.locator("input[type='email']").first().fill("amruthbhat@iisc.ac.in");
  await page.locator("input[type='password']").first().fill("Admin@123");
  await page.locator("button[type='submit']").click();

  await page.waitForURL(
    (url) => !url.toString().includes("/login"),
    { timeout: 15000 }
  );
  await page.waitForTimeout(2000);

  // Persist localStorage + cookies so every test starts already authenticated
  await page.context().storageState({ path: "./e2e/auth-state.json" });
  await browser.close();
  console.log("Global setup: auth state saved to e2e/auth-state.json");
}

export default globalSetup;
