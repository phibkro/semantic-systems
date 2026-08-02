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
  const projectOrder = page.getByRole("list", { name: "Ordered roadmap projects" });
  const containmentOrder = page.getByRole("list", {
    name: "Ordered roadmap containment links",
  });
  const dependencyOrder = page.getByRole("list", {
    name: "Ordered roadmap dependency links",
  });
  await expect(projectOrder.getByRole("button").first()).toBeVisible();
  await expect(workOrder.getByRole("button").first()).toBeVisible();
  await expect(containmentOrder.getByText("milestone contains feature").first()).toBeVisible();
  await expect(dependencyOrder.getByText("prerequisite → dependent").first()).toBeVisible();
  await expect(dependencyOrder.getByText(/is a prerequisite for/).first()).toBeVisible();
  const graph = page.getByLabel("Interactive prerequisite skill tree");
  const graphNodes = page.locator(".react-flow__node");
  await expect(graph.locator('.react-flow__node[aria-label^="project "]').first()).toBeVisible();
  await expect(graph.getByText("contains", { exact: true }).first()).toBeVisible();
  await expect(graphNodes.first()).not.toHaveAttribute("tabindex");
  await expect(page.locator(".react-flow__edge").first()).not.toHaveAttribute("tabindex");

  await graph.scrollIntoViewIfNeeded();
  const graphWorkNodes = graph.locator(
    '.react-flow__node[aria-label^="milestone "], .react-flow__node[aria-label^="feature "]',
  );
  const visibleNodeIndex = await graphWorkNodes.evaluateAll((nodes) =>
    nodes.findIndex((node) => {
      const nodeBounds = node.getBoundingClientRect();
      const graphBounds = node.closest(".react-flow")?.getBoundingClientRect();
      if (graphBounds === undefined) return false;
      const centerX = nodeBounds.x + nodeBounds.width / 2;
      const centerY = nodeBounds.y + nodeBounds.height / 2;
      return (
        centerX >= graphBounds.x &&
        centerX <= graphBounds.right &&
        centerY >= graphBounds.y &&
        centerY <= graphBounds.bottom
      );
    }),
  );
  expect(visibleNodeIndex).toBeGreaterThanOrEqual(0);
  await graphWorkNodes.nth(visibleNodeIndex).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();

  const firstWork = workOrder.getByRole("button").first();
  await firstWork.focus();
  await page.keyboard.press("Enter");
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
