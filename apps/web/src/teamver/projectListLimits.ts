/** Home recent-projects rail — matches `RecentProjectsStrip` default limit. */
export const HOME_RECENT_LIST_LIMIT = 6;

/** One viewport page of cards (batch / coalesced fetch ceiling). */
export const PROJECT_LIST_VIEWPORT_BATCH = 12;

/** @deprecated use HOME_RECENT_LIST_LIMIT */
export const HOME_PUBLISH_CHIP_PREFETCH_LIMIT = HOME_RECENT_LIST_LIMIT;

/** @deprecated use PROJECT_LIST_VIEWPORT_BATCH */
export const PUBLISH_CHIP_BATCH_MAX = PROJECT_LIST_VIEWPORT_BATCH;

/** Max concurrent daemon `/files` fetches when warming home covers. */
export const HOME_COVER_FETCH_CONCURRENCY = 3;
