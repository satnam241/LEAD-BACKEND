import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../database/DB';
import FbForm from '../models/fbForm.model';

const SEED_FORMS = [
  { id: '1080796244900243', name: 'PRISMA AD FORM', locale: 'en_US', suggestedProject: 'Prisma' },
  { id: '1307855747686824', name: 'Prisma form 1/10/2025', locale: 'en_US', suggestedProject: 'Prisma' },
  { id: '724809410322158', name: 'KLV Kothi form-Final', locale: 'en_US', suggestedProject: 'KLV Kothi' },
  { id: '1432121812250883', name: 'KLV Signature City Form', locale: 'en_US', suggestedProject: 'KLV Signature City' },
  { id: '24791584367188487', name: 'VIP ENCLAVE- RAJPURA', locale: 'en_US', suggestedProject: 'VIP Enclave Rajpura' },
  { id: '1230773331883201', name: 'vip encalve form 1', locale: 'en_US', suggestedProject: 'VIP Enclave Rajpura' },
  { id: '792837779977853', name: 'Swiss Garden Form 2', locale: 'en_US', suggestedProject: 'Swiss Garden' },
  { id: '783548254055578', name: 'Swiss Garden Form', locale: 'en_US', suggestedProject: 'Swiss Garden' },
  { id: '1365461461329625', name: 'swizz garden form', locale: 'en_US', suggestedProject: 'Swiss Garden' },
  { id: '1206527481239024', name: "Bhole baba investments 's form created on Mon Aug 18, 2025 5:44pm", locale: 'en_GB', suggestedProject: null },
  { id: '1046765507287141', name: "Bhole baba investments 's form created on Mon Aug 4, 2025 6:39pm", locale: 'en_US', suggestedProject: null },
  { id: '2080287112304180', name: "Bhole baba investments 's form created on Tue Mar 19, 2024 12:30pm", locale: 'en_US', suggestedProject: null },
  { id: '3580053738874856', name: "Bhole baba investments 's form created on Tue Aug 29, 2023 1:31pm", locale: 'en_US', suggestedProject: null },
  { id: '2615134195410139', name: "Bhole baba investments 's form created on Tue Mar 17, 2020 11:50pm", locale: 'en_US', suggestedProject: null },
  { id: '1818976688674141', name: 'Untitled form 4/30/25, 10:30 AM', locale: 'en_US', suggestedProject: null },
  { id: '496662690192886', name: 'Untitled form 4/10/25, 1:33 PM', locale: 'en_US', suggestedProject: null },
  { id: '1840737393033382', name: 'Messenger - 1710241683', locale: 'en_US', suggestedProject: null },
  { id: '2109341849452282', name: 'Messenger - 1710241671', locale: 'en_US', suggestedProject: null },
  { id: '1427120947907108', name: 'Messenger - 1710241660', locale: 'en_US', suggestedProject: null },
  { id: '1558896408240098', name: 'Messenger - 1710241655', locale: 'en_US', suggestedProject: null },
];

async function seedFbForms() {
  try {
    console.log('Connecting to database...');
    await connectDB();

    console.log(`Seeding ${SEED_FORMS.length} Facebook lead forms...`);
    let createdCount = 0;
    let updatedCount = 0;

    for (const f of SEED_FORMS) {
      const existing = await FbForm.findOne({ formId: f.id });

      if (existing) {
        // Update metadata without overwriting existing projectId or existing suggestedProject
        existing.name = f.name;
        existing.locale = f.locale;
        existing.status = 'ACTIVE';
        if (!existing.suggestedProject && f.suggestedProject) {
          existing.suggestedProject = f.suggestedProject;
        }
        existing.lastSyncedAt = new Date();
        await existing.save();
        updatedCount++;
      } else {
        await FbForm.create({
          formId: f.id,
          name: f.name,
          locale: f.locale,
          status: 'ACTIVE',
          suggestedProject: f.suggestedProject,
          projectId: null,
          lastSyncedAt: new Date(),
        });
        createdCount++;
      }
    }

    console.log(`✅ Seed complete! Created: ${createdCount}, Updated: ${updatedCount}, Total: ${SEED_FORMS.length}`);
  } catch (err: any) {
    console.error('❌ Seeding failed:', err.message || err);
  } finally {
    await mongoose.disconnect();
    console.log('Database disconnected.');
    process.exit(0);
  }
}

seedFbForms();
