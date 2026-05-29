// Bump these three constants in the SAME commit that adds a new
// PATCH_NOTES_ALPHA_<version>.md file under client/public/patch-notes/.
//
// The version is the localStorage key the in-game prompt compares against
// to decide whether to surface "new patch" UI. A player who has already
// dismissed v0.13 will not see the prompt again until LATEST_PATCH_VERSION
// changes.
//
// Why this isn't auto-derived from the patch-notes directory:
//   - The patch-notes page is server-rendered (filesystem read). The
//     in-game toast renders client-side and would need either a separate
//     API endpoint or a build-time generated file to read the version.
//   - The manual bump is one line per release, hard to forget if it lives
//     in the same PR as the notes themselves.
// If "I forgot to bump it" becomes a real pattern, swap to a build step
// that globs the directory and writes this file. Until then: simpler wins.

export const LATEST_PATCH_VERSION = '0.13';
export const LATEST_PATCH_LABEL = 'Alpha v0.13';
export const LATEST_PATCH_HEADLINE = 'Navigation polish + smart back button';
