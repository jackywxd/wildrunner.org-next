import * as migration_20250929_111647 from './20250929_111647';
import * as migration_20260727_090312_add_authors_posts_galleries_site from './20260727_090312_add_authors_posts_galleries_site';
import * as migration_20260727_142704_add_media_stream_gallery_fields from './20260727_142704_add_media_stream_gallery_fields';
import * as migration_20260728_032809_add_user_roles from './20260728_032809_add_user_roles';
import * as migration_20260728_042531_add_content_owner from './20260728_042531_add_content_owner';
import * as migration_20260728_043828_add_invite_fields from './20260728_043828_add_invite_fields';
import * as migration_20260728_050120_add_user_author from './20260728_050120_add_user_author';
import * as migration_20260728_051251_add_storage_quota from './20260728_051251_add_storage_quota';
import * as migration_20260731_094323_add_race_records from './20260731_094323_add_race_records';
import * as migration_20260801_030616_add_race_schedule from './20260801_030616_add_race_schedule';
import * as migration_20260804_213708_add_post_race_record from './20260804_213708_add_post_race_record';
import * as migration_20260805_153543_add_race_domain_model from './20260805_153543_add_race_domain_model';
import * as migration_20260806_223655_add_media_race_edition from './20260806_223655_add_media_race_edition';
import * as migration_20260807_044106_add_race_record_refs from './20260807_044106_add_race_record_refs';
import * as migration_20260826_082505_add_media_transcode_state from './20260826_082505_add_media_transcode_state';

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
    name: '20260728_050120_add_user_author',
  },
  {
    up: migration_20260728_051251_add_storage_quota.up,
    down: migration_20260728_051251_add_storage_quota.down,
    name: '20260728_051251_add_storage_quota',
  },
  {
    up: migration_20260731_094323_add_race_records.up,
    down: migration_20260731_094323_add_race_records.down,
    name: '20260731_094323_add_race_records',
  },
  {
    up: migration_20260801_030616_add_race_schedule.up,
    down: migration_20260801_030616_add_race_schedule.down,
    name: '20260801_030616_add_race_schedule',
  },
  {
    up: migration_20260804_213708_add_post_race_record.up,
    down: migration_20260804_213708_add_post_race_record.down,
    name: '20260804_213708_add_post_race_record',
  },
  {
    up: migration_20260805_153543_add_race_domain_model.up,
    down: migration_20260805_153543_add_race_domain_model.down,
    name: '20260805_153543_add_race_domain_model',
  },
  {
    up: migration_20260806_223655_add_media_race_edition.up,
    down: migration_20260806_223655_add_media_race_edition.down,
    name: '20260806_223655_add_media_race_edition',
  },
  {
    up: migration_20260807_044106_add_race_record_refs.up,
    down: migration_20260807_044106_add_race_record_refs.down,
    name: '20260807_044106_add_race_record_refs',
  },
  {
    up: migration_20260826_082505_add_media_transcode_state.up,
    down: migration_20260826_082505_add_media_transcode_state.down,
    name: '20260826_082505_add_media_transcode_state'
  },
];
