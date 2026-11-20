"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const mongoose_1 = __importDefault(require("mongoose"));
const DB_1 = require("../database/DB");
const admin_model_1 = __importDefault(require("../models/admin.model"));
async function main() {
    const newName = process.argv[2];
    await (0, DB_1.connectDB)();
    if (!newName) {
        console.log("Current Admins:");
        const admins = await admin_model_1.default.find().select("name email role status");
        console.table(admins.map((a) => ({ ID: a._id?.toString(), Name: a.name, Email: a.email, Role: a.role })));
        console.log("\nUsage to change name:");
        console.log('  npx ts-node scripts/updateAdminName.ts "Your New Name" [optional_admin_email]');
        await mongoose_1.default.disconnect();
        return;
    }
    const targetEmail = process.argv[3];
    const query = targetEmail ? { email: targetEmail.toLowerCase().trim() } : {};
    const admin = await admin_model_1.default.findOne(query);
    if (!admin) {
        console.error("❌ Admin account not found!");
        await mongoose_1.default.disconnect();
        return;
    }
    const oldName = admin.name;
    admin.name = newName.trim();
    await admin.save();
    console.log(`✅ Admin name successfully updated!`);
    console.log(`   Email: ${admin.email}`);
    console.log(`   Old Name: ${oldName}`);
    console.log(`   New Name: ${admin.name}`);
    await mongoose_1.default.disconnect();
}
main().catch(err => {
    console.error("Error updating admin name:", err);
    process.exit(1);
});
//# sourceMappingURL=updateAdminName.js.map