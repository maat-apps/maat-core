import { act, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider, useNavigate } from "react-router";
import { describe, expect, it } from "vitest";

import { useSmartBack } from "../src/smart-back";

function Detail() {
  const back = useSmartBack("/");
  return (
    <button type="button" onClick={back}>
      Back
    </button>
  );
}

function Home() {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => void navigate("/detail")}>
      Open
    </button>
  );
}

function setup(initialEntries: string[]) {
  const router = createMemoryRouter(
    [
      { path: "/", element: <Home /> },
      { path: "/detail", element: <Detail /> },
    ],
    { initialEntries },
  );
  render(<RouterProvider router={router} />);
  return router;
}

describe("useSmartBack", () => {
  it("pops history after an in-app navigation", async () => {
    const router = setup(["/"]);
    await act(() => screen.getByRole("button", { name: "Open" }).click());

    await act(() => screen.getByRole("button", { name: "Back" }).click());

    expect(router.state.location.pathname).toBe("/");
    expect(router.state.historyAction).toBe("POP");
  });

  it("replaces to the fallback on a deep link", async () => {
    const router = setup(["/detail"]);

    await act(() => screen.getByRole("button", { name: "Back" }).click());

    expect(router.state.location.pathname).toBe("/");
    expect(router.state.historyAction).toBe("REPLACE");
  });
});
