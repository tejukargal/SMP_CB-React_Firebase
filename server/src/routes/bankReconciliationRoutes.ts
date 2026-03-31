import { Router } from 'express';
import { handleGetReconciliation, handleSetReconciliationDate } from '../controllers/bankReconciliationController';

const router = Router();
router.get('/', handleGetReconciliation);
router.post('/', handleSetReconciliationDate);
export default router;
