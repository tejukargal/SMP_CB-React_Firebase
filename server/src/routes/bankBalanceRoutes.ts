import { Router } from 'express';
import { handleGetBankBalances, handleSetBankBalance } from '../controllers/bankBalanceController';

const router = Router();

router.get('/', handleGetBankBalances);
router.post('/', handleSetBankBalance);

export default router;
