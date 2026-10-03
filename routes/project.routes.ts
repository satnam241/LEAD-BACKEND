import { Router } from 'express';
import { adminAuth } from '../middleware/adminAuth';
import {
  listProjects,
  getProjectById,
  createProject,
  updateProject,
  deactivateProject,
} from '../controllers/project.controller';

const router = Router();

router.get('/', adminAuth, listProjects);
router.get('/:id', adminAuth, getProjectById);
router.post('/', adminAuth, createProject);
router.put('/:id', adminAuth, updateProject);
router.patch('/:id/deactivate', adminAuth, deactivateProject);

export default router;
