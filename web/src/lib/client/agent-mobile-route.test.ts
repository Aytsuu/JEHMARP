import { afterEach, describe, expect, it } from "vitest";
import { resetAppViewportHeightForTests, syncAppViewportHeight } from "./agent-mobile-route";

describe("syncAppViewportHeight", () => {
  afterEach(() => {
    resetAppViewportHeightForTests();
  });

  it("sets --app-viewport-height from the provided viewport height", () => {
    syncAppViewportHeight(812.4);

    expect(document.documentElement.style.getPropertyValue("--app-viewport-height")).toBe("812px");
  });

  it("clears the inline viewport height override for tests", () => {
    syncAppViewportHeight(640);
    resetAppViewportHeightForTests();

    expect(document.documentElement.style.getPropertyValue("--app-viewport-height")).toBe("");
  });
});
