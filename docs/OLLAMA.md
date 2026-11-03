# Local AI with Ollama

Kinema's AI features (generating pages, sections, components, animations and SVG logos, and
editing a selection from a plain-language request) run on **[Ollama](https://ollama.com)**,
a free app that runs open models on your own computer. Your designs and prompts never leave
your machine, and there is no account or API key.

Kinema works fine without Ollama. Only the **AI** tab needs it.

- [1. Install Ollama](#1-install-ollama)
- [2. Pull a model](#2-pull-a-model)
- [3. Use it in Kinema](#3-use-it-in-kinema)
- [Settings and environment variables](#settings-and-environment-variables)
- [Troubleshooting](#troubleshooting)

---

## 1. Install Ollama

Download it from **[ollama.com/download](https://ollama.com/download)**.

| Platform | How |
|---|---|
| **Windows** | Run `OllamaSetup.exe`. Ollama starts in the background and shows a llama icon in the system tray. |
| **macOS** | Open the download, move **Ollama** to *Applications* and start it. It lives in the menu bar. |
| **Linux** | `curl -fsSL https://ollama.com/install.sh \| sh`. The installer sets up a `systemd` service. |

Check that it works in a terminal:

```bash
ollama --version   # prints the installed version
ollama list        # lists installed models (empty at first)
```

Opening <http://localhost:11434> in a browser should show **"Ollama is running"**.

## 2. Pull a model

Download at least one model with `ollama pull <name>`. Pick a size that fits your
computer. A model needs roughly its download size in free RAM, or in GPU memory to run fast.

| Your hardware | Model size | Examples |
|---|---|---|
| **8 GB RAM**, no dedicated GPU | small, 3–4B | `qwen2.5-coder:3b`, `llama3.2:3b`, `gemma3:4b` |
| **16 GB RAM** or a GPU with 8 GB | medium, 7–8B | `qwen2.5-coder:7b`, `llama3.1:8b`, `qwen2.5vl:7b` (vision) |
| **GPU with 24 GB+**, or Apple silicon with 32 GB+ | large, 14B and up | `qwen2.5-coder:14b`, `qwen2.5-coder:32b`, `gemma3:27b` |

```bash
ollama pull qwen2.5-coder:7b
```

> [!TIP]
> Model names and the best choices change quickly. Browse the
> **[Ollama library](https://ollama.com/library)** for current models. **Coder** and
> **instruct** models are the best fit for HTML/CSS generation. Kinema works with any chat
> model Ollama can run, so try a few. Larger models give better layouts. Smaller ones
> respond faster.

**Vision models** (for example `qwen2.5vl`, `llama3.2-vision` or `gemma3`) can look at
images. Kinema uses them to match the style of a **screenshot** you provide. Without one,
style matching uses your project's existing design instead.

## 3. Use it in Kinema

Open the **AI** tab in the right panel (or press <kbd>Ctrl</kbd>+<kbd>I</kbd>, <kbd>⌘</kbd>+<kbd>I</kbd> on macOS).

- **Automatic detection.** Kinema connects to Ollama and lists every installed model. No
  configuration is needed. If you pull a new model while Kinema is open, refresh the model list in
  the AI tab.
- **Recommended per task.** Each task (**UI generation**, **edits**, **SVG/logos** and
  **animation**) shows a **Recommended** badge on the installed model that suits it best.
  The recommendation considers model family and size, and whether the model handles code and
  vision well. You can switch the model for any task, and Kinema remembers your choice.
- **Style source.** Generate in the style of your current project, a preset style, or start
  fresh. With a vision model you can also match a screenshot.
- **Live preview and one-click undo.** Results stream onto the canvas as they're generated.
  Each AI change is a single undo step, so <kbd>Ctrl</kbd>+<kbd>Z</kbd> reverts all of it.

See the [user guide](USER_GUIDE.md#ai-assistant) for the full AI workflow.

---

## Settings and environment variables

### Server URL

Kinema connects to `http://localhost:11434`, Ollama's default address. To use a different
port or another machine on your network, change the **server URL** in the AI tab's
settings, for example `http://192.168.1.20:11434`.

For another machine to reach Ollama, Ollama on that machine must listen on the network.
Set `OLLAMA_HOST=0.0.0.0` there (see [how to set variables](#how-to-set-ollama-environment-variables))
and allow port 11434 in its firewall. Only do this on a network you trust, because Ollama has
no authentication.

### `OLLAMA_ORIGINS`: browser mode only

The **desktop app never needs this**. Kinema sends AI requests from its main process, so
browser cross-origin (CORS) rules don't apply.

In **browser mode** (`npm run dev:web`), the page calls Ollama directly. Ollama allows
`localhost` and `127.0.0.1` origins by default, so the standard dev server at
`http://localhost:5173` works out of the box. If you open the web build from a different
origin, such as a LAN address or a custom host name, add that origin:

```bash
OLLAMA_ORIGINS="http://192.168.1.10:5173" ollama serve
```

In browser mode the page's security policy only allows connections to `localhost` and
`127.0.0.1`, so the Ollama server must be local. Use the desktop app for a remote server.

### `OLLAMA_KEEP_ALIVE`

Ollama unloads a model after 5 minutes without requests, so the next request waits while the
model loads again. Keep models loaded longer:

```bash
OLLAMA_KEEP_ALIVE=30m   # or -1 to keep models loaded until Ollama stops
```

### `OLLAMA_CONTEXT_LENGTH`

This sets the default context window, which is how much text the model can read and write in one
request. Larger pages and long style descriptions need more, for example `8192` or
`16384`. A larger context uses more memory. See [context length](#output-stops-early-or-ignores-parts-of-the-request).

### How to set Ollama environment variables

Ollama reads these variables when it **starts**, so restart Ollama after changing them.

- **Windows:** quit Ollama from the tray icon. Open *Start → "Edit environment variables
  for your account"*, add the variable, click OK, then start Ollama again. Or in PowerShell:
  `setx OLLAMA_KEEP_ALIVE 30m` (this takes effect for newly started programs).
- **macOS:** `launchctl setenv OLLAMA_KEEP_ALIVE 30m`, then quit and reopen Ollama.
- **Linux (systemd):** run `sudo systemctl edit ollama.service` and add:
  ```ini
  [Service]
  Environment="OLLAMA_KEEP_ALIVE=30m"
  ```
  then run `sudo systemctl daemon-reload && sudo systemctl restart ollama`.
- **Any platform, temporary:** quit the background app and run `ollama serve` in a terminal
  with the variables set, for example `OLLAMA_KEEP_ALIVE=30m ollama serve`.

---

## Troubleshooting

### "Ollama is not running" / Kinema can't connect

- Start Ollama: open the app (Windows, macOS) or run `ollama serve`. On Linux, use
  `sudo systemctl start ollama`.
- Open <http://localhost:11434>. You should see *"Ollama is running"*. If not, Ollama
  isn't listening there.
- If you changed `OLLAMA_HOST` or the port, use the same address as the server URL in Kinema.
- Security software or a VPN client can block local connections. Allow `ollama` and Kinema.

### Model not found

- Run `ollama list` and compare the name **including the tag**: `qwen2.5-coder:7b` and
  `qwen2.5-coder:latest` are different models.
- Pull it: `ollama pull <name>`, then refresh the model list in the AI tab.
- If you selected a model and later deleted it, pick another one for that task.

### Generation is very slow

- Run `ollama ps` while it's generating. The *PROCESSOR* column shows `100% GPU` when the
  model fits in GPU memory. Any CPU share means part of the model runs much slower.
- Use a smaller model, or a smaller quantization of the same model (tags ending in `q4_K_M`
  are a good balance).
- Close other GPU-heavy apps, including games and other AI tools.
- The first request after a pause also loads the model. Set
  [`OLLAMA_KEEP_ALIVE`](#ollama_keep_alive) to avoid reloading.
- Ask for smaller pieces, for example one section instead of a whole page.

### Out of memory / the model crashes or fails to load

- The model is too large for your RAM or GPU memory. Switch to a smaller size (see the
  [table above](#2-pull-a-model)).
- Lower `OLLAMA_CONTEXT_LENGTH`. A bigger context window needs more memory.
- Make sure only one large model is loaded at a time. `ollama ps` shows loaded models and
  `ollama stop <name>` unloads one.

### Output stops early or ignores parts of the request

The request or the answer didn't fit in the model's **context window**, so the model lost the
beginning or stopped writing.

- Raise the context window with `OLLAMA_CONTEXT_LENGTH` (for example `8192` or `16384`), or
  with Kinema's generation options in the AI tab if your version has them, and restart Ollama.
- Generate in smaller steps: one section or component at a time, or select a smaller part
  of the page before an edit.
- Use a larger or newer model, which usually follows long instructions better.

### Results look broken or off-style

- Coder and instruct models produce much cleaner HTML/CSS than general chat models.
- Choose a clear style source, and make your request concrete: content, layout, mood.
- Undo (<kbd>Ctrl</kbd>+<kbd>Z</kbd>) removes the whole AI change in one step, so you can
  try again freely.

Still stuck? [Open an issue](https://github.com/Temp0o/Kinema/issues/new/choose) with your
OS, `ollama --version`, the model name and what you asked for.
