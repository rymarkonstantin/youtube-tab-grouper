import { MessageClient, defaultMessageClient } from "../../src/shared/messaging/messageClient";
import { MESSAGE_ACTIONS } from "../../src/shared/messageContracts";
import { type ErrorishResponse, handleMessageResponse } from "../../src/shared/messaging/messageResponseHandler";
import type { GroupTabResponse } from "../../src/shared/types";
import { PopupView } from "./PopupView";

const isGuardDisabled = (error: unknown) => typeof error === "string" && /disabled/i.test(error);
type PopupResponse = GroupTabResponse & ErrorishResponse & Record<string, unknown>;

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
        this.view.renderStatus(response, { successMessage: `Grouped as "${response.category}"` });
        this.view.clearCategory();
      } else if (!this.handleGuard(response)) {
        this.view.renderStatus(response, { errorFallback: "Failed to group tab" });
      }
    } catch (error) {
      this.view.renderStatus(error, { errorFallback: "Failed to group tab" });
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
        this.view.renderStatus(response, { successMessage: `Grouped ${count} tabs` });
      } else if (!this.handleGuard(response)) {
        this.view.renderStatus(response, { errorFallback: "Failed to group tabs" });
      }
    } catch (error) {
      this.view.renderStatus(error, { errorFallback: "Failed to group tabs" });
    } finally {
      this.view.setLoading(false);
    }
  }

  private async sendPopupMessage(
    action: (typeof MESSAGE_ACTIONS)[keyof typeof MESSAGE_ACTIONS],
    payload: Record<string, unknown> = {},
    options: { timeoutMs?: number } = {}
  ): Promise<PopupResponse> {
    const { timeoutMs } = options;
    try {
      const response = await this.client.sendMessage(action, payload, { timeoutMs, validateResponsePayload: true });
      return handleMessageResponse<PopupResponse>(action, response, null, {
        timeoutMs,
        validateResponse: true
      });
    } catch (error) {
      return handleMessageResponse<PopupResponse>(action, null, error, {
        timeoutMs,
        validateResponse: false
      });
    }
  }

  private handleGuard(response: PopupResponse) {
    if (response?.success === false && isGuardDisabled(this.getErrorMessage(response))) {
      this.view.setLoading(true);
      this.view.renderStatus(
        { ...response, error: this.getErrorMessage(response) },
        { errorFallback: "Extension is disabled" }
      );
      return true;
    }
    return false;
  }

  private getErrorMessage(response?: PopupResponse) {
    if (!response) return "Unknown error";
    return response.errorEnvelope?.message || response.error || "Unknown error";
  }
}

export const createPopupController = () => new PopupController();
