"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const mongoose_1 = __importDefault(require("mongoose"));
const DB_1 = require("../database/DB");
const project_model_1 = __importDefault(require("../models/project.model"));
async function seedSampleProject() {
    try {
        console.log('Connecting to database...');
        await (0, DB_1.connectDB)();
        const sampleSlug = 'sample-placeholder-residency';
        const existing = await project_model_1.default.findOne({ slug: sampleSlug });
        if (existing) {
            console.log('ℹ️ Sample placeholder project already exists. Skipping creation.');
            return;
        }
        const sampleProject = await project_model_1.default.create({
            name: 'Sample Placeholder Residency',
            slug: sampleSlug,
            keywords: ['sample', 'demo', 'placeholder', 'residency'],
            summary: 'A sample luxury residential development with modern amenities (PLACEHOLDER DATA - TO BE CONFIGURED BY ADMIN).',
            location: 'Sector 00, Sample City (PLACEHOLDER)',
            developer: 'Sample Infra Developers (PLACEHOLDER)',
            priceRange: '₹45 Lakhs - ₹95 Lakhs (PLACEHOLDER)',
            unitTypes: [
                { type: '2 BHK', sizeSqft: '1050 sq.ft.', priceFrom: '₹45 Lakhs (PLACEHOLDER)' },
                { type: '3 BHK', sizeSqft: '1550 sq.ft.', priceFrom: '₹75 Lakhs (PLACEHOLDER)' },
            ],
            amenities: ['Clubhouse', 'Swimming Pool', '24/7 Security', 'Kids Play Area', 'Gym'],
            possession: 'December 2026 (PLACEHOLDER)',
            reraNumber: 'PBRERA-SAMPLE-000-0000 (PLACEHOLDER)',
            paymentPlan: '10:80:10 Construction Linked Plan (PLACEHOLDER)',
            siteVisitInfo: 'Site visits available Mon-Sun 10 AM to 6 PM with advance booking (PLACEHOLDER).',
            currentOffers: 'Zero stamp duty for early bookings this month (PLACEHOLDER).',
            doNotSay: [
                'Do not commit to unverified handover dates',
                'Do not offer direct discounts without sales manager approval',
            ],
            faqs: [
                {
                    question: 'What unit configurations are available?',
                    answer: 'We have 2 BHK (1050 sq.ft.) starting from ₹45 Lakhs and 3 BHK (1550 sq.ft.) starting from ₹75 Lakhs.',
                    keywords: ['unit', 'configuration', '2bhk', '3bhk', 'flat'],
                },
                {
                    question: 'What is the possession date?',
                    answer: 'The project is scheduled for possession by December 2026.',
                    keywords: ['possession', 'ready', 'handover', 'completion'],
                },
                {
                    question: 'Can I visit the site?',
                    answer: 'Yes, site visits are available every day between 10 AM and 6 PM. We can schedule a personalized visit for you.',
                    keywords: ['visit', 'site visit', 'location visit', 'dekhne'],
                },
            ],
            isActive: true,
        });
        console.log(`✅ Sample placeholder project created with ID: ${sampleProject._id}`);
    }
    catch (err) {
        console.error('❌ Failed to seed sample project:', err.message || err);
    }
    finally {
        await mongoose_1.default.disconnect();
        console.log('Database disconnected.');
        process.exit(0);
    }
}
seedSampleProject();
//# sourceMappingURL=seedProject.js.map