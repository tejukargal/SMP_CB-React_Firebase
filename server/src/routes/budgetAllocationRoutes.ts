import { Router } from 'express';
import {
  handleUpsertBudgetAllocation,
  handleGetBudgetAllocations,
  handleDeleteBudgetAllocation,
} from '../controllers/budgetAllocationController';

const router = Router();

router.post('/', handleUpsertBudgetAllocation);
router.get('/', handleGetBudgetAllocations);
router.delete('/:id', handleDeleteBudgetAllocation);

export default router;
