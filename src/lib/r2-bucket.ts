import { getCloudflareContext } from '@opennextjs/cloudflare'

/**
 * The R2 bucket, for code that runs inside a request.
 *
 * Deliberately not imported from payload.config: that module imports every
 * collection, and the collections' hooks would import it back. Resolving the
 * binding independently keeps the cycle from forming.
 *
 * Only safe in a request context — `getCloudflareContext` has no bindings to
 * return from a CLI process. Scripts should go through getPlatformProxy
 * instead, the way payload.config does.
 */
export async function getR2Bucket(): Promise<R2Bucket> {
  const { env } = await getCloudflareContext({ async: true })
  const bucket = env.R2
  if (!bucket) {
    throw new Error('R2 binding is not available in this context')
  }
  return bucket
}
