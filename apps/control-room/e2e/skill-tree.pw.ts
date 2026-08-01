import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const expectNoAxeViolations = async (page: Page, observation: string): Promise<void> => {
  const result = await new AxeBuilder({ page }).analyze();
  expect(result.violations, `${observation} has automatically detectable a11y violations`).toEqual(
    [],
  );
};

const openRoadmap = async (page: Page): Promise<void> => {
  await page.goto("/");
  await page.getByRole("tab", { name: /Roadmap/ }).click();
  await expect(page.getByLabel("PBK dependency roadmap")).toBeVisible();
};

test("phone operator follows the fixed prerequisite graph through ordered controls", async ({
  page,
}) => {
  await openRoadmap(page);
  await expect(page.getByLabel("Interactive prerequisite skill tree")).toBeVisible();
  await expect(page.getByText("No time axis.", { exact: false })).toBeVisible();

  const workOrder = page.getByRole("list", { name: "Ordered roadmap work nodes" });
  const dependencyOrder = page.getByRole("list", {
    name: "Ordered roadmap dependency links",
  });
  await expect(workOrder.getByRole("button").first()).toBeVisible();
  await expect(dependencyOrder.getByText("requires").first()).toBeVisible();
  await expect(page.locator(".react-flow__node").first()).not.toHaveAttribute("tabindex");
  await expect(page.locator(".react-flow__edge").first()).not.toHaveAttribute("tabindex");

  const firstWork = workOrder.getByRole("button").first();
  await firstWork.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "Definition of done" })).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "Typed relations" })).toBeVisible();
  await expectNoAxeViolations(page, "skill-tree exact work detail");
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expectNoAxeViolations(page, "skill-tree graph and ordered controls");
});

test("Mosaic focus preserves membership and focus across presentation changes", async ({
  page,
}) => {
  await openRoadmap(page);
  const workOrder = page.getByRole("list", { name: "Ordered roadmap work nodes" });
  const memberCount = await workOrder.getByRole("button").count();

  await page.getByRole("tab", { name: "Mosaic" }).click();
  await page.getByRole("button", { name: "Focus project" }).first().click();
  const focusPath = page.getByRole("navigation", { name: "Mosaic focus path" });
  await expect(focusPath).not.toHaveText(/^PBK Technologies$/);
  const containmentFocus = page.getByRole("button", { name: "Focus authored containment" });
  if ((await containmentFocus.count()) > 0) {
    await containmentFocus.first().click();
    await expect(
      page.getByRole("button", { name: "Clear containment focus" }).first(),
    ).toBeVisible();
  }
  await expect(workOrder.getByRole("button")).toHaveCount(memberCount);
  await expectNoAxeViolations(page, "focused skill-tree Mosaic");

  await page.getByRole("tab", { name: "Graph" }).click();
  await page.getByRole("tab", { name: "Mosaic" }).click();
  await expect(focusPath).not.toHaveText(/^PBK Technologies$/);
  if ((await containmentFocus.count()) > 0) {
    await expect(
      page.getByRole("button", { name: "Clear containment focus" }).first(),
    ).toBeVisible();
  }
  await expect(workOrder.getByRole("button")).toHaveCount(memberCount);
});
