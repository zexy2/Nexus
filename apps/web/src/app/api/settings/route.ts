import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifySession } from "@/lib/api-middleware";
import { unauthorized } from "@/lib/api-response";
import { userSettings, users } from "@nexus/database";
import { eq } from "drizzle-orm";
import { getAiProviderStatus, getAiUsageLimits, getAiUsageRemaining, isAdminEmail, isDemoEmail } from "@/lib/production-guardrails";

const SERVER_MANAGED_MODEL = "gemini-2.5-flash";

// GET /api/settings - Get user settings
export async function GET() {
  try {
    const session = await verifySession();
    if (!session) {
      return unauthorized();
    }

    // Get user settings or create default
    let settings = await db.query.userSettings.findFirst({
      where: eq(userSettings.userId, session.user.id),
    });

    // If no settings exist, create default settings
    if (!settings) {
      const [newSettings] = await db
        .insert(userSettings)
        .values({
          userId: session.user.id,
        })
        .returning();
      settings = newSettings;
    }

    // Get user profile info
    const user = await db.query.users.findFirst({
      where: eq(users.id, session.user.id),
    });
    const providerStatus = getAiProviderStatus();
    const email = user?.email || session.user.email;
    const usageLimits = getAiUsageLimits(isAdminEmail(email), isDemoEmail(email));
    const usageRemaining = await getAiUsageRemaining(session.user.id, email);

    return NextResponse.json({
      // Profile
      profile: {
        id: user?.id,
        name: user?.name || "User",
        email: user?.email || "",
        image: user?.image || null,
      },
      // AI Settings
      ai: {
        defaultModel: SERVER_MANAGED_MODEL,
        autoSaveAiOutputs: settings.autoSaveAiOutputs,
        keyManagement: "server",
        byokEnabled: false,
        serverAiAvailable: providerStatus.aiEnabled && providerStatus.geminiAvailable,
        serverGeminiAvailable: providerStatus.geminiAvailable,
        serverOpenaiAvailable: providerStatus.openaiAvailable,
        serverAnthropicAvailable: !!process.env.ANTHROPIC_API_KEY,
        serverGroqAvailable: !!process.env.GROQ_API_KEY,
        usageLimits: {
          workflowsPerDay: usageLimits.workflowDaily,
          chatMessagesPerDay: usageLimits.chatDaily,
          globalAiRequestsPerDay: usageLimits.globalDaily,
          maxStepsPerWorkflow: usageLimits.maxStepsPerWorkflow,
        },
        usageRemaining,
      },
      // Notifications
      notifications: {
        emailNotifications: settings.emailNotifications,
        agentNotifications: settings.agentNotifications,
        taskReminders: settings.taskReminders,
      },
      // Appearance
      appearance: {
        theme: settings.theme,
        compactMode: settings.compactMode,
      },
      // Sync
      sync: {
        offlineMode: settings.offlineMode,
        syncFrequency: settings.syncFrequency,
      },
    });
  } catch (error) {
    console.error("Error fetching settings:", error);
    return NextResponse.json(
      { error: "Failed to fetch settings" },
      { status: 500 }
    );
  }
}

// PATCH /api/settings - Update user settings
export async function PATCH(request: NextRequest) {
  try {
    const session = await verifySession();
    if (!session) {
      return unauthorized();
    }

    const body = await request.json();
    const {
      // Profile updates
      name,
      // AI settings
      autoSaveAiOutputs,
      // Notifications
      emailNotifications,
      agentNotifications,
      taskReminders,
      // Appearance
      theme,
      compactMode,
      // Sync
      offlineMode,
      syncFrequency,
    } = body;

    // Update user profile if name changed
    if (name !== undefined) {
      await db
        .update(users)
        .set({ name, updatedAt: new Date() })
        .where(eq(users.id, session.user.id));
    }

    // Build settings update object
    const settingsUpdate: Partial<typeof userSettings.$inferInsert> = {};

    settingsUpdate.defaultModel = SERVER_MANAGED_MODEL;
    if (autoSaveAiOutputs !== undefined) settingsUpdate.autoSaveAiOutputs = autoSaveAiOutputs;
    if (emailNotifications !== undefined) settingsUpdate.emailNotifications = emailNotifications;
    if (agentNotifications !== undefined) settingsUpdate.agentNotifications = agentNotifications;
    if (taskReminders !== undefined) settingsUpdate.taskReminders = taskReminders;
    if (theme !== undefined) settingsUpdate.theme = theme;
    if (compactMode !== undefined) settingsUpdate.compactMode = compactMode;
    if (offlineMode !== undefined) settingsUpdate.offlineMode = offlineMode;
    if (syncFrequency !== undefined) settingsUpdate.syncFrequency = syncFrequency;
    
    // Always update timestamp
    settingsUpdate.updatedAt = new Date();

    // Upsert settings
    if (Object.keys(settingsUpdate).length > 0) {
      const existingSettings = await db.query.userSettings.findFirst({
        where: eq(userSettings.userId, session.user.id),
      });

      if (existingSettings) {
        await db
          .update(userSettings)
          .set(settingsUpdate)
          .where(eq(userSettings.userId, session.user.id));
      } else {
        await db.insert(userSettings).values({
          userId: session.user.id,
          ...settingsUpdate,
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating settings:", error);
    return NextResponse.json(
      { error: "Failed to update settings" },
      { status: 500 }
    );
  }
}
