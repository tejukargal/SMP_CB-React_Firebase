import { Router } from 'express';
import {
  handleCreateClearedBillBatch,
  handleGetClearedBillBatches,
  handleDeleteClearedBillBatch,
} from '../controllers/clearedBillBatchController';

const router = Router();

router.post('/', handleCreateClearedBillBatch);
router.get('/', handleGetClearedBillBatches);
router.delete('/:id', handleDeleteClearedBillBatch);

export default router;
