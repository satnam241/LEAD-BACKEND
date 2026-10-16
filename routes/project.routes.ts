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

// Safe Multer upload handler with error handling
const handleMediaUpload = (req: any, res: any, next: any) => {
  const uploadFields = uploadMedia.fields([
    { name: 'images', maxCount: 10 },
    { name: 'image', maxCount: 10 },
    { name: 'videos', maxCount: 5 },
    { name: 'video', maxCount: 5 },
    { name: 'map', maxCount: 1 },
    { name: 'brochure', maxCount: 1 },
  ]);

  uploadFields(req, res, (err: any) => {
    if (err) {
      console.error('[UploadMedia Error]:', err.message);
      return res.status(400).json({
        success: false,
        error: err.message || 'File upload failed. Please check file format and size limit.',
      });
    }
    next();
  });
};

// Media Upload & Delete routes for Project (Images, Videos, Map, Brochure)
router.post('/:id/media', adminAuth, handleMediaUpload, uploadProjectMedia);
router.delete('/:id/media', adminAuth, deleteProjectMedia);

export default router;
