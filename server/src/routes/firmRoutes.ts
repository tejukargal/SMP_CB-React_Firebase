import { Router } from 'express';
import {
  handleUpsertFirm,
  handleGetFirms,
  handleDeleteFirm,
} from '../controllers/firmController';

const router = Router();

router.post('/', handleUpsertFirm);
router.get('/', handleGetFirms);
router.delete('/:id', handleDeleteFirm);

export default router;
