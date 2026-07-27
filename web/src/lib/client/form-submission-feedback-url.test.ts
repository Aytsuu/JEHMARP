import { describe, expect, it } from "vitest";

import {
  CONTACT_INQUIRY_FEEDBACK_PARAMS,
  GUEST_ORDER_FEEDBACK_PARAMS,
  RESELLER_APPLICATION_FEEDBACK_PARAMS,
  buildPathWithFeedbackParamsRemoved,
} from "./form-submission-feedback-url";

describe("form-submission-feedback-url", () => {
  it("removes contact inquiry feedback params from the path", () => {
    const url = new URL(
      "https://example.test/contact?inquiry=submitted&message=ignored",
    );

    expect(
      buildPathWithFeedbackParamsRemoved(url, CONTACT_INQUIRY_FEEDBACK_PARAMS),
    ).toBe("/contact");
  });

  it("removes reseller application feedback params from the path", () => {
    const url = new URL(
      "https://example.test/business?application=error&message=Too%20many%20requests",
    );

    expect(
      buildPathWithFeedbackParamsRemoved(url, RESELLER_APPLICATION_FEEDBACK_PARAMS),
    ).toBe("/business");
  });

  it("removes guest order feedback params from the path", () => {
    const url = new URL(
      "https://example.test/shop?order=submitted&email=1&message=ignored&category=pork",
    );

    expect(
      buildPathWithFeedbackParamsRemoved(url, GUEST_ORDER_FEEDBACK_PARAMS),
    ).toBe("/shop?category=pork");
  });

  it("keeps unrelated query params", () => {
    const url = new URL(
      "https://example.test/contact?inquiry=submitted&preview=1",
    );

    expect(
      buildPathWithFeedbackParamsRemoved(url, CONTACT_INQUIRY_FEEDBACK_PARAMS),
    ).toBe("/contact?preview=1");
  });
});
