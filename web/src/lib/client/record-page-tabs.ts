import { initUiTabs } from "./ui-tabs";

type RecordPageTabsOptions = {
  onTabChange?: (tab: string) => void;
};

export function initRecordPageTabs(options: RecordPageTabsOptions = {}) {
  initUiTabs(document, options);
}
