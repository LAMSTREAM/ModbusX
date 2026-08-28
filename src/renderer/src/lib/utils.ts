import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Merge class names, letting later Tailwind utilities win over earlier
 * conflicting ones.
 *
 * Note the limit that shapes how the density overrides in `ui-density.ts` are
 * written: `twMerge` resolves conflicts **within a modifier group**. `bg-x`
 * does not displace `dark:bg-y`, and `text-sm` does not displace
 * `md:text-[13px]` — they are different groups. Every override therefore has to
 * name each modifier it means to beat.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
