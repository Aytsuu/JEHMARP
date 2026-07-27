import {
  loadPlatformSettings,
  normalizeBusinessProfile,
  normalizeDefaults,
  normalizeDocumentNumbering,
  normalizeDocumentPayment,
  normalizeNotifications,
  savePlatformSettings,
} from "@/lib/platform-settings";
import { PRODUCT_IMAGE_BUCKET, isManagedStoragePath } from "@/lib/supabase/storage";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { createSupabaseServerClient } from "@/lib/supabase/server";
import type { NotificationEvent } from "@/lib/platform-settings";

type SupabaseServerClient = ReturnType<typeof createSupabaseServerClient>;
type SupabaseAdminClient = ReturnType<typeof createSupabaseAdminClient>;
type ProductImageFile = File & { name: string };

const allowedLogoMimeTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

function inferLogoExtension(file: ProductImageFile) {
  const nameExtension = file.name.split(".").pop()?.toLowerCase();
  if (nameExtension && /^[a-z0-9]+$/.test(nameExtension)) {
    return nameExtension;
  }

  switch (file.type) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    default:
      return "png";
  }
}

function resolveLogoMimeType(file: ProductImageFile) {
  if (file.type && allowedLogoMimeTypes.has(file.type)) {
    return file.type;
  }

  switch (inferLogoExtension(file)) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "gif":
      return "image/gif";
    default:
      return "";
  }
}

async function uploadPlatformLogo(adminClient: SupabaseAdminClient, file: ProductImageFile) {
  const contentType = resolveLogoMimeType(file);
  if (!contentType) {
    throw new Error("Logo must be a JPG, PNG, WebP, or GIF image.");
  }
  if (file.size > 2 * 1024 * 1024) {
    throw new Error("Logo must be 2 MB or smaller.");
  }

  const objectPath = `platform/logo-${crypto.randomUUID()}.${inferLogoExtension(file)}`;
  const { data, error } = await adminClient.storage.from(PRODUCT_IMAGE_BUCKET).upload(objectPath, file, {
    cacheControl: "3600",
    upsert: false,
    contentType,
  });

  if (error || !data?.path) {
    throw new Error("Unable to upload logo.");
  }

  return data.path;
}

async function removePlatformLogo(adminClient: SupabaseAdminClient, logoPath: string | null | undefined) {
  if (logoPath && isManagedStoragePath(logoPath)) {
    await adminClient.storage.from(PRODUCT_IMAGE_BUCKET).remove([logoPath]);
  }
}

export type PlatformSettingsAdminAction =
  | { type: "save-platform-settings-business-profile"; payload: ReturnType<typeof normalizeBusinessProfile>; logoFile: ProductImageFile | null; removeLogo: boolean }
  | { type: "save-platform-settings-document-payment"; payload: ReturnType<typeof normalizeDocumentPayment> }
  | { type: "save-platform-settings-defaults"; payload: ReturnType<typeof normalizeDefaults> }
  | { type: "save-platform-settings-notifications"; payload: ReturnType<typeof normalizeNotifications> }
  | { type: "save-platform-settings-document-numbering"; payload: ReturnType<typeof normalizeDocumentNumbering> }
  | { type: "change-admin-password"; currentPassword: string; newPassword: string; confirmPassword: string }
  | { type: "send-agent-password-reset"; email: string };

const PLATFORM_ACTIONS = [
  "save-platform-settings-business-profile",
  "save-platform-settings-document-payment",
  "save-platform-settings-defaults",
  "save-platform-settings-notifications",
  "save-platform-settings-document-numbering",
  "change-admin-password",
  "send-agent-password-reset",
] as const;

export function isPlatformSettingsAdminAction(actionName: string) {
  return (PLATFORM_ACTIONS as readonly string[]).includes(actionName);
}

