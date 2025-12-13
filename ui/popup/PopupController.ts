import { MessageClient, defaultMessageClient } from "../../src/shared/messaging/messageClient";
import { MESSAGE_ACTIONS } from "../../src/shared/messageContracts";
import { handleMessageResponse } from "../../src/shared/messaging/messageResponseHandler";
import type { GroupTabResponse } from "../../src/shared/types";
import { PopupView } from "./PopupView";

const isGuardDisabled = (error: unknown) => typeof error === "string" && /disabled/i.test(error);

export class PopupController {
  private view: PopupView;
  private client: MessageClient;

  constructor(view = new PopupView(), client: MessageClient = defaultMessageClient) {
    this.view = view;
    this.client = client;
  }

  start() {
    this.view.bindGroup(() => this.handleGroup());
    this.view.bindBatch(() => this.handleBatch());
  }

  private async handleGroup() {
    this.view.setLoading(true);
    try {
      const category = this.view.getCategory();
      const response = await this.sendPopupMessage(MESSAGE_ACTIONS.GROUP_TAB, { category });
      if (response?.success) {
        this.view.showNotification(`Grouped as "${response.category}"`, "success");
        this.view.clearCategory();
      } else if (!this.handleGuard(response)) {
        this.view.showNotification(`Error: ${this.formatError(response)}`, "error");
      }
    } catch (error) {
      this.view.showNotification(`Error: ${(error as Error)?.message || "Unknown error"}`, "error");
    } finally {
      this.view.setLoading(false);
    }
  }

  private async handleBatch() {
    this.view.setLoading(true);
    try {
      const response = await this.sendPopupMessage(MESSAGE_ACTIONS.BATCH_GROUP);
      if (response?.success) {
        const count = typeof response.count === "number" ? response.count : Number(response.count) || 0;
        this.view.showNotification(`Grouped ${count} tabs`, "success");
      } else if (!this.handleGuard(response)) {
        this.view.showNotification(`Error: ${this.formatError(response)}`, "error");
      }
    } catch (error) {
      this.view.showNotification(`Error: ${(error as Error)?.message || "Unknown error"}`, "error");
    } finally {
      this.view.setLoading(false);
    }
  }

  private async sendPopupMessage(
    action: (typeof MESSAGE_ACTIONS)[keyof typeof MESSAGE_ACTIONS],
    payload: Record<string, unknown> = {},
    options: { timeoutMs?: number } = {}
  ): Promise<GroupTabResponse & Record<string, unknown>> {
    const { timeoutMs } = options;
    try {
      const response = await this.client.sendMessage(
        action,
        payload,
        { timeoutMs, validateResponsePayload: true }
      );
      return handleMessageResponse<GroupTabResponse & Record<string, unknown>>(
        action,
        response,
        null,
        { timeoutMs, validateResponse: true }
      );
    } catch (error) {
      return handleMessageResponse<GroupTabResponse & Record<string, unknown>>(
        action,
        null,
        error,
        { timeoutMs, validateResponse: false }
      );
    }
  }

  private handleGuard(response: GroupTabResponse) {
    if (response?.success === false && isGuardDisabled(response.error)) {
      this.view.setLoading(true);
      this.view.showNotification(`Error: ${response.error}`, "error");
      return true;
    }
    return false;
  }

  private formatError(response: GroupTabResponse & { errors?: string[] }) {
    if (!response) return "Unknown error";
    const base = response.error || "Unknown error";
    if (Array.isArray(response.errors) && response.errors.length > 0) {
      return `${base} (${response.errors.join("; ")})`;
    }
    return base;
  }
}

export const createPopupController = () => new PopupController();
