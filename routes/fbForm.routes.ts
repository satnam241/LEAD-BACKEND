import { Router } from 'express';
import { adminAuth } from '../middleware/adminAuth';
import {
  listFbForms,
  syncFbForms,
  mapFbForm,
} from '../controllers/fbForm.controller';

const router = Router();

router.get('/', adminAuth, listFbForms);
router.post('/sync', adminAuth, syncFbForms);
router.patch('/:formId', adminAuth, mapFbForm);

export default router;
