import { Router } from 'express';
import { handleGetLedgerVerification, handleSetLedgerVerification } from '../controllers/ledgerVerificationController';

const router = Router();
router.get('/', handleGetLedgerVerification);
router.post('/', handleSetLedgerVerification);
export default router;
