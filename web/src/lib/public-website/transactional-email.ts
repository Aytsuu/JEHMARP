export function resolveTransactionalEmailFrom(input: {
  resellerPriceListFrom?: string;
  tradeName?: string;
  primaryEmail?: string;
}): string | null {
  const configuredFrom = input.resellerPriceListFrom?.trim();
  if (configuredFrom) {
    return configuredFrom;
  }

  const tradeName = input.tradeName?.trim();
  const primaryEmail = input.primaryEmail?.trim();

  if (tradeName && primaryEmail) {
    return `${tradeName} <${primaryEmail}>`;
  }

  if (primaryEmail) {
    return primaryEmail;
  }

  return null;
}
