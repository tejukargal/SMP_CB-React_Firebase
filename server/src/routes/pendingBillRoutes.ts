import { Router } from 'express';
import {
  handleCreatePendingBill,
  handleGetPendingBills,
  handleUpdatePendingBill,
  handleDeletePendingBill,
} from '../controllers/pendingBillController';

const router = Router();

router.post('/', handleCreatePendingBill);
router.get('/', handleGetPendingBills);
router.patch('/:id', handleUpdatePendingBill);
router.delete('/:id', handleDeletePendingBill);

export default router;
