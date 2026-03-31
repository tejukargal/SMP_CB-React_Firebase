import express from 'express';
import cors from 'cors';
import { authMiddleware } from './middleware/authMiddleware';
import { errorHandler } from './middleware/errorHandler';
import entryRoutes from './routes/entryRoutes';
import settingsRoutes from './routes/settingsRoutes';
import importRoutes from './routes/importRoutes';
import bankBalanceRoutes from './routes/bankBalanceRoutes';
import bankReconciliationRoutes from './routes/bankReconciliationRoutes';

const app = express();

app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'] }));
// Increase limit to handle large import payloads (up to 10k entries)
app.use(express.json({ limit: '10mb' }));

// Health check (no auth)
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// Protected routes
app.use('/api/entries', authMiddleware, entryRoutes);
app.use('/api/settings', authMiddleware, settingsRoutes);
app.use('/api/import', authMiddleware, importRoutes);
app.use('/api/bank-balances', authMiddleware, bankBalanceRoutes);
app.use('/api/bank-reconciliation', authMiddleware, bankReconciliationRoutes);

app.use(errorHandler);

export default app;
