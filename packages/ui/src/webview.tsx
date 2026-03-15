/**
 * Webview entry point — self-contained bundle for VS Code extension.
 * Imports CSS and renders WebviewApp into #root.
 */
import { render } from "preact";
import { LensWebviewApp } from "./lens/LensApp.js";
import "./styles/main.css";

render(<LensWebviewApp />, document.getElementById("root")!);
