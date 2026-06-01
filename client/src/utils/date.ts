const LOCALE = undefined;

export function formatDate(input: string | number | Date): string {
	const d = new Date(input);
	return d.toLocaleDateString(LOCALE);
}

export function formatDateTime(input: string | number | Date): string {
	const d = new Date(input);
	return d.toLocaleString(LOCALE, {
		day: '2-digit',
		month: '2-digit',
		year: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
		hour12: false
	});
}

export function formatTimeOfDay(input: string | number | Date, detail = false): string {
	const d = new Date(input);

	return d.toLocaleTimeString(LOCALE, {
		hour: '2-digit',
		minute: '2-digit',
		...(detail && {
			second: '2-digit',
			fractionalSecondDigits: 3
		}),
		hour12: false
	});
}

export function formatShortDate(input: string | number | Date): string {
	const d = new Date(input);
	return d.toLocaleDateString(LOCALE, { day: '2-digit', month: '2-digit' });
}
