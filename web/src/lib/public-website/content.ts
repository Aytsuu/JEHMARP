import type { APIContext } from "astro";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type PublicPageRecord = {
  id: string;
  slug: string;
  title: string;
  status: "published";
  published_at: string | null;
};

export type PublicPageSectionRecord = {
  id: string;
  page_id: string;
  type: string;
  sort_order: number;
  content: Record<string, unknown>;
  status: "published";
};

export type PublicPageContent = {
  page: PublicPageRecord | null;
  sections: PublicPageSectionRecord[];
};

type SectionLike = {
  type?: string;
  content?: Record<string, unknown>;
};

export async function getPublicPageContent(
  context: Pick<APIContext, "cookies" | "request">,
  slug: string,
): Promise<PublicPageContent> {
  const supabase = createSupabaseServerClient(context);
  const { data: page, error: pageError } = await supabase
    .from("page")
    .select("id, slug, title, status, published_at")
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();

  if (pageError) {
    throw new Error(`Unable to load page content for ${slug}`);
  }

  if (!page) {
    return {
      page: null,
      sections: [],
    };
  }

  const { data: sections, error: sectionError } = await supabase
    .from("page_section")
    .select("id, page_id, type, sort_order, content, status")
    .eq("page_id", page.id)
    .eq("status", "published")
    .order("sort_order", { ascending: true });

  if (sectionError) {
    throw new Error(`Unable to load page sections for ${slug}`);
  }

  return {
    page: page as PublicPageRecord,
    sections: (sections ?? []) as PublicPageSectionRecord[],
  };
}

export function getSectionHeading(section: SectionLike): string {
  const heading = section.content?.heading;

  if (typeof heading === "string" && heading.trim().length > 0) {
    return heading.trim();
  }

  return toTitleCase(section.type ?? "section");
}

export function getSectionEntries(section: Pick<SectionLike, "content">) {
  return Object.entries(section.content ?? {}).flatMap(([key, value]) => {
    if (key === "heading" || value === null || value === undefined) {
      return [];
    }

    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      return [[toTitleCase(key), String(value)]];
    }

    return [];
  });
}

function toTitleCase(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim()
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}
