import type { BrowserCommand } from "vitest/node";

/**
 * A real touch swipe (raw CDP touch events) from one point to another, in
 * the test iframe's CSS pixels. Base UI's drawer reacts to touch gestures,
 * not synthetic mouse drags, and userEvent has no touch API.
 */
export const touchSwipe: BrowserCommand<
  [
    from: { x: number; y: number },
    to: { x: number; y: number },
    frameWidth: number,
  ]
> = async (context, from, to, frameWidth) => {
  if (context.provider.name !== "playwright") {
    throw new Error("touchSwipe needs the playwright provider");
  }
  const page = context.page;
  const frame = await context.frame();
  const box = await (await frame.frameElement()).boundingBox();
  if (!box) throw new Error("test iframe not found");
  // The orchestrator may scale the iframe down to fit its viewport.
  const scale = box.width / frameWidth;
  const toPage = (point: { x: number; y: number }) => ({
    x: box.x + point.x * scale,
    y: box.y + point.y * scale,
    id: 1,
  });
  const client = await page.context().newCDPSession(page);
  const wait = (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, ms));
  const steps = 8;

  await client.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [toPage(from)],
  });
  for (let step = 1; step <= steps; step++) {
    await wait(16);
    await client.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        toPage({
          x: from.x + ((to.x - from.x) * step) / steps,
          y: from.y + ((to.y - from.y) * step) / steps,
        }),
      ],
    });
  }
  await wait(16);
  await client.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
};
