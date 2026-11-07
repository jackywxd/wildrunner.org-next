import { revalidatePath } from 'next/cache'

import { routePathsFor } from '@/lib/i18n/rewrites'

// revalidatePath throws outside an active Next.js request/server-action
// context (e.g. Payload Local API used from a standalone script). Cache
// busting is best-effort there, so swallow and log instead of failing
// the write that triggered it.
//
// `path` is the address a visitor types; each language's route path is what
// actually gets revalidated. See `routePathsFor` for why the two differ.
function safeRevalidatePath(path: string): boolean {
  try {
    for (const routePath of routePathsFor(path)) {
      revalidatePath(encodeURI(routePath))
    }
    return true
  } catch (error) {
    console.warn(`revalidatePath skipped for ${path} (no request context)`, error)
    return false
  }
}

export function revalidatePaths(paths?: string | string[] | null): boolean {
  if (typeof paths === 'string') {
    return safeRevalidatePath(paths)
  }

  if (Array.isArray(paths) && paths.length > 0) {
    return paths.map(safeRevalidatePath).some(Boolean)
  }

  return false
}
