import { ToolCall, AppSession } from '@mentra/sdk';
import { DashboardHub } from './dashboard';

/**
 * Handle a tool call from MentraOS.
 */
export async function handleToolCall(
  toolCall: ToolCall,
  userId: string,
  session: AppSession | undefined,
  dashboardHub: DashboardHub,
): Promise<string | undefined> {
  console.log(`Tool called: ${toolCall.toolId}`);
  console.log(`Tool call timestamp: ${toolCall.timestamp}`);
  console.log(`Tool call userId: ${toolCall.userId}`);

  if (toolCall.toolParameters && Object.keys(toolCall.toolParameters).length > 0) {
    console.log('Tool call parameter values:', toolCall.toolParameters);
  }

  if (toolCall.toolId === 'ask_homelab_assistant') {
    const prompt = String(toolCall.toolParameters?.prompt ?? '').trim();
    if (!prompt) {
      return 'Please provide a prompt for the homelab assistant.';
    }

    dashboardHub.addNotification({
      title: 'Tool call: homelab assistant',
      body: prompt,
      source: 'mentra-tool',
      priority: 'normal',
    });

    try {
      const result = await dashboardHub.handleAssistantCommand(prompt, userId, 'mentra-tool');
      session?.layouts.showTextWall(result.reply.slice(0, 480));
      return result.reply;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Assistant request failed';
      dashboardHub.addNotification({
        title: 'Assistant tool error',
        body: message,
        source: 'mentra-tool',
        priority: 'high',
      });
      return message;
    }
  }

  if (toolCall.toolId === 'refresh_dashboard') {
    dashboardHub.addNotification({
      title: 'Dashboard refresh requested',
      body: 'A refresh was requested from a MentraOS tool call.',
      source: 'mentra-tool',
      priority: 'low',
    });
    dashboardHub.broadcast({ type: 'refresh-requested' });
    return 'Dashboard refresh requested.';
  }

  return undefined;
}