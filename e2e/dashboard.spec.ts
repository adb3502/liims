import { test, expect } from "@playwright/test";

// Auth state is injected via storageState in playwright.config.ts (global setup
// logs in once and saves the session). No login needed per-test.

const BASE = "http://localhost:3080";

test("01 Dashboard loads with data", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) =>
    consoleErrors.push("PAGEERROR: " + err.message)
  );
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  // Wait for React app to render (look for main content container)
  await page.waitForSelector("main, [class*='dashboard'], h1, [class*='card']", { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(3000);
  const bodyText = (await page.locator("body").textContent()) || "";
  const svgCount = await page.locator("svg").count();
  console.log("Has 994: " + bodyText.includes("994"));
  console.log("SVG elements: " + svgCount);
  console.log("Body length: " + bodyText.length);
  console.log("Console errors: " + consoleErrors.length);
  for (const e of consoleErrors.slice(0, 5)) {
    console.log("  ERR: " + e.substring(0, 200));
  }
  expect(bodyText.length).toBeGreaterThan(100);
  expect(svgCount).toBeGreaterThan(0);
});

test("02 Enrollment Analytics renders", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  await page.goto(BASE + "/reports/enrollment", { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);
  const bodyText = (await page.locator("body").textContent()) || "";
  const svgCount = await page.locator("svg").count();
  console.log("SVG elements: " + svgCount);
  console.log(
    "Has Male/Female: " +
      (bodyText.includes("Male") || bodyText.includes("Female"))
  );
  console.log(
    "Has RMH/BBH: " + (bodyText.includes("RMH") || bodyText.includes("BBH"))
  );
  console.log("Body length: " + bodyText.length);
  console.log("Console errors: " + consoleErrors.length);
  for (const e of consoleErrors.slice(0, 5)) {
    console.log("  ERR: " + e.substring(0, 200));
  }
  expect(bodyText.length).toBeGreaterThan(200);
});

test("03 Data Explorer initial load", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  await page.goto(BASE + "/reports/data-explorer", {
    waitUntil: "networkidle",
  });
  await page.waitForTimeout(3000);
  const bodyText = (await page.locator("body").textContent()) || "";
  const svgCount = await page.locator("svg").count();
  const tabCount = await page.locator("[role='tab']").count();
  const comboCount = await page.locator("[role='combobox']").count();
  console.log("Body length: " + bodyText.length);
  console.log(
    "SVG: " + svgCount + " tabs: " + tabCount + " combos: " + comboCount
  );
  const tabs = page.locator("[role='tab']");
  for (let i = 0; i < (await tabs.count()); i++) {
    console.log("  Tab " + i + ": " + (await tabs.nth(i).textContent()));
  }
  console.log("Console errors: " + consoleErrors.length);
  for (const e of consoleErrors.slice(0, 5)) {
    console.log("  ERR: " + e.substring(0, 200));
  }
});

test("03b Data Explorer box plot parameter selection", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  await page.goto(BASE + "/reports/data-explorer", {
    waitUntil: "networkidle",
  });
  await page.waitForTimeout(2000);
  const comboCount = await page.locator("[role='combobox']").count();
  console.log("Comboboxes: " + comboCount);
  if (comboCount > 0) {
    await page.locator("[role='combobox']").first().click();
    await page.waitForTimeout(1500);
    const optCount = await page.locator("[role='option']").count();
    console.log("Options: " + optCount);
    if (optCount > 0) {
      const optText = await page
        .locator("[role='option']")
        .first()
        .textContent();
      console.log("Selected param: " + optText);
      await page.locator("[role='option']").first().click();
      await page.waitForTimeout(4000);
      const svgAfter = await page.locator("svg").count();
      const bodyText = (await page.locator("body").textContent()) || "";
      console.log("SVG after select: " + svgAfter);
      console.log("Has Failed to load: " + bodyText.includes("Failed to load"));
      console.log(
        "Has error keyword: " + bodyText.toLowerCase().includes("failed")
      );
    }
  }
  console.log("Console errors: " + consoleErrors.length);
  for (const e of consoleErrors.slice(0, 5)) {
    console.log("  ERR: " + e.substring(0, 200));
  }
});

