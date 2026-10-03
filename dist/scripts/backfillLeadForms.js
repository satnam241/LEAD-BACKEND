"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const mongoose_1 = __importDefault(require("mongoose"));
const DB_1 = require("../database/DB");
const lead_model_1 = __importDefault(require("../models/lead.model"));
const fbForm_model_1 = __importDefault(require("../models/fbForm.model"));
async function backfillLeadForms() {
    try {
        console.log('Connecting to database...');
        await (0, DB_1.connectDB)();
        console.log('Scanning leads for missing or backfillable formId from rawData...');
        const cursor = lead_model_1.default.find({}).cursor();
        let totalLeads = 0;
        let alreadyHadFormId = 0;
        let successfullyBackfilled = 0;
        let couldNotBeBackfilled = 0;
        let projectIdsAssigned = 0;
        // Cache mapped forms
        const forms = await fbForm_model_1.default.find().lean();
        const formProjectMap = new Map();
        for (const f of forms) {
            if (f.projectId) {
                formProjectMap.set(f.formId, f.projectId);
            }
        }
        for await (const lead of cursor) {
            totalLeads++;
            if (lead.formId) {
                alreadyHadFormId++;
                // If lead doesn't have projectId but form has a mapped project, update it
                if (!lead.projectId && formProjectMap.has(lead.formId)) {
                    lead.projectId = formProjectMap.get(lead.formId);
                    await lead.save();
                    projectIdsAssigned++;
                }
                continue;
            }
            // Check if formId exists inside rawData
            let extractedFormId = null;
            let extractedFormName = null;
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
                    lead.projectId = formProjectMap.get(lead.formId);
                    projectIdsAssigned++;
                }
                await lead.save();
                successfullyBackfilled++;
            }
            else {
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
    }
    catch (err) {
        console.error('❌ Backfill failed:', err.message || err);
    }
    finally {
        await mongoose_1.default.disconnect();
        console.log('Database disconnected.');
        process.exit(0);
    }
}
backfillLeadForms();
//# sourceMappingURL=backfillLeadForms.js.map