import { describe, expect, it } from "vitest";

import { parseAgentProfileUpdateFields } from "./agent-profile-update";

describe("agent profile update", () => {
  it("parses profile update fields with normalized email and contact", () => {
    const formData = new FormData();
    formData.set("employeeId", " EMP-42 ");
    formData.set("firstName", " Ana ");
    formData.set("lastName", " Agent ");
    formData.set("contact", "09171234567");
    formData.set("status", "active");
    formData.set("email", " Ana@Example.Test ");

    expect(parseAgentProfileUpdateFields(formData)).toEqual({
      employee_id: "EMP-42",
      first_name: "Ana",
      last_name: "Agent",
      display_name: "Ana Agent",
      contact: "09171234567",
      status: "active",
      email: "ana@example.test",
    });
  });

  it("allows empty employee ID and email", () => {
    const formData = new FormData();
    formData.set("employeeId", " ");
    formData.set("firstName", "Ana");
    formData.set("lastName", "Agent");
    formData.set("contact", "09170000000");
    formData.set("status", "inactive");
    formData.set("email", " ");

    expect(parseAgentProfileUpdateFields(formData)).toEqual({
      employee_id: null,
      first_name: "Ana",
      last_name: "Agent",
      display_name: "Ana Agent",
      contact: "09170000000",
      status: "inactive",
      email: null,
    });
  });

  it("parses address when the field is present", () => {
    const formData = new FormData();
    formData.set("employeeId", "EMP-42");
    formData.set("firstName", "Ana");
    formData.set("lastName", "Agent");
    formData.set("contact", "09171234567");
    formData.set("status", "active");
    formData.set("email", "ana@example.test");
    formData.set("address", "123 Main St");

    expect(parseAgentProfileUpdateFields(formData)).toEqual({
      employee_id: "EMP-42",
      first_name: "Ana",
      last_name: "Agent",
      display_name: "Ana Agent",
      contact: "09171234567",
      status: "active",
      email: "ana@example.test",
      address: "123 Main St",
    });
  });
});