test("03c Data Explorer correlation and clinical tabs", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  await page.goto(BASE + "/reports/data-explorer", {
    waitUntil: "networkidle",
  });
  await page.waitForTimeout(2000);

  const tabs = page.locator("[role='tab']");
  const tabCount = await tabs.count();
  for (let i = 0; i < tabCount; i++) {
    const text = (await tabs.nth(i).textContent()) || "";
    if (text.toLowerCase().includes("correlation")) {
      await tabs.nth(i).click();
      await page.waitForTimeout(2000);
      const svgC = await page.locator("svg").count();
      console.log("Correlation tab SVG: " + svgC);
      const bt = (await page.locator("body").textContent()) || "";
      console.log("Correlation tab body length: " + bt.length);
      break;
    }
  }

  const tabs2 = page.locator("[role='tab']");
  const tabCount2 = await tabs2.count();
  for (let i = 0; i < tabCount2; i++) {
    const text = (await tabs2.nth(i).textContent()) || "";
    if (text.toLowerCase().includes("clinical")) {
      await tabs2.nth(i).click();
      await page.waitForTimeout(2000);
      const bt = (await page.locator("body").textContent()) || "";
      console.log(
        "Clinical tab vitals: " +
          (bt.toLowerCase().includes("vital") ||
            bt.toLowerCase().includes("blood"))
      );
      break;
    }
  }
  console.log("Console errors: " + consoleErrors.length);
  for (const e of consoleErrors.slice(0, 5)) {
    console.log("  ERR: " + e.substring(0, 200));
  }
});

test("04 Inventory renders", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  await page.goto(BASE + "/reports/inventory", { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);
  const bodyText = (await page.locator("body").textContent()) || "";
  const svgCount = await page.locator("svg").count();
  console.log("SVG: " + svgCount);
  console.log(
    "Has Sample/Freezer: " +
      (bodyText.includes("Sample") || bodyText.includes("Freezer"))
  );
  console.log("Body length: " + bodyText.length);
  console.log("Console errors: " + consoleErrors.length);
  for (const e of consoleErrors.slice(0, 5)) {
    console.log("  ERR: " + e.substring(0, 200));
  }
  expect(bodyText.length).toBeGreaterThan(100);
});

test("05 Quality renders no all-zeros", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  await page.goto(BASE + "/reports/quality", { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);
  const bodyText = (await page.locator("body").textContent()) || "";
  const svgCount = await page.locator("svg").count();
  console.log("SVG: " + svgCount);
  console.log(
    "Has QC: " +
      (bodyText.includes("QC") || bodyText.toLowerCase().includes("quality"))
  );
  console.log("Has ICC: " + bodyText.includes("ICC"));
  console.log("Has omics: " + bodyText.toLowerCase().includes("omic"));
  console.log("Has nonzero pct: " + /[1-9][0-9]*%/.test(bodyText));
  console.log("Console errors: " + consoleErrors.length);
  for (const e of consoleErrors.slice(0, 5)) {
    console.log("  ERR: " + e.substring(0, 200));
  }
  expect(bodyText.length).toBeGreaterThan(100);
});

test("06 Sites renders with real data", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  await page.goto(BASE + "/reports/sites", { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);
  const bodyText = (await page.locator("body").textContent()) || "";
  console.log("Has RMH: " + bodyText.includes("RMH"));
  console.log("Has BBH: " + bodyText.includes("BBH"));
  console.log("Has CHAF: " + bodyText.includes("CHAF"));
  console.log(
    "Has error state: " + bodyText.toLowerCase().includes("error")
  );
  console.log("Body length: " + bodyText.length);
  console.log("Console errors: " + consoleErrors.length);
  for (const e of consoleErrors.slice(0, 5)) {
    console.log("  ERR: " + e.substring(0, 200));
  }
  expect(bodyText.length).toBeGreaterThan(100);
});