function requiredString(formData: FormData, key: string) {
  const value = formData.get(key);
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${key} is required.`);
  return value.trim();
}

function optionalString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function optionalEmail(formData: FormData, key: string) {
  const value = optionalString(formData, key);
  if (!value) return "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw new Error(`${key} must be a valid email.`);
  return value;
}

export function parsePlatformSettingsAdminAction(actionName: string, formData: FormData): PlatformSettingsAdminAction {
  switch (actionName) {
    case "save-platform-settings-business-profile": {
      const logoFile = formData.get("logoFile");
      return {
        type: "save-platform-settings-business-profile",
        payload: normalizeBusinessProfile({
          tradeName: requiredString(formData, "tradeName"),
          legalName: optionalString(formData, "legalName"),
          address: requiredString(formData, "address"),
          phone: requiredString(formData, "phone"),
          tin: optionalString(formData, "tin"),
          logoPath: optionalString(formData, "logoPath") || null,
        }),
        logoFile: logoFile instanceof File && logoFile.size > 0 ? logoFile as ProductImageFile : null,
        removeLogo: formData.get("removeLogo") === "on",
      };
    }
    case "save-platform-settings-document-payment":
      return {
        type: "save-platform-settings-document-payment",
        payload: normalizeDocumentPayment({
          instructions: optionalString(formData, "paymentInstructions"),
          bankName: optionalString(formData, "bankName"),
          accountName: optionalString(formData, "accountName"),
          accountNumber: optionalString(formData, "accountNumber"),
          gcashNumber: optionalString(formData, "gcashNumber"),
          mayaNumber: optionalString(formData, "mayaNumber"),
        }),
      };
    case "save-platform-settings-defaults": {
      const creditLimit = Number(requiredString(formData, "customerCreditLimit"));
      if (!Number.isFinite(creditLimit) || creditLimit < 0) {
        throw new Error("Default customer credit limit must be zero or greater.");
      }
      return {
        type: "save-platform-settings-defaults",
        payload: normalizeDefaults({ customerCreditLimit: creditLimit }),
      };
    }
    case "save-platform-settings-notifications": {
      const events: NotificationEvent[] = ["new_order", "reseller_application", "contact_inquiry", "credit_alert"];
      return {
        type: "save-platform-settings-notifications",
        payload: normalizeNotifications({
          routes: events.map((event) => ({
            event,
            primaryEmail: optionalEmail(formData, `${event}PrimaryEmail`),
            secondaryEmail: optionalEmail(formData, `${event}SecondaryEmail`),
          })),
        }),
      };
    }
    case "save-platform-settings-document-numbering": {
      const invoiceNext = Number(requiredString(formData, "invoiceNext"));
      const orderSlipNext = Number(requiredString(formData, "orderSlipNext"));
      if (!Number.isFinite(invoiceNext) || invoiceNext < 1) throw new Error("Invoice next number must be at least 1.");
      if (!Number.isFinite(orderSlipNext) || orderSlipNext < 1) throw new Error("Order slip next number must be at least 1.");
      return {
        type: "save-platform-settings-document-numbering",
        payload: normalizeDocumentNumbering({
          invoicePrefix: requiredString(formData, "invoicePrefix"),
          invoiceNext,
          orderSlipPrefix: requiredString(formData, "orderSlipPrefix"),
          orderSlipNext,
        }),
      };
    }
    case "change-admin-password": {
      const currentPassword = requiredString(formData, "currentPassword");
      const newPassword = requiredString(formData, "newPassword");
      const confirmPassword = requiredString(formData, "confirmPassword");
      if (newPassword.length < 8) throw new Error("New password must be at least 8 characters.");
      if (newPassword !== confirmPassword) throw new Error("New password confirmation does not match.");
      return { type: "change-admin-password", currentPassword, newPassword, confirmPassword };
    }
    case "send-agent-password-reset": {
      const email = requiredString(formData, "agentEmail");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Agent email must be valid.");
      return { type: "send-agent-password-reset", email };
    }
    default:
      throw new Error("Unknown admin action.");
  }
}

export function getPlatformSettingsActionSuccessMessage(action: PlatformSettingsAdminAction) {
  switch (action.type) {
    case "save-platform-settings-business-profile": return "Business profile saved.";
    case "save-platform-settings-document-payment": return "Document payment details saved.";
    case "save-platform-settings-defaults": return "Defaults saved.";
    case "save-platform-settings-notifications": return "Notification routing saved.";
    case "save-platform-settings-document-numbering": return "Document numbering saved.";
    case "change-admin-password": return "Password updated.";
    case "send-agent-password-reset": return "Password reset email sent.";
  }
}

export async function executePlatformSettingsAdminAction(
  supabase: SupabaseServerClient,
  action: PlatformSettingsAdminAction,
  adminUserId: string,
  options: { adminEmail?: string | null; siteOrigin?: string } = {},
) {
  const adminClient = createSupabaseAdminClient();

  switch (action.type) {
    case "save-platform-settings-business-profile":
      return executeBusinessProfileSave(adminClient, action, adminUserId);
    case "save-platform-settings-document-payment":
      return savePlatformSettings(adminClient, { documentPayment: action.payload }, adminUserId);
    case "save-platform-settings-defaults":
      return savePlatformSettings(adminClient, { defaults: action.payload }, adminUserId);
    case "save-platform-settings-notifications":
      return savePlatformSettings(adminClient, { notifications: action.payload }, adminUserId);
    case "save-platform-settings-document-numbering":
      return savePlatformSettings(adminClient, { documentNumbering: action.payload }, adminUserId);
    case "change-admin-password":
      await executeAdminPasswordChange(supabase, action, options.adminEmail);
      return;
    case "send-agent-password-reset":
      await executeAgentPasswordReset(action, options.siteOrigin);
      return;
  }
}

async function executeBusinessProfileSave(
  adminClient: SupabaseAdminClient,
  action: Extract<PlatformSettingsAdminAction, { type: "save-platform-settings-business-profile" }>,
  adminUserId: string,
) {
  const current = await loadPlatformSettings(adminClient);
  let logoPath = action.payload.logoPath;
  if (action.removeLogo) {
    await removePlatformLogo(adminClient, logoPath);
    logoPath = null;
  }
  if (action.logoFile) {
    await removePlatformLogo(adminClient, current.businessProfile.logoPath);
    logoPath = await uploadPlatformLogo(adminClient, action.logoFile);
  }
  return savePlatformSettings(adminClient, { businessProfile: { ...action.payload, logoPath } }, adminUserId);
}

async function executeAdminPasswordChange(
  supabase: SupabaseServerClient,
  action: Extract<PlatformSettingsAdminAction, { type: "change-admin-password" }>,
  adminEmail?: string | null,
) {
  if (!adminEmail) throw new Error("Unable to verify the current admin account.");
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: adminEmail,
    password: action.currentPassword,
  });
  if (signInError) throw new Error("Current password is incorrect.");
  const { error } = await supabase.auth.updateUser({ password: action.newPassword });
  if (error) throw new Error(error.message || "Unable to update password.");
}

async function findAuthUserByEmail(adminClient: SupabaseAdminClient, email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const { data, error } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (error) throw new Error("Unable to validate agent email.");
  return (data?.users ?? []).find((item) => (item.email ?? "").trim().toLowerCase() === normalizedEmail) ?? null;
}

async function executeAgentPasswordReset(
  action: Extract<PlatformSettingsAdminAction, { type: "send-agent-password-reset" }>,
  siteOrigin?: string,
) {
  const adminClient = createSupabaseAdminClient();
  const authUser = await findAuthUserByEmail(adminClient, action.email);
  if (!authUser) throw new Error("No agent account was found for that email.");
  const { data: agent, error } = await adminClient.from("agent").select("id").eq("user_id", authUser.id).maybeSingle();
  if (error || !agent) throw new Error("That email does not belong to an agent account.");
  const { error: resetError } = await adminClient.auth.resetPasswordForEmail(action.email, {
    redirectTo: siteOrigin ? `${siteOrigin}/login` : undefined,
  });
  if (resetError) throw new Error(resetError.message || "Unable to send password reset email.");
}
