// The one `cn`, re-exported. A second `twMerge` here would not know the
// `text-tag` size `tailwind.config.ts` adds, and would drop it whenever it met
// a `text-<colour>` — see the note on `cn` in `utils.ts`.
export { cn } from "@/lib/utils";