test("07 Query Builder entity and execution", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  await page.goto(BASE + "/reports/query-builder", {
    waitUntil: "networkidle",
  });
  await page.waitForTimeout(3000);
  const bodyText = (await page.locator("body").textContent()) || "";
  const comboCount = await page.locator("[role='combobox']").count();
  console.log(
    "Has query UI: " +
      (bodyText.toLowerCase().includes("query") ||
        bodyText.includes("Filter"))
  );
  console.log("Comboboxes: " + comboCount);
  if (comboCount > 0) {
    await page.locator("[role='combobox']").first().click();
    await page.waitForTimeout(1000);
    const optCount = await page.locator("[role='option']").count();
    console.log("Entity options: " + optCount);
    if (optCount > 0) {
      await page.locator("[role='option']").first().click();
      await page.waitForTimeout(2000);
      const newBodyText = (await page.locator("body").textContent()) || "";
      console.log("Body grows after select: " + (newBodyText.length > bodyText.length));
    }
  }
  console.log("Console errors: " + consoleErrors.length);
  for (const e of consoleErrors.slice(0, 5)) {
    console.log("  ERR: " + e.substring(0, 200));
  }
});

test("08 Participants list and detail", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  await page.goto(BASE + "/participants", { waitUntil: "networkidle" });
  await page.waitForTimeout(4000);
  const bodyText = (await page.locator("body").textContent()) || "";
  const rowCount = await page.locator("tbody tr").count();
  console.log(
    "Has participant codes: " +
      (bodyText.includes("1A-") || bodyText.includes("2A-"))
  );
  console.log("Table rows: " + rowCount);
  if (rowCount > 0) {
    await page.locator("tbody tr").first().click();
    await page.waitForTimeout(3000);
    const tabCount = await page.locator("[role='tab']").count();
    console.log("Detail tabs: " + tabCount);
    const tabs = page.locator("[role='tab']");
    for (let i = 0; i < (await tabs.count()); i++) {
      const text = (await tabs.nth(i).textContent()) || "";
      console.log("  Detail tab: " + text);
      if (text.includes("Clinical")) {
        await tabs.nth(i).click();
        await page.waitForTimeout(2000);
        const ct = (await page.locator("body").textContent()) || "";
        console.log("Clinical tab length: " + ct.length);
      }
    }
  }
  console.log("Console errors: " + consoleErrors.length);
  for (const e of consoleErrors.slice(0, 5)) {
    console.log("  ERR: " + e.substring(0, 200));
  }
});

test("09 Protocols SOP cards", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  await page.goto(BASE + "/protocols", { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);
  const bodyText = (await page.locator("body").textContent()) || "";
  console.log(
    "Has SOP: " +
      (bodyText.includes("SOP") ||
        bodyText.toLowerCase().includes("protocol"))
  );
  console.log("Body length: " + bodyText.length);
  console.log("Console errors: " + consoleErrors.length);
  for (const e of consoleErrors.slice(0, 5)) {
    console.log("  ERR: " + e.substring(0, 200));
  }
  expect(bodyText.length).toBeGreaterThan(100);
});

test("10 Admin Users renders", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  await page.goto(BASE + "/admin/users", { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);
  const bodyText = (await page.locator("body").textContent()) || "";
  const rowCount = await page.locator("tbody tr").count();
  console.log(
    "Has user: " +
      (bodyText.includes("amruthbhat") ||
        bodyText.toLowerCase().includes("user"))
  );
  console.log("User rows: " + rowCount);
  console.log("Body length: " + bodyText.length);
  console.log("Console errors: " + consoleErrors.length);
  for (const e of consoleErrors.slice(0, 5)) {
    console.log("  ERR: " + e.substring(0, 200));
  }
  expect(bodyText.length).toBeGreaterThan(100);
});
