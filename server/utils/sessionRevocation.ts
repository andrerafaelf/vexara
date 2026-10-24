// A JWT is revoked when it was issued before the user's last password change/reset.
// iat has whole-second resolution, so a token minted in the same second as the change
// (the fresh token returned by the change itself) gets 1s of slack.
const IAT_SLACK_MS = 1000;

export function isTokenRevoked(
	iat: number | undefined,
	passwordChangedAt: Date | null | undefined
): boolean {
	if (!passwordChangedAt) return false;
	if (typeof iat !== 'number') return true;
	return iat * 1000 < passwordChangedAt.getTime() - IAT_SLACK_MS;
}
