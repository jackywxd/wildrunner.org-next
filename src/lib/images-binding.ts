import { getCloudflareContext } from '@opennextjs/cloudflare'

/**
 * The Cloudflare Images binding, for code that runs inside a request.
 *
 * Same reasoning as getR2Bucket (r2-bucket.ts): resolved independently of
 * payload.config so collections' hooks importing this don't form a cycle,
 * and only safe inside a request context.
 */
export async function getImagesBinding(): Promise<ImagesBinding> {
  const { env } = await getCloudflareContext({ async: true })
  const images = env.IMAGES
  if (!images) {
    throw new Error('IMAGES binding is not available in this context')
  }
  return images
}
