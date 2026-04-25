// Limiti e costanti condivise v2b. Usati sia da services lato server sia
// (potenzialmente) da componenti UI per render preventivo dei vincoli.

export const MAX_PARTIES_PER_USER = 5
export const MAX_MEMBERS_PER_PARTY = 30
export const MAX_TOTAL_PARTIES = 100
export const PARTY_INACTIVITY_ARCHIVE_DAYS = 30
export const INVITE_TTL_DAYS = 7
// v2d: numero massimo di mappe coesistenti per party. Limite override-able
// via system setting `limits.maxMapsPerParty`.
export const MAX_MAPS_PER_PARTY = 10
