import { Router } from 'express';
import {
  handleCreateClearedBillBatch,
  handleGetClearedBillBatches,
} from '../controllers/clearedBillBatchController';

const router = Router();

router.post('/', handleCreateClearedBillBatch);
router.get('/', handleGetClearedBillBatches);

export default router;
