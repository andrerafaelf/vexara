import bcrypt from 'bcryptjs';

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function comparePassword(candidatePassword: string, hashedPassword: string): Promise<boolean> {
  return bcrypt.compare(candidatePassword, hashedPassword);
}
