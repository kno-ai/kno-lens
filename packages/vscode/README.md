# kno lens

**See what Claude Code is actually doing.**

AI coding tools read your files, run commands, and edit your code — but you only see the result. kno lens brings observability to AI-assisted development — starting with Claude Code. See every step: what tools ran, what files were touched, what failed, and how each turn unfolded.

![kno lens timeline view — session activity breakdown](https://raw.githubusercontent.com/kno-ai/kno-lens/main/packages/vscode/media/kno-lens-timeline-screenshot-vscode.png)

<table>
<tr>
<td><img src="https://raw.githubusercontent.com/kno-ai/kno-lens/main/packages/vscode/media/kno-lens-screenshot-vscode.png" alt="kno lens live view — turn-by-turn tracking" /></td>
<td><img src="https://raw.githubusercontent.com/kno-ai/kno-lens/main/packages/vscode/media/kno-lens-heatmap-screenshot-vscode.png" alt="kno lens heatmap view — file edits across turns" /></td>
</tr>
</table>

## Three views for different questions

- **Timeline** — see the full session laid out. Edit counts, commands, errors, duration, and token usage per turn. Good for reviewing what happened and spotting patterns.
- **Lens** — follow along as Claude works. Live tool activity, turn-by-turn summaries, elapsed time. Good for monitoring a session in progress.
- **Heatmap** — see which files were edited across every turn. Good for spotting churn, concentration, and scope creep.

All three support search and filtering by activity type.

## Getting started

1. Install the extension
2. Open a workspace where you use Claude Code
3. kno lens connects to your active session automatically

No configuration, no tokens, no accounts. Everything runs locally and read-only.

Use **kno lens: Select Session** to switch sessions. **kno lens: Open Explorer** opens the timeline and heatmap.

## Privacy

kno lens reads Claude Code's local session files on your machine. It never sends data anywhere. Zero telemetry.

## License

MIT
