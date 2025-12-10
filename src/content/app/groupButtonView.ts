import { removeGroupButton, renderGroupButton } from "../dom";

export class GroupButtonView {
  render(onClick?: () => void) {
    return renderGroupButton({ onClick });
  }

  remove() {
    removeGroupButton();
  }
}
