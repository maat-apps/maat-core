import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// The real stylesheet: Tailwind over this package's sources plus the
// shared theme, so media-query variants (phone-sized) and transitions
// behave as in an app.
import "./styles.css";

afterEach(() => {
  cleanup();
});
