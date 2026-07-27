import { ADMIN_JSON_ACTION_PATH } from "@/lib/admin-dashboard/json-action-path";

type AdminActionJsonResponse = {
  success: boolean;
  error?: string;
  status?: string;
};

async function submitSettingsAgentAction(formData: FormData) {
  const response = await fetch(ADMIN_JSON_ACTION_PATH, {
    method: "POST",
    body: formData,
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      "X-Requested-With": "XMLHttpRequest",
    },
  });

  const result = (await response.json()) as AdminActionJsonResponse;
  if (!response.ok || !result.success) {
    throw new Error(result.error || "Unable to complete this action.");
  }

  return result;
}

function getAgentRow(menuItem: HTMLElement) {
  return menuItem.closest<HTMLTableRowElement>("tr[data-agent-id]");
}

function updateAgentStatusLabel(row: HTMLTableRowElement, status: "active" | "inactive") {
  row.dataset.agentStatus = status;
  const statusCell = row.querySelector<HTMLElement>("[data-settings-agent-status]");
  if (statusCell) {
    statusCell.textContent = status === "active" ? "Active" : "Inactive";
  }
}

function refreshAgentMenuItems(row: HTMLTableRowElement) {
  const status = row.dataset.agentStatus === "active" ? "active" : "inactive";
  const toggleItem = row.querySelector<HTMLElement>('[data-action="toggle-agent-status"]');
  if (toggleItem) {
    toggleItem.textContent = status === "active" ? "Deactivate" : "Activate";
    toggleItem.dataset.nextStatus = status === "active" ? "inactive" : "active";
  }
}

export function initAdminSettingsAgents(root: ParentNode = document) {
  if (root instanceof HTMLElement && root.dataset.settingsAgentsInitialized === "true") {
    return;
  }

  if (root instanceof HTMLElement) {
    root.dataset.settingsAgentsInitialized = "true";
  }

  root.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const menuItem = target.closest<HTMLElement>("[data-action-menu-item]");
    if (!menuItem || !menuItem.closest("[data-admin-settings-agents]")) {
      return;
    }

    const action = menuItem.dataset.action;
    const row = getAgentRow(menuItem);
    const agentId = row?.dataset.agentId;

    if (!action || !row || !agentId) {
      return;
    }

    event.preventDefault();

    const formData = new FormData();

    if (action === "toggle-agent-status") {
      const nextStatus = menuItem.dataset.nextStatus;
      if (nextStatus !== "active" && nextStatus !== "inactive") {
        return;
      }

      formData.set("action", "set-agent-status");
      formData.set("agentId", agentId);
      formData.set("status", nextStatus);

      try {
        await submitSettingsAgentAction(formData);
        updateAgentStatusLabel(row, nextStatus);
        refreshAgentMenuItems(row);
      } catch (error) {
        window.alert(error instanceof Error ? error.message : "Unable to update agent status.");
      }

      return;
    }

    if (action === "reset-agent-password") {
      formData.set("action", "send-agent-password-reset");
      formData.set("agentId", agentId);

      try {
        const result = await submitSettingsAgentAction(formData);
        window.alert(result.status || "Password reset email sent.");
      } catch (error) {
        window.alert(error instanceof Error ? error.message : "Unable to send password reset email.");
      }
    }
  });
}
