function syncCommissionCardHeight(row: HTMLElement) {
  const remittanceCard = row.querySelector<HTMLElement>("[data-agent-remittance-card]");
  const commissionCard = row.querySelector<HTMLElement>("[data-agent-commission-card]");

  if (!remittanceCard || !commissionCard) {
    return;
  }

  commissionCard.style.height = "";
  commissionCard.style.maxHeight = "";
  commissionCard.classList.remove("is-height-synced");

  const targetHeight = remittanceCard.offsetHeight;
  if (targetHeight > 0) {
    commissionCard.style.height = `${targetHeight}px`;
    commissionCard.style.maxHeight = `${targetHeight}px`;
    commissionCard.classList.add("is-height-synced");
  }
}

export function initAgentCommissionPreview(root: ParentNode = document) {
  const row = root.querySelector<HTMLElement>("[data-agent-commission-preview-row]");
  if (!row || row.dataset.commissionPreviewInitialized === "true") {
    return;
  }

  row.dataset.commissionPreviewInitialized = "true";

  const runSync = () => {
    syncCommissionCardHeight(row);
  };

  runSync();

  const remittanceCard = row.querySelector<HTMLElement>("[data-agent-remittance-card]");
  if (remittanceCard && "ResizeObserver" in window) {
    const observer = new ResizeObserver(() => {
      runSync();
    });
    observer.observe(remittanceCard);
  } else {
    window.addEventListener("resize", runSync);
  }
}
