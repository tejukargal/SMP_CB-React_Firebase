import express from 'express';
import cors from 'cors';
import { authMiddleware } from './middleware/authMiddleware';
import { errorHandler } from './middleware/errorHandler';
import entryRoutes from './routes/entryRoutes';
import settingsRoutes from './routes/settingsRoutes';
import importRoutes from './routes/importRoutes';
import bankBalanceRoutes from './routes/bankBalanceRoutes';
import bankReconciliationRoutes from './routes/bankReconciliationRoutes';
import ledgerVerificationRoutes from './routes/ledgerVerificationRoutes';
import bankStatementRoutes from './routes/bankStatementRoutes';
import pendingBillRoutes from './routes/pendingBillRoutes';
import clearedBillBatchRoutes from './routes/clearedBillBatchRoutes';
import firmRoutes from './routes/firmRoutes';
import budgetHeadRoutes from './routes/budgetHeadRoutes';
import budgetAllocationRoutes from './routes/budgetAllocationRoutes';
import budgetExpenseRoutes from './routes/budgetExpenseRoutes';

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
app.use('/api/ledger-verification', authMiddleware, ledgerVerificationRoutes);
app.use('/api/bank-statements', authMiddleware, bankStatementRoutes);
app.use('/api/pending-bills', authMiddleware, pendingBillRoutes);
app.use('/api/cleared-batches', authMiddleware, clearedBillBatchRoutes);
app.use('/api/firms', authMiddleware, firmRoutes);
app.use('/api/budget-heads', authMiddleware, budgetHeadRoutes);
app.use('/api/budget-allocations', authMiddleware, budgetAllocationRoutes);
app.use('/api/budget-expenses', authMiddleware, budgetExpenseRoutes);

app.use(errorHandler);

export default app;
