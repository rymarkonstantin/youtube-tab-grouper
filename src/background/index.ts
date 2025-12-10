import { BackgroundApp } from "./controllers/backgroundApp";

const app = new BackgroundApp();

void app.start();

chrome.runtime.onInstalled.addListener(() => {
  void app.start();
});
