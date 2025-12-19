import { chromeApiClient } from "./chromeApiClient";
import type { ChromeTabGroupingPort } from "../ports/tabGrouping";

export class ChromeTabGroupingAdapter implements ChromeTabGroupingPort {
  constructor(private readonly client = chromeApiClient) {}

  queryTabs(query: chrome.tabs.QueryInfo) {
    return this.client.queryTabs(query);
  }

  queryGroups(query: chrome.tabGroups.QueryInfo) {
    return this.client.queryGroups(query);
  }

  getTabGroup(groupId: number) {
    return this.client.getTabGroup(groupId);
  }

  groupTabs(tabIds: number | number[], groupId?: number) {
    return this.client.groupTabs(tabIds, groupId);
  }

  updateTabGroup(groupId: number, props: chrome.tabGroups.UpdateProperties) {
    return this.client.updateTabGroup(groupId, props);
  }

  removeTabGroup(groupId: number) {
    return this.client.removeTabGroup(groupId);
  }
}

export const chromeTabGroupingAdapter = new ChromeTabGroupingAdapter();
