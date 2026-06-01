import { redirect } from 'next/navigation';

export default function AuthLegacyRedirect() {
	redirect('/login');
}
