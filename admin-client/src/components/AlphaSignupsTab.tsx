import React, { useEffect, useState } from 'react';

const ADMIN_API_URL = process.env.NEXT_PUBLIC_ADMIN_API_URL || 'http://localhost:3002/api/admin';

interface PendingAlphaSignup {
	email: string;
	createdAt: string;
}

interface Props {
	showToast: (message: string, type: 'success' | 'error' | 'info') => void;
	adminFetch: (url: string, options?: RequestInit) => Promise<Response>;
}

const AlphaSignupsTab: React.FC<Props> = ({ showToast, adminFetch }) => {
	const [pending, setPending] = useState<PendingAlphaSignup[]>([]);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		loadPending();
		// eslint-disable-next-line
	}, []);

	const loadPending = async () => {
		setLoading(true);
		try {
			const res = await adminFetch(`${ADMIN_API_URL}/alpha-signups/pending`);
			const data = await res.json();
			setPending(Array.isArray(data) ? data : []);
		} catch {
			showToast('Failed to load pending signups', 'error');
		} finally {
			setLoading(false);
		}
	};

	const handleResend = async (email: string) => {
		try {
			const res = await adminFetch(`${ADMIN_API_URL}/alpha-signups/resend`, {
				method: 'POST',
				body: JSON.stringify({ email })
			});
			const data = await res.json();
			if (res.ok) {
				showToast(data.message || `Registration email sent to ${email}`, 'success');
			} else {
				showToast(data.error || 'Failed to send registration email', 'error');
			}
		} catch {
			showToast('Error sending registration email', 'error');
		}
	};

	return (
		<div>
			<h3>Alpha Registered Users (Not Yet Created Account)</h3>
			<p>Vexara alpha starts Saturday at 15:30 UTC</p>
			{loading ? (
				<div>Loading…</div>
			) : (
				<div className="users-tab-table-wrap">
					<table className="users-tab-table">
						<thead>
							<tr>
								<th>Email</th>
								<th>Signup Date</th>
								<th>Actions</th>
							</tr>
						</thead>
						<tbody>
							{pending.length === 0 && (
								<tr>
									<td
										colSpan={3}
										style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '32px 0' }}
									>
										No pending alpha signups
									</td>
								</tr>
							)}
							{pending.map((s) => (
								<tr key={s.email}>
									<td>{s.email}</td>
									<td>{new Date(s.createdAt).toLocaleString()}</td>
									<td>
										<button className="btn-action btn-notif" onClick={() => handleResend(s.email)}>
											Resend registration
										</button>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
		</div>
	);
};

export default AlphaSignupsTab;
