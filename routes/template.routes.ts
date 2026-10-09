import { Router } from 'express';
import {
  listTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  uploadTemplateImage,
  getDefaultTemplate,
  setDefaultTemplate,
} from '../controllers/template.controller';
import { upload } from '../middleware/upload';

const router = Router();

router.get('/', listTemplates);
router.get('/default', getDefaultTemplate);
router.patch('/:id/default', setDefaultTemplate);
router.post('/', createTemplate);
router.post('/upload', upload.single('image'), uploadTemplateImage);
router.put('/:id', updateTemplate);
router.delete('/:id', deleteTemplate);

export default router;