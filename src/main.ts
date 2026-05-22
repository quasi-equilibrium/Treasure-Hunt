import "./styles.css";
import { TreasureHuntApp } from "./ui/TreasureHuntApp";

const root = document.querySelector<HTMLElement>("#app");

if (!root) {
  throw new Error("App root not found");
}

const app = new TreasureHuntApp(root);
app.start();
