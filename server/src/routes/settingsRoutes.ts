import { Router } from 'express';
import { handleGetSettings, handleUpdateSettings } from '../controllers/settingsController';

const router = Router();

router.get('/', handleGetSettings);
router.post('/', handleUpdateSettings);

export default router;
