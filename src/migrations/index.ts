import * as migration_20250929_111647 from './20250929_111647';
import * as migration_20260727_090312_add_authors_posts_galleries_site from './20260727_090312_add_authors_posts_galleries_site';
import * as migration_20260727_142704_add_media_stream_gallery_fields from './20260727_142704_add_media_stream_gallery_fields';
import * as migration_20260728_032809_add_user_roles from './20260728_032809_add_user_roles';
import * as migration_20260728_042531_add_content_owner from './20260728_042531_add_content_owner';
import * as migration_20260728_043828_add_invite_fields from './20260728_043828_add_invite_fields';
import * as migration_20260728_050120_add_user_author from './20260728_050120_add_user_author';

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
    name: '20260727_142704_add_media_stream_gallery_fields',
  },
  {
    up: migration_20260728_032809_add_user_roles.up,
    down: migration_20260728_032809_add_user_roles.down,
    name: '20260728_032809_add_user_roles',
  },
  {
    up: migration_20260728_042531_add_content_owner.up,
    down: migration_20260728_042531_add_content_owner.down,
    name: '20260728_042531_add_content_owner',
  },
  {
    up: migration_20260728_043828_add_invite_fields.up,
    down: migration_20260728_043828_add_invite_fields.down,
    name: '20260728_043828_add_invite_fields',
  },
  {
    up: migration_20260728_050120_add_user_author.up,
    down: migration_20260728_050120_add_user_author.down,
    name: '20260728_050120_add_user_author'
  },
];
