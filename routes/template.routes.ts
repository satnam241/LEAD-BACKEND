import { Router } from 'express';
import { listTemplates, createTemplate, updateTemplate, deleteTemplate, uploadTemplateImage } from '../controllers/template.controller';
import { upload } from '../middleware/upload';

const router = Router();

router.get('/', listTemplates);
router.post('/', createTemplate);
router.post('/upload', upload.single('image'), uploadTemplateImage);
router.put('/:id', updateTemplate);
router.delete('/:id', deleteTemplate);

export default router;