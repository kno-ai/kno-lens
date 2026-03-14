/**
 * Webview entry point — self-contained bundle for VS Code extension.
 * Imports CSS and renders WebviewApp into #root.
 */
import { render } from "preact";
import { WebviewApp } from "./app.js";
import "./styles/main.css";

render(<WebviewApp />, document.getElementById("root")!);
