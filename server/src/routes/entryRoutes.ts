import { Router } from 'express';
import {
  handleCreateEntry,
  handleGetEntries,
  handleUpdateEntry,
  handleDeleteEntry,
  handleResetEntries,
  handleRenameHead,
} from '../controllers/entryController';

const router = Router();

router.post('/', handleCreateEntry);
router.post('/rename-head', handleRenameHead);  // must be before /:id
router.get('/', handleGetEntries);
router.patch('/:id', handleUpdateEntry);
router.delete('/reset', handleResetEntries);    // must be before /:id
router.delete('/:id', handleDeleteEntry);

export default router;
