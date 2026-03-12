import { Router } from 'express';
import { handleImportEntries } from '../controllers/importController';

const router = Router();

router.post('/', handleImportEntries);

export default router;
