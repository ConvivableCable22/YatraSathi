# YatraSathi Design System

## Brand foundation

- **Name:** YatraSathi
- **Tagline:** *Raaste naye, saath apna*
- **Character:** Warm, optimistic, curious, practical, and companionable.
- **Visual direction:** Contemporary Gen Z energy with editorial polish. Use bold typography, expressive destination imagery, vibrant intentional color, playful details, and confident conversational copy.
- **Avoid:** Forced slang, childish UI, clutter, low-contrast color, excessive gradients, and effects that distract from planning.

## Design principles

1. **Useful first:** Visual character supports the planning task.
2. **Mobile first:** Primary trip actions and critical information work on narrow screens.
3. **One product, many destinations:** Destination theming changes accents and decoration, not core navigation or meaning.
4. **Clear confidence:** Separate actual data, estimates, and community content.
5. **Accessible by default:** Color is never the only signal; maintain keyboard, screen-reader, and contrast support.

## Color tokens

Use semantic tokens in implementation; the values below are an initial direction and should be contrast-checked before shipping.

| Token | Suggested value | Use |
|---|---|---|
| `brand.ink` | `#17221F` | Primary text and dark surfaces |
| `brand.paper` | `#FFF9F0` | Warm background |
| `brand.saffron` | `#F5A623` | Primary action/accent |
| `brand.teal` | `#087E78` | Secondary accent and links |
| `brand.coral` | `#F27862` | Highlights and celebratory details |
| `surface.default` | `#FFFFFF` | Cards and content panels |
| `surface.muted` | `#F3F1EA` | Secondary panels |
| `text.primary` | `#17221F` | Main text |
| `text.secondary` | `#59635F` | Supporting text |
| `border.default` | `#D9DED9` | Dividers and control borders |
| `state.success` | `#247A4B` | Success feedback |
| `state.warning` | `#A85A00` | Warnings |
| `state.error` | `#B42318` | Errors |

Destination themes may override semantic accent tokens (for example, coastal teal or Rajasthan terracotta) but must not redefine status colors or weaken text contrast.

## Typography

- Choose a distinctive, readable display face for headings and a highly legible sans-serif for body/interface text.
- Use a clear hierarchy: expressive page title, concise section headings, readable body copy, and compact labels.
- Keep body text comfortable on mobile and avoid long all-caps labels.
- Load fonts efficiently and provide robust system fallbacks.

## Layout and shape

- Use a consistent spacing scale based on 4px or 8px increments.
- Use generous whitespace for marketing sections and compact, structured layouts for dense trip details.
- Cards may use softly rounded corners; reserve strong shapes or playful cutouts for occasional editorial moments.
- Keep important actions visually distinct and in predictable locations.
- Use responsive content widths and avoid horizontal overflow.

## Imagery and illustration

- Favor evocative, destination-specific Indian travel photography with clear licensing.
- Use photography as a focal point, not as a background that harms text legibility.
- Add map snippets, stamps, stickers, or hand-drawn accents sparingly.
- Do not use fabricated images or mock data in a way that implies verified destination facts.

## Components and states

Define consistent styles for navigation, buttons, forms, cards, tabs, badges, itinerary rows, map/list views, budget summaries, booking records, alerts, dialogs, and toasts.

Every interactive component needs hover/focus/active/disabled states. Forms need validation and error states. Data views need loading, empty, offline, pending-sync, and failure states where applicable.

## Motion and interaction

- Keep transitions short and purposeful.
- Use micro-interactions for saved places, progress, and small celebrations.
- Respect reduced-motion preferences.
- Never make essential information depend on animation.

## Accessibility baseline

- Meet WCAG 2.2 AA contrast targets for text and controls.
- Provide visible keyboard focus and logical focus order.
- Use semantic headings, labels, landmarks, and accessible names.
- Ensure touch targets are comfortably usable on mobile.
- Pair color with text, icon, or pattern for status communication.
