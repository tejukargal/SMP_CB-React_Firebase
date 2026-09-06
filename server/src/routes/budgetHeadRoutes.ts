import { Router } from 'express';
import {
  handleUpsertBudgetHead,
  handleGetBudgetHeads,
  handleSetBudgetHeadActive,
} from '../controllers/budgetHeadController';

const router = Router();

router.post('/', handleUpsertBudgetHead);
router.get('/', handleGetBudgetHeads);
router.patch('/:id/active', handleSetBudgetHeadActive);

export default router;
