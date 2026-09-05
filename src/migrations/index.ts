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
import * as migration_20260826_072758_add_race_category_qualifiers from './20260826_072758_add_race_category_qualifiers';
import * as migration_20260826_082505_add_media_transcode_state from './20260826_082505_add_media_transcode_state';
import * as migration_20260827_054539_add_media_content_fingerprint from './20260827_054539_add_media_content_fingerprint';
import * as migration_20260827_062932_add_media_original_filesize from './20260827_062932_add_media_original_filesize';
import * as migration_20260827_233500_add_media_unused_since from './20260827_233500_add_media_unused_since';
import * as migration_20260829_041500_add_marathon_majors from './20260829_041500_add_marathon_majors';
import * as migration_20260830_090000_add_media_usage from './20260830_090000_add_media_usage';
import * as migration_20260830_090500_merge_gallery_items from './20260830_090500_merge_gallery_items';
import * as migration_20260901_200000_add_media_poster_url from './20260901_200000_add_media_poster_url';
import * as migration_20260901_213000_add_media_title from './20260901_213000_add_media_title';
import * as migration_20260902_120000_add_media_description from './20260902_120000_add_media_description';
import * as migration_20260902_160000_add_gallery_music_url from './20260902_160000_add_gallery_music_url';
import * as migration_20260903_090000_add_race_edition_music_url from './20260903_090000_add_race_edition_music_url';
import * as migration_20260903_091000_add_site_background_music from './20260903_091000_add_site_background_music';
import * as migration_20260903_120000_add_post_music_url from './20260903_120000_add_post_music_url';
import * as migration_20260904_010000_add_site_about from './20260904_010000_add_site_about';
import * as migration_20260904_120000_add_gallery_race_edition from './20260904_120000_add_gallery_race_edition';

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
    up: migration_20260826_072758_add_race_category_qualifiers.up,
    down: migration_20260826_072758_add_race_category_qualifiers.down,
    name: '20260826_072758_add_race_category_qualifiers',
  },
  {
    up: migration_20260826_082505_add_media_transcode_state.up,
    down: migration_20260826_082505_add_media_transcode_state.down,
    name: '20260826_082505_add_media_transcode_state',
  },
  {
    up: migration_20260827_054539_add_media_content_fingerprint.up,
    down: migration_20260827_054539_add_media_content_fingerprint.down,
    name: '20260827_054539_add_media_content_fingerprint',
  },
  {
    up: migration_20260827_062932_add_media_original_filesize.up,
    down: migration_20260827_062932_add_media_original_filesize.down,
    name: '20260827_062932_add_media_original_filesize'
  },
  {
    up: migration_20260827_233500_add_media_unused_since.up,
    down: migration_20260827_233500_add_media_unused_since.down,
    name: '20260827_233500_add_media_unused_since',
  },
  {
    up: migration_20260829_041500_add_marathon_majors.up,
    down: migration_20260829_041500_add_marathon_majors.down,
    name: '20260829_041500_add_marathon_majors',
  },
  {
    up: migration_20260830_090000_add_media_usage.up,
    down: migration_20260830_090000_add_media_usage.down,
    name: '20260830_090000_add_media_usage',
  },
  {
    up: migration_20260830_090500_merge_gallery_items.up,
    down: migration_20260830_090500_merge_gallery_items.down,
    name: '20260830_090500_merge_gallery_items',
  },
  {
    up: migration_20260901_200000_add_media_poster_url.up,
    down: migration_20260901_200000_add_media_poster_url.down,
    name: '20260901_200000_add_media_poster_url',
  },
  {
    up: migration_20260901_213000_add_media_title.up,
    down: migration_20260901_213000_add_media_title.down,
    name: '20260901_213000_add_media_title',
  },
  {
    up: migration_20260902_120000_add_media_description.up,
    down: migration_20260902_120000_add_media_description.down,
    name: '20260902_120000_add_media_description',
  },
  {
    up: migration_20260902_160000_add_gallery_music_url.up,
    down: migration_20260902_160000_add_gallery_music_url.down,
    name: '20260902_160000_add_gallery_music_url',
  },
  {
    up: migration_20260903_090000_add_race_edition_music_url.up,
    down: migration_20260903_090000_add_race_edition_music_url.down,
    name: '20260903_090000_add_race_edition_music_url',
  },
  {
    up: migration_20260903_091000_add_site_background_music.up,
    down: migration_20260903_091000_add_site_background_music.down,
    name: '20260903_091000_add_site_background_music',
  },
  {
    up: migration_20260903_120000_add_post_music_url.up,
    down: migration_20260903_120000_add_post_music_url.down,
    name: '20260903_120000_add_post_music_url',
  },
  {
    up: migration_20260904_010000_add_site_about.up,
    down: migration_20260904_010000_add_site_about.down,
    name: '20260904_010000_add_site_about',
  },
  {
    up: migration_20260904_120000_add_gallery_race_edition.up,
    down: migration_20260904_120000_add_gallery_race_edition.down,
    name: '20260904_120000_add_gallery_race_edition',
  },
];
