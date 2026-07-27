import * as migration_20250929_111647 from './20250929_111647';
import * as migration_20260727_090312_add_authors_posts_galleries_site from './20260727_090312_add_authors_posts_galleries_site';
import * as migration_20260727_142704_add_media_stream_gallery_fields from './20260727_142704_add_media_stream_gallery_fields';

export const migrations = [
  {
    up: migration_20250929_111647.up,
    down: migration_20250929_111647.down,
    name: '20250929_111647',
  },
  {
    up: migration_20260727_090312_add_authors_posts_galleries_site.up,
    down: migration_20260727_090312_add_authors_posts_galleries_site.down,
    name: '20260727_090312_add_authors_posts_galleries_site',
  },
  {
    up: migration_20260727_142704_add_media_stream_gallery_fields.up,
    down: migration_20260727_142704_add_media_stream_gallery_fields.down,
    name: '20260727_142704_add_media_stream_gallery_fields'
  },
];
