import "dotenv/config";
import mongoose from "mongoose";
import { connectDB } from "../database/DB";
import Admin from "../models/admin.model";

async function main() {
  const newName = process.argv[2];

  await connectDB();

  if (!newName) {
    console.log("Current Admins:");
    const admins = await Admin.find().select("name email role status");
    console.table(admins.map((a: any) => ({ ID: a._id?.toString(), Name: a.name, Email: a.email, Role: a.role })));
    console.log("\nUsage to change name:");
    console.log('  npx ts-node scripts/updateAdminName.ts "Your New Name" [optional_admin_email]');
    await mongoose.disconnect();
    return;
  }

  const targetEmail = process.argv[3];
  const query = targetEmail ? { email: targetEmail.toLowerCase().trim() } : {};

  const admin = await Admin.findOne(query);
  if (!admin) {
    console.error("❌ Admin account not found!");
    await mongoose.disconnect();
    return;
  }

  const oldName = admin.name;
  admin.name = newName.trim();
  await admin.save();

  console.log(`✅ Admin name successfully updated!`);
  console.log(`   Email: ${admin.email}`);
  console.log(`   Old Name: ${oldName}`);
  console.log(`   New Name: ${admin.name}`);

  await mongoose.disconnect();
}

main().catch(err => {
  console.error("Error updating admin name:", err);
  process.exit(1);
});
