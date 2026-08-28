import { cn } from './utils'

/**
 * Density and `dark:` overrides for shadcn primitives, in one place.
 *
 * Three rules govern everything in this file. They live here rather than in
 * eight call sites because eight call sites will not all remember them.
 *
 * ---
 *
 * **Rule 1 — twMerge is modifier-scoped.** `twMerge` only drops a conflicting
 * class *within the same group and the same modifier prefix*. `bg-transparent`
 * does **not** remove `dark:bg-input/30`; `text-[13px]` does **not** remove
 * `md:text-sm`. Every override has to ship its modifier-matched counterpart:
 * `dark:bg-transparent`, `md:text-[13px]`.
 *
 * **Rule 2 — every constant here is reconciled against the `dark:` inventory**
 * taken from the pinned shadcn version (4.19.0). Adding a constant means
 * re-running the inventory and pairing each surviving declaration with either a
 * deliberate keep or an explicit neutralizer. Cover *every modifier* the
 * inventory shows, not just the bare one: `dark:hover:bg-input/50` needs a
 * `dark:hover:` counterpart, and a plain `dark:` one does not reach it.
 *
 * Inventory as measured (`grep -ohE "dark:[^\"' ]+" components/ui/*.tsx | sort -u`):
 *
 * | Class                                 | Ships on                        | Disposition                                    |
 * | ------------------------------------- | ------------------------------- | ---------------------------------------------- |
 * | `dark:bg-input/30`                    | button, checkbox, input, select | **Neutralized** — translucent #27272a over an app surface |
 * | `dark:hover:bg-input/50`              | button, select                  | **Neutralized** — separate modifier from the above |
 * | `dark:hover:bg-accent/50`             | button (ghost/outline)          | **Neutralized** by the same `dark:hover:` counterpart |
 * | `dark:bg-destructive/60`              | button (destructive)            | **Neutralized** at the one call site that uses it |
 * | `dark:border-input`                   | button (outline)                | **Kept** — `--input` *is* our dark border, #27272a |
 * | `dark:data-[state=checked]:bg-primary`| checkbox                        | **Kept** — checked fill; reviewed at Step 15   |
 * | `dark:aria-invalid:ring-destructive/40` | button, checkbox, input, select, toggle | **Kept** — inert, no aria-invalid in this app |
 * | `dark:focus-visible:ring-destructive/40` | button                       | **Kept** — inert, same reason                  |
 *
 * **Rule 3 — every constant here is built with `cn()` at module load, and
 * consumed through `cn()`.** These strings deliberately contain internal
 * conflicts (`CONTROL_QUIET` overrides `CONTROL`'s `dark:bg-background` with
 * `dark:bg-cell`), and only `twMerge` resolves them. Spread onto a bare element
 * both would be emitted and Tailwind's source order — not intent — would pick
 * the winner. Building at module load also means zero per-render cost.
 *
 * ---
 *
 * Arithmetic against the pre-rewrite `inputBase`
 * (`height: 36px; padding: 0 10px; border-radius: 6px; font-size: 13px`):
 * `h-9` = 36px, `rounded-md` = 6px (via `--radius: 0.5rem`), `px-2.5` = 10px,
 * `text-[13px]` = 13px. Only padding, font-size, shadow and the `dark:` fills
 * need overriding — which is exactly what these constants do.
 */

/** The standard control surface: inputs, selects, and default buttons. */
export const CONTROL = cn(
  // `py-0` is a neutralizer too: shadcn's Input ships `py-1`, which shows up as
  // padding `4px 10px` where the pre-rewrite control was `0 10px`.
  'h-9 rounded-md bg-background px-2.5 py-0 text-[13px] md:text-[13px] shadow-none',
  // Neutralizers, per Rule 1. `md:text-[13px]` above is one too: shadcn's Input
  // ships `md:text-sm`, which a bare `text-[13px]` cannot displace.
  'dark:bg-background dark:hover:bg-background'
)

/** Quiet buttons that sit on the cell fill rather than the page background. */
export const CONTROL_QUIET = cn(CONTROL, 'bg-cell dark:bg-cell dark:hover:bg-cell')

/**
 * Section captions — the pre-rewrite `labelStyle` (12px / 600 / 6px below).
 *
 * `leading-normal` is a neutralizer: shadcn's Label ships `leading-none`, but
 * the pre-rewrite `<span>` inherited the body's 1.5. At 12px that is a 6px
 * height difference per label, which propagates into the panel heights below.
 */
export const LABEL = cn('mb-1.5 block text-xs leading-normal font-semibold text-foreground')

/** A row of controls — the pre-rewrite `rowStyle` (flex, 12px gap, wrap). */
export const ROW = cn('flex flex-wrap items-end gap-3')
