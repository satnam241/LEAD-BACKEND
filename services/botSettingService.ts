import BotSetting from '../models/botSetting.model';
import Project from '../models/project.model';

export const GLOBAL_WELCOME_KEY = 'global_welcome_message';

/**
 * Returns the universal first message configured by admin for all leads.
 */
export async function getGlobalWelcomeMessage(): Promise<string> {
  try {
    const setting = await BotSetting.findOne({ key: GLOBAL_WELCOME_KEY }).lean();
    if (setting && typeof setting.value === 'string' && setting.value.trim()) {
      return setting.value.trim();
    }
  } catch (err: any) {
    console.error('[BotSetting] ❌ Error getting global welcome message:', err?.message || err);
  }
  return '';
}

/**
 * Saves or updates the universal first message for ALL incoming leads across CRM.
 */
export async function setGlobalWelcomeMessage(message: string): Promise<void> {
  try {
    const trimmed = (message || '').trim();
    await BotSetting.findOneAndUpdate(
      { key: GLOBAL_WELCOME_KEY },
      {
        $set: {
          value: trimmed,
          description: 'Universal first message sent automatically to all incoming leads',
        },
      },
      { upsert: true, new: true }
    );

    // Also sync to all projects so any project-level query also has it
    if (trimmed) {
      await Project.updateMany({}, { $set: { welcomeMessage: trimmed } }).catch(() => {});
    }

    console.log(`[BotSetting] ✅ Universal welcome message saved successfully (${trimmed.length} chars)`);
  } catch (err: any) {
    console.error('[BotSetting] ❌ Error saving global welcome message:', err?.message || err);
    throw err;
  }
}
