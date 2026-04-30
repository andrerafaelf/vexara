import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import adminRoutes from './routes/admin.js';

dotenv.config({ path: '../server/.env' });

const app = express();
const ADMIN_USER = process.env.ADMIN_USER || 'andre';
const ADMIN_PASS = process.env.ADMIN_PASS || 'andre';

const requireAdminAuth = (req, res, next) => {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Basic ')) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Admin Console"');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const decoded = Buffer.from(authHeader.slice(6), 'base64').toString('utf8');
  const separatorIndex = decoded.indexOf(':');
  const username = separatorIndex >= 0 ? decoded.slice(0, separatorIndex) : '';
  const password = separatorIndex >= 0 ? decoded.slice(separatorIndex + 1) : '';

  if (username !== ADMIN_USER || password !== ADMIN_PASS) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Admin Console"');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  next();
};

app.use(cors());
app.use(express.json());

app.use('/api/admin', requireAdminAuth, adminRoutes);

const PORT = process.env.ADMIN_PORT || 3002;
app.listen(PORT, () => {
  console.log(`Admin server running on port ${PORT}`);
});
