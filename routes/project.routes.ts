import { Router } from 'express';
import { adminAuth } from '../middleware/adminAuth';
import {
  listProjects,
  getProjectById,
  createProject,
  updateProject,
  deactivateProject,
  uploadProjectMedia,
  deleteProjectMedia,
} from '../controllers/project.controller';
import { uploadMedia } from '../middleware/upload';

const router = Router();

router.get('/', adminAuth, listProjects);
router.get('/:id', adminAuth, getProjectById);
router.post('/', adminAuth, createProject);
router.put('/:id', adminAuth, updateProject);
router.patch('/:id/deactivate', adminAuth, deactivateProject);

// Media Upload & Delete routes for Project (Images, Videos, Map, Brochure)
router.post(
  '/:id/media',
  adminAuth,
  uploadMedia.fields([
    { name: 'images', maxCount: 10 },
    { name: 'videos', maxCount: 5 },
    { name: 'map', maxCount: 1 },
    { name: 'brochure', maxCount: 1 },
  ]),
  uploadProjectMedia
);
router.delete('/:id/media', adminAuth, deleteProjectMedia);

export default router;
