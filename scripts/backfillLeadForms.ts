import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../database/DB';
import Lead from '../models/lead.model';
import FbForm from '../models/fbForm.model';

async function backfillLeadForms() {
  try {
    console.log('Connecting to database...');
    await connectDB();

    console.log('Scanning leads for missing or backfillable formId from rawData...');
    const cursor = Lead.find({}).cursor();

    let totalLeads = 0;
    let alreadyHadFormId = 0;
    let successfullyBackfilled = 0;
    let couldNotBeBackfilled = 0;
    let projectIdsAssigned = 0;

    // Cache mapped forms
    const forms = await FbForm.find().lean();
    const formProjectMap = new Map<string, mongoose.Types.ObjectId>();
    for (const f of forms) {
      if (f.projectId) {
        formProjectMap.set(f.formId, f.projectId as mongoose.Types.ObjectId);
      }
    }

    for await (const lead of cursor) {
      totalLeads++;

      if (lead.formId) {
        alreadyHadFormId++;
        // If lead doesn't have projectId but form has a mapped project, update it
        if (!lead.projectId && formProjectMap.has(lead.formId)) {
          lead.projectId = formProjectMap.get(lead.formId)!;
          await lead.save();
          projectIdsAssigned++;
        }
        continue;
      }

      // Check if formId exists inside rawData
      let extractedFormId: string | null = null;
      let extractedFormName: string | null = null;

      if (lead.rawData) {
        if (typeof lead.rawData === 'object') {
          extractedFormId =
            lead.rawData.form_id ||
            lead.rawData.formId ||
            lead.rawData.ad_data?.form_id ||
            lead.rawData.ad_data?.formId ||
            null;

          extractedFormName =
            lead.rawData.form_name ||
            lead.rawData.formName ||
            null;
        }
      }

      if (extractedFormId) {
        lead.formId = String(extractedFormId);
        if (extractedFormName && !lead.formName) {
          lead.formName = String(extractedFormName);
        }
        if (!lead.projectId && formProjectMap.has(lead.formId)) {
          lead.projectId = formProjectMap.get(lead.formId)!;
          projectIdsAssigned++;
        }
        await lead.save();
        successfullyBackfilled++;
      } else {
        couldNotBeBackfilled++;
      }
    }

    console.log('\n================ BACKFILL REPORT ================');
    console.log(`Total Leads Processed:     ${totalLeads}`);
    console.log(`Already Had formId:        ${alreadyHadFormId}`);
    console.log(`Successfully Backfilled:   ${successfullyBackfilled}`);
    console.log(`Could Not Be Backfilled:   ${couldNotBeBackfilled} (no form_id in rawData; did not guess)`);
    console.log(`Project IDs Assigned:      ${projectIdsAssigned}`);
    console.log('=================================================\n');
  } catch (err: any) {
    console.error('❌ Backfill failed:', err.message || err);
  } finally {
    await mongoose.disconnect();
    console.log('Database disconnected.');
    process.exit(0);
  }
}

backfillLeadForms();
