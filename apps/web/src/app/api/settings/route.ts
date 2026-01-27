import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { userSettings, users } from "@nexus/database";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";

// GET /api/settings - Get user settings
export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

    // Mask API keys for response
    const maskedGeminiKey = settings.geminiApiKey 
      ? `AI...${settings.geminiApiKey.slice(-4)}` 
      : null;
    const maskedOpenAiKey = settings.openaiApiKey 
      ? `sk-...${settings.openaiApiKey.slice(-4)}` 
      : null;
    const maskedAnthropicKey = settings.anthropicApiKey 
      ? `sk-...${settings.anthropicApiKey.slice(-4)}` 
      : null;
    const maskedGroqKey = settings.groqApiKey 
      ? `gsk_...${settings.groqApiKey.slice(-4)}` 
      : null;

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
        defaultModel: settings.defaultModel,
        autoSaveAiOutputs: settings.autoSaveAiOutputs,
        // User's own API keys
        geminiConnected: !!settings.geminiApiKey,
        openaiConnected: !!settings.openaiApiKey,
        anthropicConnected: !!settings.anthropicApiKey,
        groqConnected: !!settings.groqApiKey,
        // Server-side fallback availability
        serverGeminiAvailable: !!process.env.GEMINI_API_KEY,
        serverOpenaiAvailable: !!process.env.OPENAI_API_KEY,
        maskedGeminiKey,
        maskedOpenAiKey,
        maskedAnthropicKey,
        maskedGroqKey,
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
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const {
      // Profile updates
      name,
      // AI settings
      defaultModel,
      autoSaveAiOutputs,
      geminiApiKey,
      openaiApiKey,
      anthropicApiKey,
      groqApiKey,
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

    if (defaultModel !== undefined) settingsUpdate.defaultModel = defaultModel;
    if (autoSaveAiOutputs !== undefined) settingsUpdate.autoSaveAiOutputs = autoSaveAiOutputs;
    // Trim API keys to remove accidental whitespace
    if (geminiApiKey !== undefined) settingsUpdate.geminiApiKey = geminiApiKey?.trim() || null;
    if (openaiApiKey !== undefined) settingsUpdate.openaiApiKey = openaiApiKey?.trim() || null;
    if (anthropicApiKey !== undefined) settingsUpdate.anthropicApiKey = anthropicApiKey?.trim() || null;
    if (groqApiKey !== undefined) settingsUpdate.groqApiKey = groqApiKey?.trim() || null;
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
