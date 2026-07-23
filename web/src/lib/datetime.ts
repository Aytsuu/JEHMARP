const MANILA_OFFSET = "+08:00";

export function manilaDateInputValue(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(date);
}

export function manilaTimeInputValue(date = new Date()) {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Manila",
  }).format(date);
}

export function releaseSchedulePartsFromIso(value: string | null | undefined) {
  if (!value) {
    throw new Error("Release schedule is required.");
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Release schedule is invalid.");
  }

  return {
    date: manilaDateInputValue(parsed),
    time: manilaTimeInputValue(parsed),
  };
}

export function isDateOnlyString(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function isTimeString(value: string) {
  return /^\d{2}:\d{2}$/.test(value);
}

export function combineDateAndTime(date: string, time?: string | null) {
  if (!isDateOnlyString(date)) {
    throw new Error("Date must use YYYY-MM-DD format.");
  }

  const normalizedTime = time?.trim() || "00:00";

  if (!isTimeString(normalizedTime)) {
    throw new Error("Time must use HH:MM format.");
  }

  return new Date(`${date}T${normalizedTime}:00${MANILA_OFFSET}`).toISOString();
}

export function optionalDateTimeFromParts(date: string | null, time?: string | null) {
  if (!date) {
    return null;
  }

  return combineDateAndTime(date, time);
}

export function optionalDateTimeFromFormData(
  formData: FormData,
  dateKey: string,
  timeKey: string,
): string | null {
  return dateTimeFromFormData(formData, dateKey, timeKey);
}

export function requiredDateTimeFromFormData(
  formData: FormData,
  dateKey: string,
  timeKey: string,
): string {
  const value = dateTimeFromFormData(formData, dateKey, timeKey, { required: true });

  if (!value) {
    throw new Error(`${toSentenceLabel(dateKey)} is required.`);
  }

  return value;
}

export function requiredDateAndTimeFromFormData(
  formData: FormData,
  dateKey: string,
  timeKey: string,
): string {
  return requiredDateTimePartsFromFormData(formData, dateKey, timeKey).iso;
}

export function requiredDateTimePartsFromFormData(
  formData: FormData,
  dateKey: string,
  timeKey: string,
) {
  const dateValue = normalizeFormDataEntry(formData.get(dateKey));
  const timeValue = normalizeFormDataEntry(formData.get(timeKey));

  if (!dateValue) {
    throw new Error(`${toSentenceLabel(dateKey)} is required.`);
  }

  if (!timeValue) {
    throw new Error(`${toSentenceLabel(timeKey)} is required.`);
  }

  return {
    date: dateValue,
    time: timeValue,
    iso: combineDateAndTime(dateValue, timeValue),
  };
}

export function dateTimeFromFormData(
  formData: FormData,
  dateKey: string,
  timeKey: string,
  options: { required?: boolean } = {},
) {
  const dateValue = normalizeFormDataEntry(formData.get(dateKey));
  const timeValue = normalizeFormDataEntry(formData.get(timeKey));

  if (!dateValue) {
    if (options.required) {
      throw new Error(`${toSentenceLabel(dateKey)} is required.`);
    }

    return null;
  }

  return combineDateAndTime(dateValue, timeValue || null);
}

function normalizeFormDataEntry(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function toSentenceLabel(value: string) {
  return value
    .replace(/([A-Z])/g, " $1")
    .replace(/[_-]+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/^./, (letter) => letter.toUpperCase());
}
