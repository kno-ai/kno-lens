# KnoLens

**See what Claude Code is actually doing.**

Claude Code reads files, runs commands, and edits your code — but all you see is the final output. KnoLens shows you every step: what tools ran, what files were touched, what failed, and how each turn unfolded.

![KnoLens timeline view — session activity breakdown](https://raw.githubusercontent.com/kno-ai/kno-lens/main/packages/vscode/media/kno-lens-timeline-screenshot-vscode.png)

<table>
<tr>
<td><img src="https://raw.githubusercontent.com/kno-ai/kno-lens/main/packages/vscode/media/kno-lens-screenshot-vscode.png" alt="KnoLens lens view — live turn-by-turn tracking" /></td>
<td><img src="https://raw.githubusercontent.com/kno-ai/kno-lens/main/packages/vscode/media/kno-lens-heatmap-screenshot-vscode.png" alt="KnoLens heatmap view — file edits across turns" /></td>
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
3. KnoLens connects to your active session automatically

No configuration, no tokens, no accounts. Everything runs locally and read-only.

Use **KnoLens: Select Session** to switch sessions. **KnoLens: Open Explorer** opens the timeline and heatmap.

## Privacy

KnoLens reads Claude Code's local session files on your machine. It never sends data anywhere. Zero telemetry.

## License

MIT
