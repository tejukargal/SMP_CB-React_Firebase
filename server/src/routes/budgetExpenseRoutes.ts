import { Router } from 'express';
import {
  handleCreateBudgetExpense,
  handleGetBudgetExpenses,
  handleUpdateBudgetExpense,
  handleDeleteBudgetExpense,
} from '../controllers/budgetExpenseController';

const router = Router();

router.post('/', handleCreateBudgetExpense);
router.get('/', handleGetBudgetExpenses);
router.patch('/:id', handleUpdateBudgetExpense);
router.delete('/:id', handleDeleteBudgetExpense);

export default router;
