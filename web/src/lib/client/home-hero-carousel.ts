import { normalizeHeroSlides } from "@/lib/public-website/home-hero-slides";
import { resolvePublicStorageUrl } from "@/lib/supabase/storage";

const REFRESH_EVENT = "home-hero-carousel:refresh";
const INTERVAL_MS = 5000;

let autoPlayTimerId: number | undefined;
let carouselAbortController: AbortController | undefined;

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function getHeroRoot() {
  return document.querySelector<HTMLElement>(".home-hero");
}

function stopAutoPlay() {
  if (autoPlayTimerId !== undefined) {
    clearInterval(autoPlayTimerId);
    autoPlayTimerId = undefined;
  }
}

export function initHomeHeroCarousel() {
  carouselAbortController?.abort();
  carouselAbortController = new AbortController();
  const { signal } = carouselAbortController;

  const hero = getHeroRoot();
  if (!hero) {
    return;
  }

  const slides = [...hero.querySelectorAll<HTMLElement>(".home-hero__slide")];
  const dots = [...hero.querySelectorAll<HTMLButtonElement>(".home-hero__indicator-dot")];
  if (slides.length === 0 || dots.length === 0) {
    stopAutoPlay();
    return;
  }

  let currentSlide = slides.findIndex((slide) =>
    slide.classList.contains("home-hero__slide--active"),
  );
  if (currentSlide < 0) {
    currentSlide = 0;
  }

  function showSlide(index: number) {
    const normalizedIndex = ((index % slides.length) + slides.length) % slides.length;

    slides.forEach((slide, slideIndex) => {
      slide.classList.toggle("home-hero__slide--active", slideIndex === normalizedIndex);
    });

    dots.forEach((dot, dotIndex) => {
      const isActive = dotIndex === normalizedIndex;
      dot.classList.toggle("home-hero__indicator-dot--active", isActive);
      if (isActive) {
        dot.setAttribute("aria-current", "true");
      } else {
        dot.removeAttribute("aria-current");
      }
    });

    currentSlide = normalizedIndex;
  }

  function startAutoPlay() {
    stopAutoPlay();
    autoPlayTimerId = window.setInterval(() => {
      showSlide(currentSlide + 1);
    }, INTERVAL_MS);
  }

  dots.forEach((dot, index) => {
    dot.addEventListener(
      "click",
      () => {
        showSlide(index);
        startAutoPlay();
      },
      { signal },
    );
  });

  showSlide(currentSlide);
  startAutoPlay();
}

export function removeHomeHeroSlideAt(index: number) {
  const hero = getHeroRoot();
  if (!hero) {
    return;
  }

  const slides = [...hero.querySelectorAll<HTMLElement>(".home-hero__slide")];
  const dots = [...hero.querySelectorAll<HTMLButtonElement>(".home-hero__indicator-dot")];
  if (index < 0 || index >= slides.length) {
    return;
  }

  slides[index]?.remove();
  dots[index]?.remove();

  hero.querySelectorAll<HTMLElement>(".home-hero__slide").forEach((slide, slideIndex) => {
    slide.dataset.slideIndex = String(slideIndex);
  });

  hero.querySelectorAll<HTMLButtonElement>(".home-hero__indicator-dot").forEach((dot, dotIndex) => {
    dot.dataset.indicatorIndex = String(dotIndex);
    dot.setAttribute("aria-label", `Go to slide ${dotIndex + 1}`);
  });

  initHomeHeroCarousel();
}

export function syncHomeHeroCarouselFromSectionContent(content: Record<string, unknown>) {
  const hero = getHeroRoot();
  if (!hero) {
    return;
  }

  const slidesContainer = hero.querySelector<HTMLElement>(".home-hero__slides");
  const indicatorsContainer = hero.querySelector<HTMLElement>(".home-hero__indicators");
  if (!slidesContainer || !indicatorsContainer) {
    return;
  }

  const slides = normalizeHeroSlides(content.slides);

  slidesContainer.innerHTML = slides
    .map((slide, index) => {
      const displaySrc = resolvePublicStorageUrl(slide.src) ?? slide.src;
      return `<div class="home-hero__slide${index === 0 ? " home-hero__slide--active" : ""}" data-slide-index="${index}">
        <img src="${escapeHtml(displaySrc)}" alt="${escapeHtml(slide.alt)}" class="home-hero__slide-image" loading="${index === 0 ? "eager" : "lazy"}" decoding="async" />
      </div>`;
    })
    .join("");

  indicatorsContainer.innerHTML = slides
    .map((_, index) => {
      if (index === 0) {
        return `<button class="home-hero__indicator-dot home-hero__indicator-dot--active" aria-label="Go to slide 1" data-indicator-index="0" aria-current="true"></button>`;
      }

      return `<button class="home-hero__indicator-dot" aria-label="Go to slide ${index + 1}" data-indicator-index="${index}"></button>`;
    })
    .join("");

  initHomeHeroCarousel();
}

export function refreshHomeHeroCarousel() {
  initHomeHeroCarousel();
}

export function registerHomeHeroCarouselListeners() {
  document.addEventListener(REFRESH_EVENT, () => {
    initHomeHeroCarousel();
  });
}
