import { Router } from 'express';
import {
  handleCreateClearedBillBatch,
  handleGetClearedBillBatches,
  handleDeleteClearedBillBatch,
  handleUpdateClearedBillBatch,
} from '../controllers/clearedBillBatchController';

const router = Router();

router.post('/', handleCreateClearedBillBatch);
router.get('/', handleGetClearedBillBatches);
router.patch('/:id', handleUpdateClearedBillBatch);
router.delete('/:id', handleDeleteClearedBillBatch);

export default router;
