/**
 * Explorer entry point — self-contained bundle for the Explorer WebviewPanel.
 * Imports CSS and renders ExplorerWebviewApp into #root.
 */
import { render } from "preact";
import { ExplorerWebviewApp } from "./explorer/ExplorerApp.js";
import "./styles/explorer.css";

render(<ExplorerWebviewApp />, document.getElementById("root")!);
