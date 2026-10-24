import type { Metadata } from 'next';
import LoginForm from '@/components/LoginForm';

export const metadata: Metadata = {
	title: { absolute: 'Sign In - Vexara' },
	description: 'Sign in to Vexara and return to your persistent 4X galaxy.',
	alternates: { canonical: '/login' },
	robots: { index: true, follow: true }
};

export default function LoginPage() {
	return <LoginForm />;
}
