import type { Metadata } from 'next';
import LoginForm from '@/components/LoginForm';

export const metadata: Metadata = {
  title: 'Login - Vexara',
};

export default function LoginPage() {
  return <LoginForm />;
}
